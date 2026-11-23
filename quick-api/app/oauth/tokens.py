"""Integration access tokens (HS256 JWTs, ``aud=integration``).

Signed with the same key as user tokens (app.auth.tokens), so the audience is
what keeps the two apart: each decoder requires its own.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt

from app.auth.tokens import ACCESS_TOKEN_TYPE, ALGORITHM
from app.business.models import Business
from app.config import Settings

INTEGRATION_AUDIENCE = "integration"
INTEGRATION_SCOPE = "integration"
REQUIRED_CLAIMS = ["sub", "iat", "exp", "typ", "tv", "aud", "scope"]


class InvalidIntegrationToken(Exception):
    pass


@dataclass(frozen=True)
class IntegrationTokenClaims:
    business_id: uuid.UUID
    token_version: int
    scopes: frozenset[str]


def create_integration_access_token(
    business: Business, settings: Settings, now: datetime
) -> str:
    payload = {
        "sub": str(business.id),
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
        "typ": ACCESS_TOKEN_TYPE,
        "aud": INTEGRATION_AUDIENCE,
        "scope": INTEGRATION_SCOPE,
        "tv": business.token_version,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_integration_access_token(
    token: str, settings: Settings
) -> IntegrationTokenClaims:
    """Verifies signature, expiry, audience and claims.

    Raises InvalidIntegrationToken.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
            audience=INTEGRATION_AUDIENCE,
            options={"require": REQUIRED_CLAIMS},
        )
        if payload["typ"] != ACCESS_TOKEN_TYPE:
            raise InvalidIntegrationToken("wrong token type")
        token_version = payload["tv"]
        if not isinstance(token_version, int) or isinstance(token_version, bool):
            raise InvalidIntegrationToken("invalid tv claim")
        scope = payload["scope"]
        if not isinstance(scope, str):
            raise InvalidIntegrationToken("invalid scope claim")
        return IntegrationTokenClaims(
            business_id=uuid.UUID(payload["sub"]),
            token_version=token_version,
            scopes=frozenset(scope.split()),
        )
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise InvalidIntegrationToken(str(exc)) from exc
