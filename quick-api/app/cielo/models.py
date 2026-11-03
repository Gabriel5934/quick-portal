"""Sellers onboarded through Cielo and the users that own them.

Only what is needed to find a seller again is stored: Cielo's ID, the document
and the fancy name. The onboarding payload itself (contact, bank account,
address) is never persisted.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, IntEnumType, UTCDateTime, utc_now

# Cielo's DocumentNumber limit (digits only, as Cielo returns it).
DOCUMENT_NUMBER_MAX_LENGTH = 14
# Cielo's FancyName limit.
FANCY_NAME_MAX_LENGTH = 50


class CieloDocumentType(enum.IntEnum):
    """Cielo responses send DocumentType as these integers; requests use the
    member names ("CPF" / "CNPJ")."""

    CPF = 1
    CNPJ = 2


class CieloSeller(Base):
    __tablename__ = "cielo_sellers"
    __table_args__ = (
        CheckConstraint(
            "document_type IN (1, 2)", name="ck_cielo_sellers_document_type"
        ),
    )

    # Cielo's seller (merchant) ID. Onboarding the same ID again overwrites
    # the row.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    # Not unique: Cielo decides whether a document may be onboarded twice.
    document_number: Mapped[str] = mapped_column(String(DOCUMENT_NUMBER_MAX_LENGTH))
    document_type: Mapped[CieloDocumentType] = mapped_column(
        IntEnumType(CieloDocumentType)
    )
    # The trade name sent when onboarding. The default only fills sellers saved
    # before the column existed.
    fancy_name: Mapped[str] = mapped_column(
        String(FANCY_NAME_MAX_LENGTH), server_default=""
    )


class CieloSellerMembership(Base):
    """Links a seller to each user that onboarded it."""

    __tablename__ = "cielo_seller_membership"

    seller_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cielo_sellers.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
