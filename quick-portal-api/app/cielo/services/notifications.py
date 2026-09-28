import logging
from collections.abc import Mapping
from dataclasses import dataclass

from django.db import transaction

from cielo.models import (
    CieloBankAccountStatus,
    CieloBusiness,
    CieloChangeType,
    CieloKycStatus,
    CieloNotification,
    CieloOnboardingStatus,
)


logger = logging.getLogger(__name__)

# Notification statuses are stored in PositiveSmallIntegerField columns.
MAX_STATUS_VALUE = 32767
MERCHANT_ID_MAX_LENGTH = 36

SELLER_STATUS_CHOICES = {
    "kyc_status": CieloKycStatus,
    "bank_account_status": CieloBankAccountStatus,
    "onboarding_status": CieloOnboardingStatus,
}


class CieloNotificationPayloadError(Exception):
    pass


@dataclass(frozen=True)
class ParsedCieloNotification:
    change_type: int
    merchant_id: str
    kyc_status: int | None = None
    bank_account_status: int | None = None
    onboarding_status: int | None = None


def _status_value(value: object, name: str) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not 0 <= value <= MAX_STATUS_VALUE
    ):
        raise CieloNotificationPayloadError(f"{name} must be a non-negative integer.")
    return value


def _merchant_id(data: Mapping, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value or len(value) > MERCHANT_ID_MAX_LENGTH:
        raise CieloNotificationPayloadError(f"Data.{key} is missing or invalid.")
    return value


def _optional_status(value: object, name: str) -> int | None:
    return None if value is None else _status_value(value, name)


def _optional_nested_status(data: Mapping, key: str) -> int | None:
    nested = data.get(key)
    if nested is None:
        return None
    if not isinstance(nested, Mapping):
        raise CieloNotificationPayloadError(f"Data.{key} must be an object.")
    return _optional_status(nested.get("Status"), f"Data.{key}.Status")


def parse_cielo_notification(payload: object) -> ParsedCieloNotification:
    if not isinstance(payload, Mapping):
        raise CieloNotificationPayloadError("The payload must be an object.")
    change_type = _status_value(payload.get("ChangeType"), "ChangeType")
    data = payload.get("Data")
    if not isinstance(data, Mapping):
        raise CieloNotificationPayloadError("Data must be an object.")

    if change_type == CieloChangeType.KYC:
        return ParsedCieloNotification(
            change_type=change_type,
            merchant_id=_merchant_id(data, "SubordinateMerchantId"),
            kyc_status=_status_value(data.get("Status"), "Data.Status"),
        )
    if change_type == CieloChangeType.BANK_ACCOUNT:
        return ParsedCieloNotification(
            change_type=change_type,
            merchant_id=_merchant_id(data, "MerchantId"),
            bank_account_status=_status_value(data.get("Status"), "Data.Status"),
        )
    if change_type == CieloChangeType.ONBOARDING:
        # Each status is optional: an omitted or null status leaves the
        # seller's current value untouched instead of rejecting the payload.
        return ParsedCieloNotification(
            change_type=change_type,
            merchant_id=_merchant_id(data, "SubordinateMerchantId"),
            kyc_status=_optional_nested_status(data, "KycAnalysisInfo"),
            bank_account_status=_optional_nested_status(
                data, "BankAccountValidation"
            ),
            onboarding_status=_optional_status(
                data.get("OnboardingStatus"), "Data.OnboardingStatus"
            ),
        )

    merchant_key = (
        "SubordinateMerchantId" if "SubordinateMerchantId" in data else "MerchantId"
    )
    return ParsedCieloNotification(
        change_type=change_type,
        merchant_id=_merchant_id(data, merchant_key),
    )


def apply_notification_statuses(
    seller: CieloBusiness, notification: CieloNotification
) -> list[str]:
    """Copy the notification's known statuses to the seller without saving.

    Only statuses present in the notification are updated, each with its own
    timestamp. Unlisted values are kept on the notification only, so the seller
    always passes model validation. Returns the changed field names.
    """
    updated_fields = []
    for field, choices in SELLER_STATUS_CHOICES.items():
        value = getattr(notification, field)
        if value is None:
            continue
        if value not in choices.values:
            logger.warning(
                "Cielo notification %s has unlisted %s %s; seller %s keeps %s.",
                notification.pk,
                field,
                value,
                seller.pk,
                getattr(seller, field),
            )
            continue
        setattr(seller, field, value)
        setattr(seller, f"{field}_updated_at", notification.received_at)
        updated_fields += [field, f"{field}_updated_at"]
    return updated_fields


def record_cielo_notification(parsed: ParsedCieloNotification) -> CieloNotification:
    known_change_type = parsed.change_type in CieloChangeType.values
    with transaction.atomic():
        seller = (
            CieloBusiness.objects.select_for_update()
            .filter(merchant_id=parsed.merchant_id)
            .first()
            if known_change_type
            else None
        )
        notification = CieloNotification.objects.create(
            cielo_business=seller,
            change_type=parsed.change_type,
            merchant_id=parsed.merchant_id,
            kyc_status=parsed.kyc_status,
            bank_account_status=parsed.bank_account_status,
            onboarding_status=parsed.onboarding_status,
        )

        if not known_change_type:
            logger.warning(
                "Stored Cielo notification %s with unknown change type %s.",
                notification.pk,
                parsed.change_type,
            )
            return notification
        if seller is None:
            logger.warning(
                "Stored Cielo notification %s for unknown merchant %s.",
                notification.pk,
                parsed.merchant_id,
            )
            return notification

        updated_fields = apply_notification_statuses(seller, notification)
        seller.save(update_fields=["updated_at", *updated_fields])
    return notification
