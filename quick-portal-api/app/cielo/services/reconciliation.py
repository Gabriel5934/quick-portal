import logging

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from cielo.models import (
    CieloBusiness,
    CieloChangeType,
    CieloNotification,
    CieloSubmissionStatus,
)
from cielo.services.cielo_api import get_cielo_configuration, get_cielo_merchant
from cielo.services.notifications import apply_notification_statuses


logger = logging.getLogger(__name__)


def reconcile_unmatched_merchant(merchant_id: str) -> CieloBusiness | None:
    """Link a merchant ID from an unmatched notification to its seller.

    A seller loses its merchant ID when Cielo registers it but Quick never
    reads the response. Notifications only identify the merchant ID, so Cielo
    is asked for that merchant's document, which identifies the seller. On a
    match the seller becomes SENT and every stored notification for the
    merchant is replayed in order. Any failure leaves the seller unchanged.
    """
    try:
        configuration = get_cielo_configuration()
        if merchant_id.lower() == configuration.merchant_id.lower():
            return None
        merchant = get_cielo_merchant(configuration, merchant_id)
    except Exception:
        logger.warning(
            "Could not look up unmatched Cielo merchant %s.", merchant_id, exc_info=True
        )
        return None

    master_merchant_id = merchant.get("masterMerchantId")
    document = merchant.get("documentNumber")
    if (
        not isinstance(master_merchant_id, str)
        or master_merchant_id.lower() != configuration.merchant_id.lower()
    ):
        logger.warning(
            "Unmatched Cielo merchant %s belongs to another master merchant.",
            merchant_id,
        )
        return None
    if not isinstance(document, str) or not document:
        logger.warning("Unmatched Cielo merchant %s has no document.", merchant_id)
        return None

    try:
        with transaction.atomic():
            # Waits for an in-flight retry of the same seller; a retry that
            # obtained a merchant ID no longer matches the filter.
            seller = (
                CieloBusiness.objects.select_for_update()
                .filter(business__document=document, merchant_id__isnull=True)
                .first()
            )
            if seller is None:
                logger.warning(
                    "No seller without a merchant ID matches Cielo merchant %s.",
                    merchant_id,
                )
                return None
            if CieloBusiness.objects.filter(merchant_id=merchant_id).exists():
                logger.warning(
                    "Cielo merchant %s is already linked to another seller.",
                    merchant_id,
                )
                return None

            seller.merchant_id = merchant_id
            seller.status = CieloSubmissionStatus.SENT
            notifications = CieloNotification.objects.filter(
                merchant_id=merchant_id, change_type__in=CieloChangeType.values
            ).order_by("received_at", "pk")
            for notification in notifications:
                apply_notification_statuses(seller, notification)
            seller.full_clean()
            seller.save()
    except (IntegrityError, ValidationError):
        logger.warning(
            "Could not link Cielo merchant %s to its seller.",
            merchant_id,
            exc_info=True,
        )
        return None

    logger.info("Linked Cielo merchant %s to seller %s.", merchant_id, seller.pk)
    return seller
