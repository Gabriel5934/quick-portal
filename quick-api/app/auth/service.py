"""Auth logic on top of a Session; no HTTP concerns.

Every public function except ``revoke_all_for_user`` runs its own
``session.begin()`` block, so the session passed in must not be inside a
transaction.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import RefreshToken, RevokedReason, User
from app.auth.passwords import hash_password, verify_dummy, verify_password
from app.auth.tokens import create_access_token, hash_refresh_token, new_refresh_token
from app.config import Settings
from app.db import utc_now


class EmailTaken(Exception):
    pass


class InvalidCredentials(Exception):
    pass


class InvalidRefreshToken(Exception):
    """Unknown, expired, logged out or otherwise unusable refresh token."""


class RefreshTokenReused(InvalidRefreshToken):
    """A rotated-out token was replayed; the user's tokens are now revoked."""


@dataclass(frozen=True)
class IssuedSession:
    access_token: str
    refresh_token: str
    refresh_row: RefreshToken


def normalize_email(email: str) -> str:
    return email.strip().lower()


def register(session: Session, email: str, password: str) -> User:
    user = User(email=normalize_email(email), password_hash=hash_password(password))
    try:
        with session.begin():
            session.add(user)
    except IntegrityError as exc:
        raise EmailTaken from exc
    return user


def authenticate(session: Session, email: str, password: str) -> User:
    """Returns the active user, or raises InvalidCredentials for any failure."""
    with session.begin():
        user = session.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        verify_dummy(password)  # same timing as a wrong password
        raise InvalidCredentials
    if not verify_password(password, user.password_hash) or not user.is_active:
        raise InvalidCredentials
    return user


def _new_refresh_row(
    user_id: uuid.UUID, settings: Settings, now: datetime
) -> tuple[str, RefreshToken]:
    raw = new_refresh_token()
    row = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(raw),
        expires_at=now + timedelta(seconds=settings.refresh_token_ttl_seconds),
        created_at=now,
    )
    return raw, row


def issue_session(
    session: Session, user: User, settings: Settings, now: datetime | None = None
) -> IssuedSession:
    now = now or utc_now()
    raw, row = _new_refresh_row(user.id, settings, now)
    with session.begin():
        session.add(row)
        session.flush()  # the INSERT takes SQLite's write lock
        # Re-read token_version under that lock: a reuse detection may have
        # bumped it since the user was loaded (e.g. during password checking).
        session.refresh(user)
    return IssuedSession(create_access_token(user, settings, now), raw, row)


def _find_refresh_token(session: Session, token_hash: str) -> RefreshToken | None:
    # Separate function so tests can return a stale snapshot (see
    # test_reuse_detection).
    return session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )


def _revoke_if_unrevoked(
    session: Session, row_id: int, reason: RevokedReason, now: datetime
) -> bool:
    """Conditional UPDATE; False when another transaction revoked it first."""
    result = session.execute(
        update(RefreshToken)
        .where(RefreshToken.id == row_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, revoked_reason=reason)
    )
    return result.rowcount == 1


def revoke_all_for_user(session: Session, user_id: uuid.UUID, now: datetime) -> None:
    """Revokes every unrevoked refresh token and invalidates access tokens.

    Runs inside the caller's transaction.
    """
    session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now, revoked_reason=RevokedReason.REUSE_DETECTED)
    )
    session.execute(
        update(User)
        .where(User.id == user_id)
        .values(token_version=User.token_version + 1)
    )


def rotate_refresh(
    session: Session, raw_token: str, settings: Settings, now: datetime | None = None
) -> IssuedSession:
    """Swaps a valid refresh token for a new one plus an access token.

    Raises InvalidRefreshToken, or RefreshTokenReused after committing the
    revocation of all the user's tokens when a rotated-out token is replayed.
    """
    now = now or utc_now()
    reuse_detected = False
    issued: IssuedSession | None = None

    with session.begin():
        row = _find_refresh_token(session, hash_refresh_token(raw_token))
        if row is None:
            raise InvalidRefreshToken
        # Expired tokens, revoked or not, are rejected and never trigger the
        # reuse path.
        if row.expires_at <= now:
            raise InvalidRefreshToken
        reason = row.revoked_reason
        if row.revoked_at is None:
            user = session.get(User, row.user_id)
            if user is None or not user.is_active:
                raise InvalidRefreshToken
            if _revoke_if_unrevoked(session, row.id, RevokedReason.ROTATED, now):
                raw, new_row = _new_refresh_row(user.id, settings, now)
                session.add(new_row)
                session.flush()
                row.replaced_by_id = new_row.id
                issued = IssuedSession(
                    create_access_token(user, settings, now), raw, new_row
                )
            else:
                # Lost a race: a concurrent refresh or logout revoked the row
                # after it was read. Its reason decides what happens next.
                reason = session.scalar(
                    select(RefreshToken.revoked_reason).where(RefreshToken.id == row.id)
                )

        if issued is None:
            if reason is not RevokedReason.ROTATED:
                raise InvalidRefreshToken  # logout / reuse_detected: 401 only
            revoke_all_for_user(session, row.user_id, now)
            reuse_detected = True

    # Raised only after the block above committed; raising inside it would
    # roll the revocation back.
    if reuse_detected:
        raise RefreshTokenReused
    assert issued is not None  # noqa: S101 (narrowing for type checkers)
    return issued


def logout(session: Session, raw_token: str, now: datetime | None = None) -> None:
    """Revokes the token if it is still usable; otherwise does nothing."""
    now = now or utc_now()
    with session.begin():
        session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == hash_refresh_token(raw_token),
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .values(revoked_at=now, revoked_reason=RevokedReason.LOGOUT)
        )


def purge_expired(session: Session, now: datetime | None = None) -> int:
    """Deletes refresh tokens past expires_at, revoked or not."""
    now = now or utc_now()
    with session.begin():
        result = session.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < now)
        )
    return result.rowcount
