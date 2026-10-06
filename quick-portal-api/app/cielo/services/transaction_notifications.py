import copy
import logging
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from cielo.models import (
    CieloBusiness,
    CieloTransaction,
    CieloTransactionChangeType,
    CieloTransactionLookupStatus,
    CieloTransactionNotification,
)
from cielo.services.cielo_api import (
    CieloLookupError,
    is_cielo_uuid,
    lookup_cielo_transaction,
)


logger = logging.getLogger(__name__)

# Change types whose notification triggers a lookup of the transaction.
LOOKUP_CHANGE_TYPES = frozenset(
    {
        CieloTransactionChangeType.PAYMENT_STATUS,
        CieloTransactionChangeType.PARTIAL_CANCELLATION,
    }
)

# Limits of the CieloTransaction columns the lookup fills.
MAX_SMALL_INTEGER = 32767
MAX_BIG_INTEGER = 9223372036854775807
PAYMENT_TYPE_MAX_LENGTH = 40
BRAND_MAX_LENGTH = 30
PROVIDER_MAX_LENGTH = 30
LOOKUP_ERROR_MAX_LENGTH = 255

# Cielo sends ReceivedDate in São Paulo local time without a zone.
CIELO_TIMEZONE = ZoneInfo("America/Sao_Paulo")
CIELO_DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
CARD_NODES = ("CreditCard", "DebitCard")


class CieloTransactionNotificationPayloadError(Exception):
    pass


@dataclass(frozen=True)
class ParsedCieloTransactionNotification:
    payment_id: str
    change_type: int


@dataclass(frozen=True)
class CieloTransactionLookupValues:
    merchant_id: str
    installments: int
    amount: int
    received_date: datetime
    payment_type: str
    brand: str | None
    provider: str | None
    status: int
    raw_response: dict


def _is_integer(value: object, minimum: int, maximum: int) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, int)
        and minimum <= value <= maximum
    )


def _is_text(value: object, max_length: int) -> bool:
    return isinstance(value, str) and 0 < len(value) <= max_length


def parse_cielo_transaction_notification(
    payload: object,
) -> ParsedCieloTransactionNotification:
    if not isinstance(payload, Mapping):
        raise CieloTransactionNotificationPayloadError("The payload must be an object.")
    payment_id = payload.get("PaymentId")
    if not is_cielo_uuid(payment_id):
        raise CieloTransactionNotificationPayloadError(
            "PaymentId must be a UUID string."
        )
    change_type = payload.get("ChangeType")
    if not _is_integer(change_type, 0, MAX_SMALL_INTEGER):
        raise CieloTransactionNotificationPayloadError(
            "ChangeType must be a non-negative integer."
        )
    return ParsedCieloTransactionNotification(
        payment_id=payment_id, change_type=change_type
    )


def _invalid(field: str) -> CieloLookupError:
    return CieloLookupError(f"Invalid response: {field}")


def _card_brand(payment: Mapping) -> str | None:
    for node in CARD_NODES:
        card = payment.get(node)
        if isinstance(card, Mapping) and card.get("Brand") is not None:
            brand = card["Brand"]
            if not _is_text(brand, BRAND_MAX_LENGTH):
                raise _invalid(f"Payment.{node}.Brand")
            return brand
    return None


def sanitize_lookup_response(response: Mapping, brand: str | None) -> dict:
    """Drop the customer and card data, keeping the card brand."""
    sanitized = copy.deepcopy(dict(response))
    sanitized.pop("Customer", None)
    payment = dict(sanitized["Payment"])
    for node in CARD_NODES:
        payment.pop(node, None)
    if brand is not None:
        payment["Brand"] = brand
    sanitized["Payment"] = payment
    return sanitized


def parse_lookup_response(
    response: Mapping, payment_id: str
) -> CieloTransactionLookupValues:
    payment = response.get("Payment")
    if not isinstance(payment, Mapping):
        raise _invalid("Payment")
    if not is_cielo_uuid(payment.get("PaymentId")) or UUID(
        payment["PaymentId"]
    ) != UUID(payment_id):
        raise _invalid("Payment.PaymentId")
    merchant_id = response.get("MerchantId")
    if not is_cielo_uuid(merchant_id):
        raise _invalid("MerchantId")
    amount = payment.get("Amount")
    if not _is_integer(amount, 0, MAX_BIG_INTEGER):
        raise _invalid("Payment.Amount")
    status = payment.get("Status")
    if not _is_integer(status, 0, MAX_SMALL_INTEGER):
        raise _invalid("Payment.Status")
    payment_type = payment.get("Type")
    if not _is_text(payment_type, PAYMENT_TYPE_MAX_LENGTH):
        raise _invalid("Payment.Type")
    try:
        received_date = timezone.make_aware(
            datetime.strptime(payment.get("ReceivedDate"), CIELO_DATETIME_FORMAT),
            CIELO_TIMEZONE,
        )
    except (TypeError, ValueError) as exc:
        raise _invalid("Payment.ReceivedDate") from exc

    # Optional fields: a present but unusable value fails the lookup instead of
    # storing a wrong value or failing on save.
    installments = payment.get("Installments")
    if installments is None:
        installments = 1
    elif not _is_integer(installments, 1, MAX_SMALL_INTEGER):
        raise _invalid("Payment.Installments")
    provider = payment.get("Provider")
    if provider is not None and not _is_text(provider, PROVIDER_MAX_LENGTH):
        raise _invalid("Payment.Provider")
    brand = _card_brand(payment)

    return CieloTransactionLookupValues(
        merchant_id=merchant_id,
        installments=installments,
        amount=amount,
        received_date=received_date,
        payment_type=payment_type,
        brand=brand,
        provider=provider,
        status=status,
        raw_response=sanitize_lookup_response(response, brand),
    )


def _apply_lookup(cielo_transaction: CieloTransaction, looked_up_at: datetime) -> None:
    values = parse_lookup_response(
        lookup_cielo_transaction(cielo_transaction.payment_id),
        cielo_transaction.payment_id,
    )
    # Accepted risk: the seller is matched by the top-level MerchantId.
    seller = CieloBusiness.objects.filter(merchant_id=values.merchant_id).first()
    if seller is None:
        logger.warning(
            "Cielo transaction %s belongs to unknown merchant %s.",
            cielo_transaction.pk,
            values.merchant_id,
        )
    for field, value in vars(values).items():
        setattr(cielo_transaction, field, value)
    cielo_transaction.cielo_business = seller
    cielo_transaction.lookup_status = CieloTransactionLookupStatus.SUCCESS
    cielo_transaction.last_lookup_at = looked_up_at
    cielo_transaction.lookup_error = ""
    cielo_transaction.save()


def refresh_cielo_transaction(transaction_pk: int) -> None:
    """Look the transaction up at Cielo and store its current state.

    A failed lookup keeps every previous lookup field and records only the
    failure. The row stays locked during the lookup so two lookups of the same
    payment cannot overwrite each other out of order.
    """
    with transaction.atomic():
        cielo_transaction = CieloTransaction.objects.select_for_update().get(
            pk=transaction_pk
        )
        looked_up_at = timezone.now()
        try:
            with transaction.atomic():
                _apply_lookup(cielo_transaction, looked_up_at)
            return
        except CieloLookupError as exc:
            reason = str(exc)
            logger.warning(
                "Cielo transaction %s lookup failed: %s", transaction_pk, reason
            )
        except Exception:
            reason = "Unexpected error"
            logger.exception("Cielo transaction %s lookup failed.", transaction_pk)
        # Update only the failure fields: the instance may hold values from a
        # lookup that failed while being saved.
        CieloTransaction.objects.filter(pk=transaction_pk).update(
            lookup_status=CieloTransactionLookupStatus.FAILED,
            last_lookup_at=looked_up_at,
            lookup_error=reason[:LOOKUP_ERROR_MAX_LENGTH],
            updated_at=timezone.now(),
        )


def record_cielo_transaction_notification(
    parsed: ParsedCieloTransactionNotification,
) -> CieloTransactionNotification:
    """Store the notification and, for a lookup change type, refresh its
    transaction. The notification is committed before the lookup, so it is
    kept whatever happens during the lookup."""
    needs_lookup = parsed.change_type in LOOKUP_CHANGE_TYPES
    with transaction.atomic():
        if needs_lookup:
            # The unique payment_id makes concurrent notifications for the same
            # payment share one row.
            cielo_transaction, _ = CieloTransaction.objects.get_or_create(
                payment_id=parsed.payment_id
            )
        else:
            cielo_transaction = CieloTransaction.objects.filter(
                payment_id=parsed.payment_id
            ).first()
        notification = CieloTransactionNotification.objects.create(
            transaction=cielo_transaction,
            payment_id=parsed.payment_id,
            change_type=parsed.change_type,
        )

    if needs_lookup:
        refresh_cielo_transaction(cielo_transaction.pk)
    return notification
