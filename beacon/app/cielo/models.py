"""Tables that store Cielo notifications.

Every notification is stored as its own row with the raw request bytes in
``body``. Parsed fields are nullable because a malformed notification must
still be stored.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, LargeBinary, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

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
from app.db import Base, IntEnumType, utc_now


def _str_enum(enum_class: type[enum.Enum], name: str) -> Enum:
    """String enum stored by value, without a native type or CHECK constraint."""
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )


class CieloNotification(Base):
    __abstract__ = True

    # sort_order puts id first and the shared columns last in each table.
    id: Mapped[int] = mapped_column(primary_key=True, sort_order=-1)
    body: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, sort_order=1)
    received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=utc_now, sort_order=1
    )


class CieloNotificationUnhandled(CieloNotification):
    __tablename__ = "cielo_notification_unhandled"


class CieloNotificationTransaction(CieloNotification):
    __tablename__ = "cielo_notification_transaction"

    payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    change_type: Mapped[CieloTransactionChangeType | None] = mapped_column(
        IntEnumType(CieloTransactionChangeType)
    )
    recurrent_payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class CieloNotificationOnboardingGlobal(CieloNotification):
    __tablename__ = "cielo_notification_onboarding_global"

    change_type: Mapped[CieloOnboardingChangeType | None] = mapped_column(
        IntEnumType(CieloOnboardingChangeType)
    )
    master_merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    subordinate_merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[CieloOnboardingGlobalStatus | None] = mapped_column(
        IntEnumType(CieloOnboardingGlobalStatus)
    )
    kyc_status: Mapped[CieloOnboardingKycStatus | None] = mapped_column(
        IntEnumType(CieloOnboardingKycStatus)
    )
    bank_account_validation_status: Mapped[
        CieloOnboardingBankAccountValidationStatus | None
    ] = mapped_column(IntEnumType(CieloOnboardingBankAccountValidationStatus))


class CieloNotificationOnboardingKyc(CieloNotification):
    __tablename__ = "cielo_notification_onboarding_kyc"

    change_type: Mapped[CieloOnboardingChangeType | None] = mapped_column(
        IntEnumType(CieloOnboardingChangeType)
    )
    master_merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    subordinate_merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[CieloOnboardingKycStatus | None] = mapped_column(
        IntEnumType(CieloOnboardingKycStatus)
    )


class CieloNotificationOnboardingBankAccountValidation(CieloNotification):
    __tablename__ = "cielo_notification_onboarding_bank_account_validation"

    change_type: Mapped[CieloOnboardingChangeType | None] = mapped_column(
        IntEnumType(CieloOnboardingChangeType)
    )
    master_merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    merchant_type: Mapped[CieloMerchantType | None] = mapped_column(
        _str_enum(CieloMerchantType, "cielo_merchant_type")
    )
    status: Mapped[CieloOnboardingBankAccountValidationStatus | None] = mapped_column(
        IntEnumType(CieloOnboardingBankAccountValidationStatus)
    )
    bank_code: Mapped[CieloBank | None] = mapped_column(
        _str_enum(CieloBank, "cielo_bank")
    )
    bank_account_type: Mapped[CieloBankAccountType | None] = mapped_column(
        IntEnumType(CieloBankAccountType)
    )
    account_number: Mapped[str | None] = mapped_column(String(15))
    account_digit: Mapped[str | None] = mapped_column(String(5))
    agency_number: Mapped[str | None] = mapped_column(String(15))
    agency_digit: Mapped[str | None] = mapped_column(String(5))
    document_number: Mapped[str | None] = mapped_column(String(15))
    document_type: Mapped[CieloDocumentType | None] = mapped_column(
        IntEnumType(CieloDocumentType)
    )
