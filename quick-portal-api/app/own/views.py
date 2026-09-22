from collections.abc import Mapping
from datetime import timedelta

from django.db import transaction
from django.db import IntegrityError
from django.db.models import Q
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework import status

from own.models import (
    OwnActivity,
    OwnBasket,
    OwnBusiness,
    OwnFee,
    OwnPlan,
    OwnRegistrationStatus,
)
from own.serializers import (
    OwnActivitySerializer,
    OwnBusinessSignupSerializer,
    OwnBusinessUpdateSerializer,
    OwnFeeSerializer,
    OwnPlanSerializer,
)
from quickportal.models import BusinessRole, BusinessType
from quickportal.services.brasil_api import BrasilApiError
from quickportal.services.business_access import (
    accessible_businesses,
    effective_business_role,
    get_accessible_business_or_404,
)
from own.services.own_auth import OwnAuthError, get_own_token
from own.services.own_merchant import (
    MerchantRegistrationError,
    register_merchant,
)
from own.services.own_signup import build_own_business_signup_payload


WRITE_ROLES = {BusinessRole.ADMIN, BusinessRole.MANAGER}
PENDING_RETRY_AFTER = timedelta(minutes=5)


class OwnAuthTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = get_own_token()
        except OwnAuthError as exc:
            return Response(
                {"error": "own_auth_failed", "detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        masked = token[:10] + "..." if len(token) > 10 else token
        return Response(
            {
                "status": "authenticated",
                "token_preview": masked,
                "message": "OWN Financial token acquired successfully.",
            },
            status=status.HTTP_200_OK,
        )


def _record_registration_state(own_business, registration_status, error=""):
    """Persist ``registration_status`` and ``error`` for ``own_business``."""
    own_business.registration_status = registration_status
    own_business.registration_error = error
    own_business.full_clean()
    own_business.save(
        update_fields=["registration_status", "registration_error", "updated_at"]
    )


def _submit_registration(own_business):
    """Submit ``own_business`` to OWN and return its response, if successful."""
    payload = build_own_business_signup_payload(own_business)
    try:
        result = register_merchant(payload)
    except OwnAuthError as exc:
        _record_registration_state(
            own_business,
            OwnRegistrationStatus.API_REQUEST_FAILED,
            str(exc),
        )
        return None
    except MerchantRegistrationError as exc:
        registration_status = (
            OwnRegistrationStatus.API_REQUEST_FAILED
            if exc.status_code is not None and 400 <= exc.status_code < 500
            and exc.status_code not in {408, 409}
            else OwnRegistrationStatus.UNKNOWN
        )
        _record_registration_state(own_business, registration_status, str(exc))
        return None

    with transaction.atomic():
        locked_signup = OwnBusiness.objects.select_for_update().get(pk=own_business.pk)
        protocol = result.get("protocolo") if isinstance(result, Mapping) else None
        if protocol:
            locked_signup.core_protocol = str(protocol)
        locked_signup.registration_status = OwnRegistrationStatus.PENDING
        locked_signup.registration_error = ""
        locked_signup.full_clean()
        locked_signup.save(
            update_fields=[
                "core_protocol",
                "registration_status",
                "registration_error",
                "updated_at",
            ]
        )
    own_business.refresh_from_db()
    return result


def _manageable_signup_or_404(user, pk, lock=False):
    """Return signup ``pk`` when ``user`` has a manager or administrator role."""
    queryset = OwnBusiness.objects.select_related(
            "business", "plan", "plan__activity", "plan__basketId"
        ).prefetch_related(
            "plan__fees__fee",
            "partners__attachments",
            "attachments",
        )
    if lock:
        queryset = queryset.select_for_update()
    return get_object_or_404(
        queryset,
        pk=pk,
        business__in=accessible_businesses(user, roles=WRITE_ROLES),
    )


class OwnBusinessSignupView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnBusinessSignupSerializer

    def get_queryset(self):
        """Return OWN signups for businesses this user may manage.

        ``self`` supplies the authenticated request. The returned queryset has
        all relationships needed by list responses and payload construction.
        """
        return self._base_queryset().filter(
            business__in=accessible_businesses(
                self.request.user,
                roles=WRITE_ROLES,
            )
        )

    @staticmethod
    def _base_queryset():
        """Return the optimized, unscoped queryset used by this view."""
        return OwnBusiness.objects.select_related(
            "business", "plan", "plan__activity", "plan__basketId"
        ).prefetch_related(
            "plan__fees",
            "plan__fees__fee",
            "partners__attachments",
            "attachments",
        )

    def create(self, request, *args, **kwargs):
        """Validate, persist, and submit one business signup to OWN.

        ``request`` contains the existing business ID and acquirer-specific
        fields. ``args`` and ``kwargs`` are standard DRF view arguments. The
        response is HTTP 201 whenever the local signup was saved. Its
        registration status records the outcome of the OWN submission.
        """
        business_id = request.data.get("business")
        if business_id is None:
            return Response(
                {"business": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        business = get_accessible_business_or_404(
            request.user,
            business_id,
            roles=WRITE_ROLES,
        )
        _signup_plan_owner_or_404(request.user, business)
        if OwnBusiness.objects.filter(business=business).exists():
            return Response(
                {"business": ["This business already has an OWN signup."]},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.context["business"] = business
        try:
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                own_business = serializer.save(business=business)
        except BrasilApiError as exc:
            error_status = (
                status.HTTP_400_BAD_REQUEST
                if exc.status_code and 400 <= exc.status_code < 500
                else status.HTTP_502_BAD_GATEWAY
            )
            return Response(
                {"postal_code": [str(exc)]},
                status=error_status,
            )
        except DjangoValidationError as exc:
            serializer.cleanup_files()
            detail = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else {"detail": exc.messages}
            )
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            serializer.cleanup_files()
            return Response(
                {"business": ["This business already has an OWN signup."]},
                status=status.HTTP_409_CONFLICT,
            )
        except Exception:
            serializer.cleanup_files()
            raise

        result = _submit_registration(own_business)
        output = self.get_serializer(own_business).data
        if result is not None:
            output["registration"] = result
        return Response(output, status=status.HTTP_201_CREATED)


class OwnBusinessRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Retry failed signup ``pk`` and return its refreshed registration result."""
        with transaction.atomic():
            own_business = _manageable_signup_or_404(request.user, pk, lock=True)
            if own_business.registration_status != OwnRegistrationStatus.API_REQUEST_FAILED:
                return Response(
                    {"detail": "Only failed OWN signups can be retried."},
                    status=status.HTTP_409_CONFLICT,
                )
            _record_registration_state(own_business, OwnRegistrationStatus.PENDING)
        result = _submit_registration(own_business)
        output = OwnBusinessSignupSerializer(
            own_business,
            context={"request": request},
        ).data
        if result is not None:
            output["registration"] = result
        return Response(output)


class OwnBusinessDetailView(APIView):
    """Correct a failed OWN signup before it is retried."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        """Partially update a failed signup owned by an authorized manager."""
        own_business = _manageable_signup_or_404(request.user, pk)
        if own_business.registration_status != OwnRegistrationStatus.API_REQUEST_FAILED:
            return Response(
                {"detail": "Only failed OWN signups can be corrected."},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = OwnBusinessUpdateSerializer(
            own_business,
            data=request.data,
            partial=True,
        )
        try:
            serializer.is_valid(raise_exception=True)
            with transaction.atomic():
                own_business = _manageable_signup_or_404(
                    request.user,
                    pk,
                    lock=True,
                )
                if own_business.registration_status != OwnRegistrationStatus.API_REQUEST_FAILED:
                    return Response(
                        {"detail": "Only failed OWN signups can be corrected."},
                        status=status.HTTP_409_CONFLICT,
                    )
                serializer.instance = own_business
                own_business = serializer.save()
        except BrasilApiError as exc:
            return Response(
                {"postal_code": [str(exc)]},
                status=(
                    status.HTTP_400_BAD_REQUEST
                    if exc.status_code and 400 <= exc.status_code < 500
                    else status.HTTP_502_BAD_GATEWAY
                ),
            )
        except DjangoValidationError as exc:
            serializer.cleanup_files()
            detail = (
                exc.message_dict
                if hasattr(exc, "message_dict")
                else {"detail": exc.messages}
            )
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)
        return Response(OwnBusinessSignupSerializer(own_business).data)


class OwnBusinessReconcileView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        """Resolve unknown signup ``pk`` from an operator-confirmed remote outcome."""
        registered = request.data.get("registered")
        if not isinstance(registered, bool):
            return Response(
                {"registered": ["This field must be a boolean."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            own_business = _manageable_signup_or_404(request.user, pk, lock=True)
            is_stale_pending = (
                own_business.registration_status == OwnRegistrationStatus.PENDING
                and own_business.updated_at <= timezone.now() - PENDING_RETRY_AFTER
            )
            if (
                own_business.registration_status != OwnRegistrationStatus.UNKNOWN
                and not is_stale_pending
            ):
                return Response(
                    {"detail": "Only unknown or interrupted OWN signups require reconciliation."},
                    status=status.HTTP_409_CONFLICT,
                )
            if registered:
                protocol = request.data.get("core_protocol")
                if protocol:
                    own_business.core_protocol = str(protocol)
                own_business.registration_status = OwnRegistrationStatus.REGISTERED
                own_business.registration_error = ""
                own_business.full_clean()
                own_business.save(
                    update_fields=[
                        "core_protocol",
                        "registration_status",
                        "registration_error",
                        "updated_at",
                    ]
                )
            else:
                _record_registration_state(own_business, OwnRegistrationStatus.API_REQUEST_FAILED)
        return Response(
            OwnBusinessSignupSerializer(
                own_business,
                context={"request": request},
            ).data
        )


class OwnFeeListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnFeeSerializer
    pagination_class = None
    queryset = OwnFee.objects.select_related(
        "basketId"
    ).all()


class OwnActivityListView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnActivitySerializer
    pagination_class = None
    queryset = OwnActivity.objects.all()


class OwnBasketAnticipationFeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Return the configured anticipation fee for one OWN basket.

        ``request`` is the authenticated DRF request and ``pk`` is the basket's
        primary key. Returns a DRF ``Response`` containing the basket ID and its
        decimal anticipation fee formatted as a string. A missing basket raises
        ``Http404`` through ``get_object_or_404``.
        """
        basket = get_object_or_404(OwnBasket, pk=pk)
        return Response({
            "basketId": basket.pk,
            "anticipation_fee": format(basket.anticipation_fee, "f"),
        })


def _plan_scope_business(request, *, writing=False):
    """Resolve the business scope for an OWN plan management request.

    ``request`` is the authenticated DRF request whose ``business`` query
    parameter identifies the requested scope. ``writing`` controls whether the
    user must have a role in ``WRITE_ROLES`` and whether store ownership is
    rejected. Returns the requested non-store business; for read requests
    involving a store, returns its accessible parent, or ``None`` when the store
    is parentless. Raises DRF validation or not-found errors for missing or
    inaccessible scopes.
    """
    business_id = request.query_params.get("business")
    if not business_id:
        raise ValidationError({"business": ["This query parameter is required."]})
    business = get_accessible_business_or_404(
        request.user,
        business_id,
        roles=WRITE_ROLES if writing else None,
    )
    if business.type == BusinessType.STORE:
        if writing:
            raise ValidationError({"business": ["A store cannot own plans."]})
        if business.parent_id is not None and not accessible_businesses(request.user).filter(
            pk=business.parent_id
        ).exists():
            raise NotFound()
        return business.parent
    return business


def _signup_plan_owner_or_404(user, business):
    """Return the accessible plan-owner scope used during signup.

    ``user`` is the authenticated user performing the signup and ``business``
    is the existing target business being registered with OWN. Returns the
    target's direct parent, or the target itself when it has no parent, after
    requiring a role in ``WRITE_ROLES``. Raises ``NotFound`` when that owner
    scope is inaccessible.
    """
    owner_id = business.parent_id or business.pk
    return get_accessible_business_or_404(user, owner_id, roles=WRITE_ROLES)


class OwnPlanListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnPlanSerializer

    def get_queryset(self):
        queryset = OwnPlan.objects.select_related(
            "owner_business", "activity", "basketId", "created_by", "updated_by"
        ).prefetch_related("fees")
        signup_business_id = self.request.query_params.get("signup_business")
        if signup_business_id is not None:
            signup_business = get_accessible_business_or_404(
                self.request.user, signup_business_id, roles=WRITE_ROLES
            )
            owner = _signup_plan_owner_or_404(self.request.user, signup_business)
            return queryset.filter(owner_business=owner)

        business = _plan_scope_business(self.request)
        if business is None:
            return queryset.none()
        if business.type == BusinessType.RESELLER:
            return queryset.filter(
                Q(owner_business=business)
                | Q(
                    owner_business__parent=business,
                    owner_business__type=BusinessType.RE_RESELLER,
                )
            )
        return queryset.filter(owner_business=business)

    def create(self, request, *args, **kwargs):
        self._owner_business = _plan_scope_business(request, writing=True)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(
            owner_business=self._owner_business,
            created_by=self.request.user,
            updated_by=self.request.user,
        )


class OwnPlanDetailView(RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OwnPlanSerializer

    def get_queryset(self):
        queryset = OwnPlan.objects.select_related(
            "owner_business", "activity", "basketId", "created_by", "updated_by"
        ).prefetch_related("fees")
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(
            owner_business__in=accessible_businesses(self.request.user).exclude(
                type=BusinessType.STORE
            )
        )

    def _check_write_access(self, instance):
        if effective_business_role(self.request.user, instance.owner_business) not in WRITE_ROLES:
            raise PermissionDenied("You cannot change this plan.")

    def perform_update(self, serializer):
        self._check_write_access(serializer.instance)
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        self._check_write_access(instance)
        instance.delete()
