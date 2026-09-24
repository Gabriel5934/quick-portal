import hashlib
import math
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cielo.models import (
    CieloBank,
    CieloBankAccountType,
    CieloBusiness,
    CieloBusinessActivity,
    CieloDocumentType,
    CieloSubmissionStatus,
)
from cielo.serializers import (
    CieloBusinessCreateSerializer,
    CieloBusinessSummarySerializer,
)
from cielo.services.brasil_api import CieloBrasilApiError
from cielo.services.cielo_api import (
    CieloQuickConfigurationError,
    CieloQuickCredentialsError,
    submit_cielo_seller,
)
from quickportal.models import Business
from quickportal.services.business_access import get_accessible_business_or_404


def _configuration_error_response(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


def _credentials_error_response(exc):
    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


def _brasil_api_error_response(exc):
    response_status = (
        status.HTTP_400_BAD_REQUEST
        if exc.status_code is not None and 400 <= exc.status_code < 500
        else status.HTTP_502_BAD_GATEWAY
    )
    return Response({exc.field: [str(exc)]}, status=response_status)


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


class CieloBusinessView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, business_id):
        business = get_accessible_business_or_404(request.user, business_id)
        seller = get_object_or_404(CieloBusiness, business=business)
        return Response(CieloBusinessSummarySerializer(seller).data)

    def post(self, request, business_id):
        business = get_accessible_business_or_404(request.user, business_id)
        serializer = CieloBusinessCreateSerializer(
            data=request.data, context={"business": business}
        )
        try:
            serializer.is_valid(raise_exception=True)
        except CieloBrasilApiError as exc:
            return _brasil_api_error_response(exc)

        values = serializer.seller_values()
        try:
            with transaction.atomic():
                locked_business = Business.objects.select_for_update().get(pk=business.pk)
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
        except Exception:
            seller.delete()
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

                outcome = submit_cielo_seller(seller)
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
        except CieloQuickConfigurationError as exc:
            return _configuration_error_response(exc)
        except CieloQuickCredentialsError as exc:
            return _credentials_error_response(exc)
        except DjangoValidationError as exc:
            return Response(_django_validation_detail(exc), status=status.HTTP_400_BAD_REQUEST)

        return Response(CieloBusinessSummarySerializer(seller).data)


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
