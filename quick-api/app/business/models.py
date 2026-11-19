"""Businesses and the users that are members of them."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, Uuid, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.business.cnpj import CNPJ_LENGTH
from app.db import Base, UTCDateTime, utc_now


class Business(Base):
    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint(
            f"cnpj = upper(cnpj) AND length(cnpj) = {CNPJ_LENGTH}",
            name="ck_businesses_cnpj_normalized",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Stored normalized (see cnpj.normalize_cnpj).
    cnpj: Mapped[str] = mapped_column(String(CNPJ_LENGTH), unique=True)
    # Inactive businesses cannot log in with their integration credentials.
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Integration client credentials (app.oauth). Both NULL until generated;
    # only the SHA-256 hex digest of the secret is stored.
    client_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    client_secret_hash: Mapped[str | None] = mapped_column(String(64))
    # Embedded in integration access tokens as ``tv`` and stored on integration
    # refresh tokens; bumping it invalidates every integration session.
    token_version: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)


class BusinessMembership(Base):
    """Links a business to each user that may act on it."""

    __tablename__ = "business_membership"

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
