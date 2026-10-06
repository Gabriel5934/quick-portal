import logging
from collections.abc import Mapping
from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.db import transaction

from cielo.models import (
    CieloBankAccountStatus,
    CieloBusiness,
    CieloChangeType,
    CieloKycStatus,
    CieloOnboardingNotification,
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


class CieloOnboardingNotificationPayloadError(Exception):
    pass


@dataclass(frozen=True)
class ParsedCieloOnboardingNotification:
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
        raise CieloOnboardingNotificationPayloadError(f"{name} must be a non-negative integer.")
    return value


def _merchant_id(data: Mapping, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value or len(value) > MERCHANT_ID_MAX_LENGTH:
        raise CieloOnboardingNotificationPayloadError(f"Data.{key} is missing or invalid.")
    return value


def _optional_status(value: object, name: str) -> int | None:
    return None if value is None else _status_value(value, name)


def _optional_nested_status(data: Mapping, key: str) -> int | None:
    nested = data.get(key)
    if nested is None:
        return None
    if not isinstance(nested, Mapping):
        raise CieloOnboardingNotificationPayloadError(f"Data.{key} must be an object.")
    return _optional_status(nested.get("Status"), f"Data.{key}.Status")


def parse_cielo_onboarding_notification(payload: object) -> ParsedCieloOnboardingNotification:
    if not isinstance(payload, Mapping):
        raise CieloOnboardingNotificationPayloadError("The payload must be an object.")
    change_type = _status_value(payload.get("ChangeType"), "ChangeType")
    data = payload.get("Data")
    if not isinstance(data, Mapping):
        raise CieloOnboardingNotificationPayloadError("Data must be an object.")

    if change_type == CieloChangeType.KYC:
        return ParsedCieloOnboardingNotification(
            change_type=change_type,
            merchant_id=_merchant_id(data, "SubordinateMerchantId"),
            kyc_status=_status_value(data.get("Status"), "Data.Status"),
        )
    if change_type == CieloChangeType.BANK_ACCOUNT:
        return ParsedCieloOnboardingNotification(
            change_type=change_type,
            merchant_id=_merchant_id(data, "MerchantId"),
            bank_account_status=_status_value(data.get("Status"), "Data.Status"),
        )
    if change_type == CieloChangeType.ONBOARDING:
        # Each status is optional: an omitted or null status leaves the
        # seller's current value untouched instead of rejecting the payload.
        return ParsedCieloOnboardingNotification(
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
    return ParsedCieloOnboardingNotification(
        change_type=change_type,
        merchant_id=_merchant_id(data, merchant_key),
    )


def record_cielo_onboarding_notification(parsed: ParsedCieloOnboardingNotification) -> CieloOnboardingNotification:
    known_change_type = parsed.change_type in CieloChangeType.values
    with transaction.atomic():
        seller = (
            CieloBusiness.objects.select_for_update()
            .filter(merchant_id=parsed.merchant_id)
            .first()
            if known_change_type
            else None
        )
        notification = CieloOnboardingNotification.objects.create(
            cielo_business=seller,
            change_type=parsed.change_type,
            merchant_id=parsed.merchant_id,
            kyc_status=parsed.kyc_status,
            bank_account_status=parsed.bank_account_status,
            onboarding_status=parsed.onboarding_status,
        )

        if not known_change_type:
            logger.warning(
                "Stored Cielo onboarding notification %s with unknown change type %s.",
                notification.pk,
                parsed.change_type,
            )
            return notification
        if seller is None:
            logger.warning(
                "Stored Cielo onboarding notification %s for unknown merchant %s.",
                notification.pk,
                parsed.merchant_id,
            )
            return notification

        # Only known statuses present in the notification are updated, each
        # with its own timestamp. Unlisted values are kept on the notification
        # only, so the seller always passes model validation.
        updated_fields = ["updated_at"]
        for field, choices in SELLER_STATUS_CHOICES.items():
            value = getattr(parsed, field)
            if value is None:
                continue
            if value not in choices.values:
                logger.warning(
                    "Cielo onboarding notification %s has unlisted %s %s; seller %s keeps %s.",
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
        # The notification is kept even if the seller fails validation, so it
        # is never lost to a Cielo retry that would fail the same way.
        try:
            seller.full_clean(validate_unique=False)
        except ValidationError:
            logger.error(
                "Cielo onboarding notification %s not applied: seller %s failed validation.",
                notification.pk,
                seller.pk,
                exc_info=True,
            )
            return notification
        seller.save(update_fields=updated_fields)
    return notification
