"""Turns a raw Cielo notification body into the row that stores it.

Parsing never raises. A body that is not a JSON object, or whose ChangeType is
missing or unhandled, becomes a ``CieloNotificationUnhandled`` row. Inside a
typed notification, any field that fails to parse is stored as null; the raw
body is always kept.
"""

import json
import uuid
from enum import Enum, IntEnum
from typing import Any

from app.cielo.enums import (
    CieloBank,
    CieloBankAccountType,
    CieloDocumentType,
    CieloMerchantType,
    CieloOnboardingBankAccountValidationStatus,
    CieloOnboardingChangeType,
    CieloOnboardingGlobalStatus,
    CieloOnboardingKycStatus,
    CieloTransactionChangeType,
)
from app.cielo.models import (
    CieloNotification,
    CieloNotificationOnboardingBankAccountValidation,
    CieloNotificationOnboardingGlobal,
    CieloNotificationOnboardingKyc,
    CieloNotificationTransaction,
    CieloNotificationUnhandled,
)


def _load_object(body: bytes) -> dict[str, Any] | None:
    try:
        payload = json.loads(body)
    except (ValueError, RecursionError):
        # ValueError covers invalid JSON and undecodable bytes.
        return None
    return payload if isinstance(payload, dict) else None


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _int(value: Any) -> int | None:
    """JSON integers, or strings of ASCII digits; never booleans or floats."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isascii() and value.isdigit():
        return int(value)
    return None


def _int_enum[E: IntEnum](enum_class: type[E], value: Any) -> E | None:
    number = _int(value)
    if number is None:
        return None
    try:
        return enum_class(number)
    except ValueError:
        return None


def _str_enum[E: Enum](enum_class: type[E], value: Any) -> E | None:
    """Matches member values case-insensitively (Cielo sends "Subordinate")."""
    if not isinstance(value, str):
        return None
    for member in enum_class:
        if member.value.upper() == value.upper():
            return member
    return None


def _uuid(value: Any) -> uuid.UUID | None:
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _string(value: Any, max_length: int) -> str | None:
    if isinstance(value, str) and len(value) <= max_length:
        return value
    return None


def _transaction(
    body: bytes, payload: dict[str, Any], change_type: CieloTransactionChangeType
) -> CieloNotificationTransaction:
    return CieloNotificationTransaction(
        body=body,
        payment_id=_uuid(payload.get("PaymentId")),
        change_type=change_type,
        recurrent_payment_id=_uuid(payload.get("RecurrentPaymentId")),
    )


def _onboarding_kyc(
    body: bytes, payload: dict[str, Any]
) -> CieloNotificationOnboardingKyc:
    data = _object(payload.get("Data"))
    return CieloNotificationOnboardingKyc(
        body=body,
        change_type=CieloOnboardingChangeType.KYC,
        master_merchant_id=_uuid(payload.get("MasterMerchantId")),
        subordinate_merchant_id=_uuid(data.get("SubordinateMerchantId")),
        status=_int_enum(CieloOnboardingKycStatus, data.get("Status")),
    )


def _onboarding_bank_account_validation(
    body: bytes, payload: dict[str, Any]
) -> CieloNotificationOnboardingBankAccountValidation:
    data = _object(payload.get("Data"))
    return CieloNotificationOnboardingBankAccountValidation(
        body=body,
        change_type=CieloOnboardingChangeType.BANK_ACCOUNT_VALIDATION,
        master_merchant_id=_uuid(payload.get("MasterMerchantId")),
        merchant_id=_uuid(data.get("MerchantId")),
        merchant_type=_str_enum(CieloMerchantType, data.get("MerchantType")),
        status=_int_enum(
            CieloOnboardingBankAccountValidationStatus,
            data.get("Status"),
        ),
        bank_code=_str_enum(CieloBank, data.get("CompeCode")),
        bank_account_type=_int_enum(CieloBankAccountType, data.get("BankAccountType")),
        account_number=_string(data.get("AccountNumber"), 15),
        account_digit=_string(data.get("AccountDigit"), 5),
        agency_number=_string(data.get("AgencyNumber"), 15),
        agency_digit=_string(data.get("AgencyDigit"), 5),
        document_number=_string(data.get("DocumentNumber"), 15),
        document_type=_int_enum(CieloDocumentType, data.get("DocumentType")),
    )


def _onboarding_global(
    body: bytes, payload: dict[str, Any]
) -> CieloNotificationOnboardingGlobal:
    data = _object(payload.get("Data"))
    return CieloNotificationOnboardingGlobal(
        body=body,
        change_type=CieloOnboardingChangeType.GLOBAL,
        master_merchant_id=_uuid(payload.get("MasterMerchantId")),
        subordinate_merchant_id=_uuid(data.get("SubordinateMerchantId")),
        status=_int_enum(CieloOnboardingGlobalStatus, data.get("OnboardingStatus")),
        kyc_status=_int_enum(
            CieloOnboardingKycStatus,
            _object(data.get("KycAnalysisInfo")).get("Status"),
        ),
        bank_account_validation_status=_int_enum(
            CieloOnboardingBankAccountValidationStatus,
            _object(data.get("BankAccountValidation")).get("Status"),
        ),
    )


def parse_notification(body: bytes) -> CieloNotification:
    """Builds the (unsaved) row for a notification, routed by ChangeType."""
    payload = _load_object(body)
    if payload is None:
        return CieloNotificationUnhandled(body=body)

    change_type = _int(payload.get("ChangeType"))
    if change_type is None:
        return CieloNotificationUnhandled(body=body)

    if change_type in CieloTransactionChangeType:
        return _transaction(body, payload, CieloTransactionChangeType(change_type))
    if change_type == CieloOnboardingChangeType.KYC:
        return _onboarding_kyc(body, payload)
    if change_type == CieloOnboardingChangeType.BANK_ACCOUNT_VALIDATION:
        return _onboarding_bank_account_validation(body, payload)
    if change_type == CieloOnboardingChangeType.GLOBAL:
        return _onboarding_global(body, payload)
    return CieloNotificationUnhandled(body=body)
