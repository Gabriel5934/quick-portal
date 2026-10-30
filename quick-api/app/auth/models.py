"""Users and their refresh tokens.

Revoked refresh tokens are kept (``revoked_at`` set) so a replayed rotated-out
token can be recognized. Rows are deleted only once past ``expires_at``.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String, Uuid, text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utc_now


def _str_enum(enum_class: type[enum.Enum], name: str) -> Enum:
    """String enum stored by value, without a native type or CHECK constraint."""
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        values_callable=lambda members: [member.value for member in members],
    )


class RevokedReason(enum.StrEnum):
    # Replaced by a newer token on refresh. Presenting it again is reuse.
    ROTATED = "rotated"
    LOGOUT = "logout"
    # Revoked because a rotated-out token of the same user was replayed.
    REUSE_DETECTED = "reuse_detected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Stored stripped and lowercased (see service.normalize_email).
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    # Embedded in access tokens as ``tv``; bumping it invalidates every access
    # token issued before.
    token_version: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # SHA-256 hex digest of the opaque token; the token itself is never stored.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_reason: Mapped[RevokedReason | None] = mapped_column(
        _str_enum(RevokedReason, "revoked_reason")
    )
    # The token that replaced this one on rotation (audit trail). SET NULL so
    # purging expired rows never trips the self-reference.
    replaced_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("refresh_tokens.id", ondelete="SET NULL")
    )
