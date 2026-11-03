"""Seller onboarding and lookup on top of a Session and a CieloClient; no HTTP
concerns.

``onboard`` runs its own ``session.begin()`` block, so the session passed in
must not be inside a transaction. ``list_sellers`` only reads, so it runs in
whatever transaction the session is in (or autobegins one) and leaves ending
it to the caller.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.cielo.client import CieloClient
from app.cielo.models import CieloSeller, CieloSellerMembership
from app.cielo.schemas import CieloSellerCreated, OnboardIn

logger = logging.getLogger(__name__)


class SellerNotSaved(Exception):
    """Cielo created the seller but saving it failed. The ERROR log line has
    the Cielo Id and DocumentNumber to recover it from."""


def onboard(
    session: Session, cielo: CieloClient, user_id: uuid.UUID, seller: OnboardIn
) -> CieloSellerCreated:
    """Creates the seller at Cielo, then saves it and the user's membership.

    Raises CieloError when Cielo fails (nothing is saved) and SellerNotSaved
    when Cielo succeeded but the save did not.
    """
    created = cielo.onboard_seller(seller)
    try:
        save_seller(session, user_id, created)
    except Exception as exc:
        # The only record of the seller is at Cielo now. Log just what is
        # needed to recover it: not the payload, and not ``exc`` itself, whose
        # message can include the SQL parameters.
        logger.error(
            "Cielo seller %s (document number %s) was onboarded but could not "
            "be saved (%s); recover it manually",
            created.id,
            created.document_number,
            type(exc).__name__,
        )
        raise SellerNotSaved from exc
    return created


def save_seller(
    session: Session, user_id: uuid.UUID, seller: CieloSellerCreated
) -> None:
    """Upserts the seller by Id and links it to the user (idempotent).

    Onboarding an Id that already exists overwrites its document and adds the
    user's membership next to any existing ones. Single statements (SQLite
    upserts), so concurrent saves of one Id cannot collide on the primary key.
    """
    values = {
        "id": seller.id,
        "document_number": seller.document_number,
        "document_type": seller.document_type,
    }
    upsert_seller = insert(CieloSeller).values(values)
    upsert_seller = upsert_seller.on_conflict_do_update(
        index_elements=[CieloSeller.id],
        set_={
            "document_number": upsert_seller.excluded.document_number,
            "document_type": upsert_seller.excluded.document_type,
        },
    )
    add_membership = (
        insert(CieloSellerMembership)
        .values(seller_id=seller.id, user_id=user_id)
        .on_conflict_do_nothing()
    )
    with session.begin():
        session.execute(upsert_seller)
        session.execute(add_membership)


def list_sellers(session: Session, user_id: uuid.UUID) -> list[CieloSeller]:
    """The sellers the user has a membership on, oldest membership first.

    Access is direct only: no membership, no seller. Seller id breaks ties
    between memberships created at the same instant.
    """
    query = (
        select(CieloSeller)
        .join(CieloSellerMembership, CieloSellerMembership.seller_id == CieloSeller.id)
        .where(CieloSellerMembership.user_id == user_id)
        .order_by(CieloSellerMembership.created_at, CieloSeller.id)
    )
    return list(session.scalars(query))
