import hashlib
import hmac
import logging
import math
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cielo.models import (
    CieloBank,
    CieloBankAccountType,
    CieloBusiness,
    CieloBusinessActivity,
    CieloDocumentType,
    CieloPlan,
    CieloSubmissionStatus,
    CieloTransaction,
)
from cielo.serializers import (
    DUPLICATE_PLAN_NAME_MESSAGE,
    CieloBusinessCreateSerializer,
    CieloBusinessSummarySerializer,
    CieloPlanSerializer,
    CieloPlanSummarySerializer,
    CieloTransactionSerializer,
)
from cielo.services.cielo_api import (
    CieloQuickConfigurationError,
    CieloQuickCredentialsError,
    CieloQuickPreTransmissionError,
    submit_cielo_seller,
)
from cielo.services.onboarding_notifications import (
    CieloOnboardingNotificationPayloadError,
    parse_cielo_onboarding_notification,
    record_cielo_onboarding_notification,
)
from cielo.services.transaction_notifications import (
    CieloTransactionNotificationPayloadError,
    parse_cielo_transaction_notification,
    record_cielo_transaction_notification,
)
from quickportal.models import Business, BusinessType
from quickportal.services.brasil_api import BrasilApiError
from quickportal.services.business_access import get_accessible_business_or_404


logger = logging.getLogger(__name__)

CIELO_WEBHOOK_TOKEN_HEADER = "X-Cielo-Webhook-Token"

def _configuration_error_response(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


def _credentials_error_response(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


def _brasil_api_error_response(exc):
    field = {
        "cnpj": "document_number",
        "cep": "address.zip_code",
    }.get(exc.resource, "business")
    message = {
        "connection": "Não foi possível consultar a BrasilAPI.",
        "http_error": "Não foi possível consultar os dados informados na BrasilAPI.",
        "invalid_response": "A BrasilAPI retornou uma resposta inválida.",
    }.get(exc.reason, str(exc))
    response_status = (
        status.HTTP_400_BAD_REQUEST
        if exc.status_code is not None and 400 <= exc.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return Response({field: [message]}, status=response_status)


def _django_validation_detail(exc):
    if hasattr(exc, "message_dict"):
        return exc.message_dict
    return {"detail": exc.messages}


def _lock_document_number(document_number: str) -> None:
    if connection.vendor != "postgresql":
        return
    lock_id = int.from_bytes(
        hashlib.blake2b(document_number.encode(), digest_size=8).digest(),
        byteorder="big",
        signed=True,
    )
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_id])


def _apply_outcome(seller, outcome) -> None:
    seller.status = outcome.status
    seller.merchant_id = outcome.merchant_id
    if outcome.submitted_at is not None:
        seller.last_submitted_at = outcome.submitted_at


def _scope_business(request):
    """Return the business selected in the drawer, from the ``business`` query
    parameter. Any role on the business is enough."""
    business_id = request.query_params.get("business")
    if not business_id:
        raise ValidationError({"business": ["This query parameter is required."]})
    return get_accessible_business_or_404(request.user, business_id)


def _scope_plans(request):
    """Return the plans owned by the scope business; other plans are not found."""
    return CieloPlan.objects.filter(owner_business=_scope_business(request))


class CieloPlanListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CieloPlanSerializer
        return CieloPlanSummarySerializer

    def get_queryset(self):
        archived = self.request.query_params.get("archived", "false")
        if archived not in {"true", "false"}:
            raise ValidationError({"archived": ['Must be "true" or "false".']})
        plans = _scope_plans(self.request)
        if archived == "true":
            return plans.filter(archived_at__isnull=False).order_by("-archived_at", "-id")
        return plans.filter(archived_at__isnull=True).order_by("-created_at", "-id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method == "POST":
            # OPTIONS builds a POST serializer before create() sets the owner.
            context["owner_business"] = getattr(self, "_owner_business", None)
        return context

    def create(self, request, *args, **kwargs):
        self._owner_business = _scope_business(request)
        if self._owner_business.type == BusinessType.STORE:
            raise ValidationError({"business": ["A store cannot own plans."]})
        try:
            return super().create(request, *args, **kwargs)
        except DjangoValidationError as exc:
            return Response(_django_validation_detail(exc), status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            # A concurrent request created a plan with the same name.
            if CieloPlan.objects.filter(
                owner_business=self._owner_business, name=request.data.get("name")
            ).exists():
                return Response(
                    {"name": [DUPLICATE_PLAN_NAME_MESSAGE]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise

    def perform_create(self, serializer):
        serializer.save(
            owner_business=self._owner_business,
            created_by=self.request.user,
        )


class CieloPlanDetailView(RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CieloPlanSerializer

    def get_queryset(self):
        return _scope_plans(self.request).prefetch_related("rates")


class CieloPlanArchiveView(APIView):
    permission_classes = [IsAuthenticated]
    archive = True

    def post(self, request, pk):
        plans = _scope_plans(request)
        with transaction.atomic():
            plan = get_object_or_404(plans.select_for_update(), pk=pk)
            if (plan.archived_at is not None) == self.archive:
                detail = (
                    "This plan is already archived."
                    if self.archive
                    else "This plan is not archived."
                )
                return Response({"detail": detail}, status=status.HTTP_409_CONFLICT)
            plan.archived_at = timezone.now() if self.archive else None
            plan.archived_by = request.user if self.archive else None
            plan.save(update_fields=["archived_at", "archived_by"])
        return Response(CieloPlanSerializer(plan).data)


class CieloPlanUnarchiveView(CieloPlanArchiveView):
    archive = False


class CieloBusinessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, business_id):
        business = get_accessible_business_or_404(request.user, business_id)
        seller = get_object_or_404(CieloBusiness, business=business)
        return Response(CieloBusinessSummarySerializer(seller).data)

    def post(self, request, business_id):
        business = get_accessible_business_or_404(request.user, business_id)
        serializer = CieloBusinessCreateSerializer(
            data=request.data,
            context={"business": business, "plan_owner": _scope_business(request)},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except BrasilApiError as exc:
            return _brasil_api_error_response(exc)

        values = serializer.seller_values()
        try:
            with transaction.atomic():
                locked_business = Business.objects.select_for_update().get(pk=business.pk)
                # Lock the plan so it cannot be archived while the seller is
                # saved; full_clean() rejects a plan that is already archived.
                values["plan"] = CieloPlan.objects.select_for_update().get(
                    pk=values["plan"].pk
                )
                _lock_document_number(locked_business.document)
                if CieloBusiness.objects.filter(business=locked_business).exists():
                    return Response(
                        {"business": ["This business already has a Cielo seller."]},
                        status=status.HTTP_409_CONFLICT,
                    )
                if CieloBusiness.objects.filter(
                    business__document=locked_business.document
                ).exists():
                    return Response(
                        {"business": ["This document already belongs to a Cielo seller."]},
                        status=status.HTTP_409_CONFLICT,
                    )

                seller = CieloBusiness(
                    business=locked_business,
                    status=CieloSubmissionStatus.INTERVENTION_REQUIRED,
                    **values,
                )
                seller.full_clean()
                seller.save()
        except DjangoValidationError as exc:
            return Response(_django_validation_detail(exc), status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"detail": "This business or document already has a Cielo seller."},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            outcome = submit_cielo_seller(seller)
        except CieloQuickConfigurationError as exc:
            seller.delete()
            return _configuration_error_response(exc)
        except CieloQuickCredentialsError as exc:
            seller.delete()
            return _credentials_error_response(exc)
        except CieloQuickPreTransmissionError:
            seller.delete()
            raise
        except Exception:
            CieloBusiness.objects.filter(pk=seller.pk).update(
                status=CieloSubmissionStatus.INTERVENTION_REQUIRED,
                merchant_id=None,
                updated_at=timezone.now(),
            )
            raise

        try:
            with transaction.atomic():
                seller = CieloBusiness.objects.select_for_update().get(pk=seller.pk)
                _apply_outcome(seller, outcome)
                seller.full_clean()
                seller.save(
                    update_fields=[
                        "status",
                        "merchant_id",
                        "last_submitted_at",
                        "updated_at",
                    ]
                )
        except (DjangoValidationError, IntegrityError):
            seller.refresh_from_db()
            return Response(
                CieloBusinessSummarySerializer(seller).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            CieloBusinessSummarySerializer(seller).data,
            status=status.HTTP_201_CREATED,
        )


class CieloBusinessRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, business_id):
        if request.data:
            return Response(
                {"non_field_errors": ["The retry request body must be empty."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        business = get_accessible_business_or_404(request.user, business_id)
        try:
            with transaction.atomic():
                seller = get_object_or_404(
                    CieloBusiness.objects.select_for_update(), business=business
                )
                if seller.status != CieloSubmissionStatus.FAILED:
                    return Response(
                        {"detail": "Only failed Cielo sellers can be retried."},
                        status=status.HTTP_409_CONFLICT,
                    )

                now = timezone.now()
                retry_available_at = (
                    seller.last_submitted_at
                    + timedelta(seconds=settings.CIELO_RETRY_COOLDOWN_SECONDS)
                    if seller.last_submitted_at is not None
                    else None
                )
                if retry_available_at is not None and retry_available_at > now:
                    retry_after_seconds = max(
                        1, math.ceil((retry_available_at - now).total_seconds())
                    )
                    response = Response(
                        {
                            "detail": "Aguarde antes de tentar novamente.",
                            "retry_after_seconds": retry_after_seconds,
                            "retry_available_at": retry_available_at,
                        },
                        status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )
                    response["Retry-After"] = str(retry_after_seconds)
                    return response

                # Validate before contacting Cielo so an invalid row cannot send
                # a request that is then rolled back without starting the cooldown.
                seller.full_clean()
                outcome = submit_cielo_seller(seller)
                _apply_outcome(seller, outcome)
                seller.save(
                    update_fields=[
                        "status",
                        "merchant_id",
                        "last_submitted_at",
                        "updated_at",
                    ]
                )
        except CieloQuickConfigurationError as exc:
            return _configuration_error_response(exc)
        except CieloQuickCredentialsError as exc:
            return _credentials_error_response(exc)
        except DjangoValidationError as exc:
            return Response(_django_validation_detail(exc), status=status.HTTP_400_BAD_REQUEST)

        return Response(CieloBusinessSummarySerializer(seller).data)


def _check_cielo_webhook(request, required_settings=()):
    """Return an error response unless the request carries the configured
    ``X-Cielo-Webhook-Token``. ``required_settings`` names further settings that
    must be configured before the notification is processed."""
    expected_token = settings.CIELO_WEBHOOK_TOKEN
    names = ("CIELO_WEBHOOK_TOKEN", *required_settings)
    if any(
        not isinstance(value, str) or not value.strip()
        for value in (getattr(settings, name) for name in names)
    ):
        logger.error(
            "Cielo notification rejected: %s is not configured.", " or ".join(names)
        )
        return Response(
            {"detail": "Cielo notifications are not configured."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    received_token = request.headers.get(CIELO_WEBHOOK_TOKEN_HEADER, "")
    if not hmac.compare_digest(received_token.encode(), expected_token.encode()):
        logger.warning("Cielo notification rejected: missing or invalid token.")
        return Response(
            {"detail": "Invalid notification token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    return None


class CieloOnboardingNotificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        error_response = _check_cielo_webhook(request, ("CIELO_MERCHANT_ID",))
        if error_response is not None:
            return error_response

        payload = request.data
        if (
            isinstance(payload, dict)
            and payload.get("MasterMerchantId") != settings.CIELO_MERCHANT_ID
        ):
            logger.warning("Cielo notification rejected: MasterMerchantId mismatch.")
            return Response(
                {"detail": "Unknown master merchant."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            parsed = parse_cielo_onboarding_notification(payload)
        except CieloOnboardingNotificationPayloadError as exc:
            logger.warning("Cielo notification rejected: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        record_cielo_onboarding_notification(parsed)
        return Response({})


class CieloTransactionNotificationView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        error_response = _check_cielo_webhook(request)
        if error_response is not None:
            return error_response

        try:
            parsed = parse_cielo_transaction_notification(request.data)
        except CieloTransactionNotificationPayloadError as exc:
            logger.warning("Cielo transaction notification rejected: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        # Answered with 200 even when the lookup fails: a resent notification
        # would fail the same way.
        record_cielo_transaction_notification(parsed)
        return Response({})


class CieloTransactionPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class CieloTransactionListView(ListAPIView):
    """Transactions of the selected business's own Cielo seller, without child
    businesses. Only a successful lookup links a transaction to a seller."""

    permission_classes = [IsAuthenticated]
    serializer_class = CieloTransactionSerializer
    pagination_class = CieloTransactionPagination

    def get_queryset(self):
        business = _scope_business(self.request)
        return CieloTransaction.objects.filter(
            cielo_business__business=business
        ).order_by("-received_date", "-id")


class CieloChoicesView(APIView):
    permission_classes = [IsAuthenticated]
    choices = ()

    def get(self, request):
        return Response(
            [{"value": value, "label": label} for value, label in self.choices]
        )


class CieloDocumentTypeChoicesView(CieloChoicesView):
    choices = CieloDocumentType.choices


class CieloBankAccountTypeChoicesView(CieloChoicesView):
    choices = CieloBankAccountType.choices


class CieloBusinessActivityChoicesView(CieloChoicesView):
    choices = CieloBusinessActivity.choices


class CieloBankChoicesView(CieloChoicesView):
    choices = CieloBank.choices
