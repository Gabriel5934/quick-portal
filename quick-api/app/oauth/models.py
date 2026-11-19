"""Integration refresh tokens.

Kept in their own table, apart from users' refresh_tokens, so a user refresh
token can never be redeemed as an integration one or the other way around.
Like those, revoked rows are kept so a replayed rotated-out token can be
recognized, and rows are deleted only once past ``expires_at``.
"""

import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.auth.models import RevokedReason
from app.db import Base, UTCDateTime, utc_now


class IntegrationRefreshToken(Base):
    __tablename__ = "integration_refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 hex digest of the opaque token; the token itself is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    # The business's token_version when issued. A secret rotation or a reuse
    # detection bumps the business's version, which makes this token unusable.
    token_version: Mapped[int]
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_reason: Mapped[RevokedReason | None] = mapped_column(
        Enum(
            RevokedReason,
            name="revoked_reason",
            native_enum=False,
            values_callable=lambda members: [member.value for member in members],
        )
    )
    replaced_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("integration_refresh_tokens.id", ondelete="SET NULL")
    )
