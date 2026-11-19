"""Integration credentials and sessions on top of a Session; no HTTP concerns.

Every public function runs its own ``session.begin()`` block, so the session
passed in must not be inside a transaction. Mirrors app.auth.service: the
same opaque refresh tokens, single-use rotation and reuse detection, but
stored in integration_refresh_tokens and tied to a business, whose
token_version is bumped instead of a user's.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.auth.models import RevokedReason
from app.auth.tokens import hash_refresh_token, new_refresh_token
from app.business.models import Business
from app.config import Settings
from app.db import utc_now
from app.oauth.credentials import (
    hash_client_secret,
    new_client_id,
    new_client_secret,
    verify_client_secret,
)
from app.oauth.models import IntegrationRefreshToken
from app.oauth.tokens import create_integration_access_token


class CredentialsExist(Exception):
    """The business already has a client_id; generate never overwrites it."""

    def __init__(self, client_id: str | None) -> None:
        super().__init__("client credentials already exist")
        self.client_id = client_id


class RotationConflict(Exception):
    """No credentials to rotate, or a concurrent rotation won."""


class InvalidClientCredentials(Exception):
    """Unknown client_id, wrong secret or inactive business."""


class InvalidRefreshToken(Exception):
    """Unknown, expired, revoked or outdated integration refresh token."""


class RefreshTokenReused(InvalidRefreshToken):
    """A rotated-out token was replayed; the business's sessions are revoked."""


@dataclass(frozen=True)
class ClientCredentials:
    client_id: str
    client_secret: str


@dataclass(frozen=True)
class IssuedIntegrationSession:
    access_token: str
    refresh_token: str
    refresh_row: IntegrationRefreshToken


def generate_credentials(session: Session, business_id: uuid.UUID) -> ClientCredentials:
    """Sets client_id and the secret hash, only if no client_id exists yet.

    Raises CredentialsExist with the current client_id otherwise.
    """
    client_id = new_client_id()
    client_secret = new_client_secret()
    with session.begin():
        result = session.execute(
            update(Business)
            .where(Business.id == business_id, Business.client_id.is_(None))
            .values(
                client_id=client_id,
                client_secret_hash=hash_client_secret(client_secret),
            )
        )
        if result.rowcount == 0:
            existing = session.scalar(
                select(Business.client_id).where(Business.id == business_id)
            )
            raise CredentialsExist(existing)
    return ClientCredentials(client_id, client_secret)


def rotate_secret(session: Session, business_id: uuid.UUID) -> ClientCredentials:
    """Replaces the secret and bumps token_version, revoking every integration
    access and refresh token of the business.

    The UPDATE is conditional on the hash read just before, so of two
    concurrent rotations only one wins. Raises RotationConflict.
    """
    client_secret = new_client_secret()
    with session.begin():
        current = session.execute(
            select(Business.client_id, Business.client_secret_hash).where(
                Business.id == business_id
            )
        ).one_or_none()
        if current is None or current.client_id is None:
            raise RotationConflict
        if current.client_secret_hash is None:
            raise RotationConflict
        result = session.execute(
            update(Business)
            .where(
                Business.id == business_id,
                Business.client_secret_hash == current.client_secret_hash,
            )
            .values(
                client_secret_hash=hash_client_secret(client_secret),
                token_version=Business.token_version + 1,
            )
        )
        if result.rowcount == 0:
            raise RotationConflict
    return ClientCredentials(current.client_id, client_secret)


def authenticate(session: Session, client_id: str, client_secret: str) -> Business:
    """Returns the active business, or raises InvalidClientCredentials."""
    with session.begin():
        business = session.scalar(
            select(Business).where(Business.client_id == client_id)
        )
    secret_hash = business.client_secret_hash if business is not None else None
    # Always hashes, so an unknown client_id takes as long as a wrong secret.
    if not verify_client_secret(client_secret, secret_hash):
        raise InvalidClientCredentials
    assert business is not None  # noqa: S101 (narrowing for type checkers)
    if not business.is_active:
        raise InvalidClientCredentials
    return business


def _new_refresh_row(
    business: Business, settings: Settings, now: datetime
) -> tuple[str, IntegrationRefreshToken]:
    raw = new_refresh_token()
    row = IntegrationRefreshToken(
        business_id=business.id,
        token_hash=hash_refresh_token(raw),
        token_version=business.token_version,
        expires_at=now + timedelta(seconds=settings.refresh_token_ttl_seconds),
        created_at=now,
    )
    return raw, row


def issue_session(
    session: Session,
    business: Business,
    settings: Settings,
    now: datetime | None = None,
) -> IssuedIntegrationSession:
    """Issues an access and refresh token for an authenticated business.

    Raises InvalidClientCredentials when, once the write lock is held, the
    secret that was verified is no longer current or the business was
    deactivated (a rotation committed between authenticate and this call).
    """
    now = now or utc_now()
    verified_hash = business.client_secret_hash
    raw, row = _new_refresh_row(business, settings, now)
    with session.begin():
        session.add(row)
        session.flush()  # the INSERT takes SQLite's write lock
        # Re-read under that lock: a rotation or reuse detection may have
        # changed the business since it was loaded.
        session.refresh(business)
        if (
            not business.is_active
            or business.client_secret_hash is None
            or business.client_secret_hash != verified_hash
        ):
            raise InvalidClientCredentials  # rolls the INSERT back
        row.token_version = business.token_version
    return IssuedIntegrationSession(
        create_integration_access_token(business, settings, now), raw, row
    )


def _find_refresh_token(
    session: Session, token_hash: str
) -> IntegrationRefreshToken | None:
    return session.scalar(
        select(IntegrationRefreshToken).where(
            IntegrationRefreshToken.token_hash == token_hash
        )
    )


def _revoke_if_unrevoked(
    session: Session, row_id: int, reason: RevokedReason, now: datetime
) -> bool:
    """Conditional UPDATE; False when another transaction revoked it first."""
    result = session.execute(
        update(IntegrationRefreshToken)
        .where(
            IntegrationRefreshToken.id == row_id,
            IntegrationRefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now, revoked_reason=reason)
    )
    return result.rowcount == 1


def _usable_business(session: Session, row: IntegrationRefreshToken) -> Business | None:
    """The row's business, if active, with credentials, and still on the
    token_version the row was issued under."""
    business = session.get(Business, row.business_id)
    if business is None:
        return None
    session.refresh(business)  # latest token_version, under the write lock
    if (
        not business.is_active
        or business.client_secret_hash is None
        or business.token_version != row.token_version
    ):
        return None
    return business


def revoke_all_for_business(
    session: Session, business_id: uuid.UUID, now: datetime
) -> None:
    """Revokes every unrevoked integration refresh token and invalidates the
    business's integration access tokens. Runs inside the caller's
    transaction."""
    session.execute(
        update(IntegrationRefreshToken)
        .where(
            IntegrationRefreshToken.business_id == business_id,
            IntegrationRefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now, revoked_reason=RevokedReason.REUSE_DETECTED)
    )
    session.execute(
        update(Business)
        .where(Business.id == business_id)
        .values(token_version=Business.token_version + 1)
    )


def rotate_refresh(
    session: Session, raw_token: str, settings: Settings, now: datetime | None = None
) -> IssuedIntegrationSession:
    """Swaps a valid integration refresh token for a new one plus an access
    token.

    Raises InvalidRefreshToken, or RefreshTokenReused after committing the
    revocation of all the business's integration sessions when a rotated-out
    token is replayed.
    """
    now = now or utc_now()
    reuse_detected = False
    issued: IssuedIntegrationSession | None = None

    with session.begin():
        row = _find_refresh_token(session, hash_refresh_token(raw_token))
        if row is None or row.expires_at <= now:
            raise InvalidRefreshToken
        reason = row.revoked_reason
        if row.revoked_at is None:
            if _revoke_if_unrevoked(session, row.id, RevokedReason.ROTATED, now):
                business = _usable_business(session, row)
                if business is None:
                    raise InvalidRefreshToken  # rolls the revocation back
                raw, new_row = _new_refresh_row(business, settings, now)
                session.add(new_row)
                session.flush()
                row.replaced_by_id = new_row.id
                issued = IssuedIntegrationSession(
                    create_integration_access_token(business, settings, now),
                    raw,
                    new_row,
                )
            else:
                # Lost a race: a concurrent refresh revoked the row after it
                # was read. Its reason decides what happens next.
                reason = session.scalar(
                    select(IntegrationRefreshToken.revoked_reason).where(
                        IntegrationRefreshToken.id == row.id
                    )
                )

        if issued is None:
            if reason is not RevokedReason.ROTATED:
                raise InvalidRefreshToken
            current_version = session.scalar(
                select(Business.token_version).where(Business.id == row.business_id)
            )
            # A token from before a secret rotation or an earlier reuse
            # detection is already dead with its whole generation; replaying
            # it must not revoke the sessions issued since.
            if current_version != row.token_version:
                raise InvalidRefreshToken
            revoke_all_for_business(session, row.business_id, now)
            reuse_detected = True

    # Raised only after the block above committed; raising inside it would
    # roll the revocation back.
    if reuse_detected:
        raise RefreshTokenReused
    assert issued is not None  # noqa: S101 (narrowing for type checkers)
    return issued


def purge_expired(session: Session, now: datetime | None = None) -> int:
    """Deletes integration refresh tokens past expires_at, revoked or not."""
    now = now or utc_now()
    with session.begin():
        result = session.execute(
            delete(IntegrationRefreshToken).where(
                IntegrationRefreshToken.expires_at < now
            )
        )
    return result.rowcount
