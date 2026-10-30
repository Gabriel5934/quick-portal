"""Access tokens (HS256 JWTs) and opaque refresh tokens."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt

from app.auth.models import User
from app.config import Settings

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"  # noqa: S105 (token type claim, not a secret)
REQUIRED_CLAIMS = ["sub", "iat", "exp", "typ", "tv"]


class InvalidAccessToken(Exception):
    pass


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: uuid.UUID
    token_version: int


def create_access_token(user: User, settings: Settings, now: datetime) -> str:
    payload = {
        "sub": str(user.id),
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
        "typ": ACCESS_TOKEN_TYPE,
        "tv": user.token_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str, settings: Settings) -> AccessTokenClaims:
    """Verifies signature, expiry and claims; raises InvalidAccessToken."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            # Pinned, so alg=none or another algorithm is rejected.
            algorithms=[ALGORITHM],
            options={"require": REQUIRED_CLAIMS},
        )
        if payload["typ"] != ACCESS_TOKEN_TYPE:
            raise InvalidAccessToken("wrong token type")
        token_version = payload["tv"]
        if not isinstance(token_version, int) or isinstance(token_version, bool):
            raise InvalidAccessToken("invalid tv claim")
        return AccessTokenClaims(
            user_id=uuid.UUID(payload["sub"]), token_version=token_version
        )
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise InvalidAccessToken(str(exc)) from exc


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
