from collections.abc import Mapping

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from quickportal.models import (
    Business,
    BusinessColorPreference,
    BusinessMembership,
    BusinessRole,
    BusinessType,
    RecurringFee,
)
from quickportal.serializers import (
    BusinessReadSerializer,
    BusinessColorPreferenceSerializer,
    BusinessMembershipReadSerializer,
    BusinessMembershipWriteSerializer,
    BusinessWriteSerializer,
    EmailTokenObtainPairSerializer,
    RecurringFeeSerializer,
    UserCreateSerializer,
)
from quickportal.services.brasil_api import BrasilApiError
from quickportal.services.business_access import (
    accessible_businesses,
    get_accessible_business_or_404,
    has_business_role,
)


def _brasil_api_error_response(exc: BrasilApiError) -> Response:
    if exc.status_code and 400 <= exc.status_code < 500:
        return Response(
            {"error": f"invalid_{exc.resource or 'brasil_api_resource'}", "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(
        {"error": "brasil_api_failed", "detail": str(exc)},
        status=status.HTTP_502_BAD_GATEWAY,
    )


def _get_object_or_none(model, pk):
    try:
        return model.objects.get(pk=pk)
    except model.DoesNotExist:
        return None


WRITE_ROLES = {BusinessRole.ADMIN, BusinessRole.MANAGER}


def _require_business_role(user, business, allowed_roles):
    if not has_business_role(user, business, allowed_roles):
        raise PermissionDenied()


class UserRegistrationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class BusinessPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class BusinessListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """List businesses accessible to the authenticated user.

        Only businesses with a direct membership are listed. ``request`` may
        provide ``document`` and case-insensitive ``name`` query parameters.
        Results use ``BusinessPagination`` and return ``count``, ``next``,
        ``previous``, and ``results``.

        Returns a DRF ``Response`` containing the paginated business data.
        """
        businesses = accessible_businesses(request.user).order_by("id")
        if document := request.query_params.get("document"):
            businesses = businesses.filter(document=document)
        if name := request.query_params.get("name"):
            businesses = businesses.filter(name__icontains=name)
        paginator = BusinessPagination()
        page = paginator.paginate_queryset(businesses, request)
        serializer = BusinessReadSerializer(
            page,
            many=True,
            context={"request": request, "business_ids": [item.id for item in page]},
        )
        return Response({
            "count": paginator.page.paginator.count,
            "next": paginator.get_next_link(),
            "previous": paginator.get_previous_link(),
            "results": serializer.data,
        })

    def post(self, request):
        """Create a business from ``request.data``.

        Any authenticated user can create a business, which must be a store
        without a parent; the creator becomes its admin. BrasilAPI validation
        failures are translated to API errors. Returns a DRF ``Response`` with
        the created business and HTTP 201.
        """
        # Checked before validation so a rejected request skips BrasilAPI.
        # Non-mapping bodies are left to the serializer, which rejects them.
        data = request.data
        if isinstance(data, Mapping) and (
            data.get("type") != BusinessType.STORE
            or data.get("parent") is not None
        ):
            raise ValidationError(
                {"type": ["New businesses must be stores without a parent."]}
            )
        serializer = BusinessWriteSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            # A concurrent request can register the same document after
            # validation; report it like any other duplicate.
            try:
                with transaction.atomic():
                    business = serializer.save()
                    BusinessMembership.objects.create(
                        user=request.user, business=business, role=BusinessRole.ADMIN
                    )
            except IntegrityError:
                document = serializer.validated_data["document"]
                if not Business.objects.filter(document=document).exists():
                    raise
                raise ValidationError({
                    "document": [
                        Business._meta.get_field("document").error_messages["unique"]
                    ]
                })
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class BusinessDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_object(self, user, pk):
        """Return business ``pk`` when accessible to ``user``, otherwise raise 404."""
        return get_accessible_business_or_404(user, pk)

    def get(self, request, pk):
        """Return business ``pk`` when it is accessible to ``request.user``.

        ``pk`` is the business path parameter. No request body is used.
        Inaccessible or missing businesses return the scoped not-found error;
        otherwise the returned DRF ``Response`` contains the business data.
        """
        business = self._get_object(request.user, pk)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def put(self, request, pk):
        """Fully update accessible business ``pk`` from ``request.data``.

        The user needs a write role, with admin-level checks for hierarchy
        changes. Managed CNPJ data may be validated through BrasilAPI. Returns
        a DRF ``Response`` containing the updated business.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, WRITE_ROLES)
        serializer = BusinessWriteSerializer(business, data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            self._authorize_hierarchy_change(request, business, serializer)
            business = serializer.save()
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def patch(self, request, pk):
        """Partially update accessible business ``pk`` from ``request.data``.

        The user needs a write role, with admin-level checks for hierarchy
        changes. Only supplied fields are updated. Returns a DRF ``Response``
        containing the updated business.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, WRITE_ROLES)
        serializer = BusinessWriteSerializer(business, data=request.data, partial=True)
        try:
            serializer.is_valid(raise_exception=True)
            self._authorize_hierarchy_change(request, business, serializer)
            business = serializer.save()
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)
        return Response(
            BusinessReadSerializer(
                business,
                context={"request": request, "business_ids": [business.id]},
            ).data
        )

    def delete(self, request, pk):
        """Delete accessible business ``pk`` for an administrator.

        Returns HTTP 204 on success or HTTP 409 when protected children prevent
        deletion. Missing access raises the normal scoped not-found or
        permission response.
        """
        business = self._get_object(request.user, pk)
        _require_business_role(request.user, business, {BusinessRole.ADMIN})
        try:
            business.delete()
        except ProtectedError:
            return Response(
                {"detail": "The business cannot be deleted while it has child businesses."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _authorize_hierarchy_change(request, business, serializer):
        """Authorize hierarchy changes validated by ``serializer`` for ``business``.

        ``request`` supplies the acting user. The method returns ``None`` when
        no hierarchy change is requested or authorization succeeds, and raises
        permission/not-found exceptions for unauthorized target relationships.
        """
        new_type = serializer.validated_data.get("type", business.type)
        new_parent = serializer.validated_data.get("parent", business.parent)
        if new_type == business.type and new_parent == business.parent:
            return
        _require_business_role(request.user, business, {BusinessRole.ADMIN})
        if new_parent is None:
            if not request.user.is_superuser:
                raise PermissionDenied()
            return
        accessible_parent = get_accessible_business_or_404(request.user, new_parent.pk)
        _require_business_role(
            request.user, accessible_parent, {BusinessRole.ADMIN}
        )


class BusinessColorPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, pk):
        """Set the authenticated user's color preference for business ``pk``.

        The business path parameter must be accessible to the user, and
        ``request.data.color`` must be a valid ``BusinessColor`` choice. The
        preference is created or updated for that user/business pair. Returns
        a DRF ``Response`` containing the saved ``color``.
        """
        business = get_accessible_business_or_404(request.user, pk)
        serializer = BusinessColorPreferenceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preference, _ = BusinessColorPreference.objects.update_or_create(
            user=request.user,
            business=business,
            defaults={"color": serializer.validated_data["color"]},
        )
        return Response({"color": preference.color})


class RecurringFeeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, owner_id):
        """List paginated fees for accessible recurring-fee owner ``owner_id``.

        ``request`` supplies authentication and pagination values. Returns a
        paginated DRF response; inaccessible or invalid owners raise the
        scoped not-found or permission exception.
        """
        owner = get_accessible_business_or_404(request.user, owner_id)
        fees = (
            RecurringFee.objects.filter(owner=owner)
            .select_related("owner", "created_by")
        )
        paginator = BusinessPagination()
        page = paginator.paginate_queryset(fees, request)
        return paginator.get_paginated_response(
            RecurringFeeSerializer(
                page, many=True, context={"request": request, "owner": owner}
            ).data
        )

    def post(self, request, owner_id):
        """Create a fee for ``owner_id`` from ``request.data``.

        Returns the serialized fee with HTTP 201. Invalid data raises a
        validation error, while missing owners or insufficient write access
        raise the scoped not-found or permission exception.
        """
        owner = get_accessible_business_or_404(request.user, owner_id)
        _require_business_role(request.user, owner, {BusinessRole.ADMIN})
        serializer = RecurringFeeSerializer(
            data=request.data, context={"request": request, "owner": owner}
        )
        serializer.is_valid(raise_exception=True)
        recurring_fee = serializer.save()
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class RecurringFeeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _get_object(owner, pk):
        """Return fee record ``pk`` belonging to recurring-fee ``owner``.

        ``NotFound`` is raised when the record does not belong to the supplied
        owner.
        """
        try:
            return RecurringFee.objects.select_related("owner", "created_by").get(
                owner=owner, pk=pk
            )
        except RecurringFee.DoesNotExist as exc:
            raise NotFound() from exc

    def get(self, request, owner_id, pk):
        """Return fee ``pk`` for accessible owner ``owner_id`` and ``request`` user."""
        owner = get_accessible_business_or_404(request.user, owner_id)
        recurring_fee = self._get_object(owner, pk)
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data
        )

    def patch(self, request, owner_id, pk):
        """Partially update fee ``pk`` for writable owner ``owner_id``.

        ``request.data`` supplies changes. Returns the updated serialized fee;
        invalid data, missing records, and insufficient access raise their
        standard DRF errors.
        """
        owner = get_accessible_business_or_404(request.user, owner_id)
        _require_business_role(request.user, owner, {BusinessRole.ADMIN})
        recurring_fee = self._get_object(owner, pk)
        serializer = RecurringFeeSerializer(
            recurring_fee,
            data=request.data,
            partial=True,
            context={"request": request, "owner": owner},
        )
        serializer.is_valid(raise_exception=True)
        recurring_fee = serializer.save()
        return Response(
            RecurringFeeSerializer(
                recurring_fee, context={"request": request, "owner": owner}
            ).data
        )

    def delete(self, request, owner_id, pk):
        """Delete fee ``pk`` for writable owner ``owner_id`` and return HTTP 204."""
        owner = get_accessible_business_or_404(request.user, owner_id)
        _require_business_role(request.user, owner, {BusinessRole.ADMIN})
        self._get_object(owner, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BusinessMembershipListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, business_id):
        business = self._get_admin_business(request.user, business_id)
        memberships = business.memberships.select_related("user").order_by("id")
        return Response(BusinessMembershipReadSerializer(memberships, many=True).data)

    def post(self, request, business_id):
        """Grant ``request.data.role`` on ``business_id`` to the user registered
        with ``request.data.email``. Returns the membership with HTTP 201."""
        business = self._get_admin_business(request.user, business_id)
        serializer = BusinessMembershipWriteSerializer(
            data=request.data, context={"business": business}
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save(business=business)
        return Response(
            BusinessMembershipReadSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _get_admin_business(user, business_id):
        business = get_accessible_business_or_404(user, business_id)
        _require_business_role(user, business, {BusinessRole.ADMIN})
        return business


class BusinessMembershipDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, business_id, pk):
        business = BusinessMembershipListCreateView._get_admin_business(
            request.user, business_id
        )
        membership = self._get_membership(business, pk)
        serializer = BusinessMembershipWriteSerializer(
            membership,
            data=request.data,
            partial=True,
            context={"business": business},
        )
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data.get("role", membership.role)
        with transaction.atomic():
            self._protect_final_admin(membership, new_role)
            membership = serializer.save()
        return Response(BusinessMembershipReadSerializer(membership).data)

    def delete(self, request, business_id, pk):
        business = BusinessMembershipListCreateView._get_admin_business(
            request.user, business_id
        )
        membership = self._get_membership(business, pk)
        if membership.user_id == request.user.id:
            raise PermissionDenied("Você não pode revogar o seu próprio acesso.")
        with transaction.atomic():
            self._protect_final_admin(membership, None)
            membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _get_membership(business, pk):
        try:
            return business.memberships.select_related("user").get(pk=pk)
        except BusinessMembership.DoesNotExist as exc:
            raise NotFound() from exc

    @staticmethod
    def _protect_final_admin(membership, new_role):
        if membership.role != BusinessRole.ADMIN or new_role == BusinessRole.ADMIN:
            return
        memberships = BusinessMembership.objects.select_for_update().filter(
            business=membership.business
        )
        has_other_admin = any(
            item.pk != membership.pk and item.role == BusinessRole.ADMIN
            for item in memberships
        )
        if not has_other_admin:
            raise ValidationError(
                {"role": "The final admin cannot be removed or demoted."}
            )
