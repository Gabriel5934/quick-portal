"""Integration client credentials (HTTP Basic) and the business behind an
integration access token."""

import binascii
from base64 import b64decode
from typing import Annotated

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBasic,
    HTTPBasicCredentials,
    HTTPBearer,
    SecurityScopes,
)
from fastapi.security.utils import get_authorization_scheme_param
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection

from app.auth.deps import get_session, get_settings
from app.business.models import Business
from app.config import Settings
from app.oauth.credentials import MAX_CLIENT_ID_LENGTH, MAX_CLIENT_SECRET_LENGTH
from app.oauth.tokens import (
    INTEGRATION_SCOPE,
    InvalidIntegrationToken,
    decode_integration_access_token,
)

_bearer = HTTPBearer(auto_error=False, scheme_name="IntegrationBearer")

INVALID_CLIENT_CREDENTIALS = "Invalid client credentials."
# Longest valid "client_id:client_secret", base64-encoded; anything longer is
# rejected before decoding, which keeps the work small.
_MAX_BASIC_PARAM_LENGTH = 4 * -(
    -(MAX_CLIENT_ID_LENGTH + 1 + MAX_CLIENT_SECRET_LENGTH) // 3
)


def invalid_client_credentials() -> HTTPException:
    """The one 401 for a missing, malformed or wrong Authorization header.

    Never includes any part of the header, so nothing reveals what was sent or
    whether the client_id exists.
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_CLIENT_CREDENTIALS,
        headers={
            "WWW-Authenticate": "Basic",
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )


class ClientCredentialsBasic(HTTPBasic):
    """``Authorization: Basic base64(client_id:client_secret)``.

    Stricter than HTTPBasic: the base64 must be valid (no ignored characters),
    the decoded value ASCII, split on its first ``:`` only (a secret may hold
    more), with both parts non-empty and within the stored length bounds.
    Every failure is the same 401; the header is never logged or echoed.
    """

    async def __call__(  # type: ignore[override]
        self, request: HTTPConnection
    ) -> HTTPBasicCredentials:
        authorization = request.headers.get("Authorization")
        scheme, param = get_authorization_scheme_param(authorization)
        if (
            not authorization
            or scheme.lower() != "basic"
            or not param
            or len(param) > _MAX_BASIC_PARAM_LENGTH
        ):
            raise invalid_client_credentials()
        try:
            decoded = b64decode(param, validate=True).decode("ascii")
        except (ValueError, UnicodeDecodeError, binascii.Error):
            raise invalid_client_credentials() from None
        client_id, separator, client_secret = decoded.partition(":")
        if (
            not separator
            or not client_id
            or not client_secret
            or len(client_id) > MAX_CLIENT_ID_LENGTH
            or len(client_secret) > MAX_CLIENT_SECRET_LENGTH
        ):
            raise invalid_client_credentials()
        return HTTPBasicCredentials(username=client_id, password=client_secret)


client_credentials_basic = ClientCredentialsBasic(
    scheme_name="ClientCredentialsBasic",
    description="client_id as the username and client_secret as the password.",
)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_integration_user(
    security_scopes: SecurityScopes,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Business:
    """Integration bearer token → active business whose token_version matches
    ``tv``.

    Use through ``Security(..., scopes=[...])`` (or ``IntegrationBusiness``).
    The ``integration`` scope is always required; user tokens fail the
    audience check and get 401.
    """
    if credentials is None:
        raise _unauthorized()
    try:
        claims = decode_integration_access_token(credentials.credentials, settings)
    except InvalidIntegrationToken:
        raise _unauthorized() from None
    required = {INTEGRATION_SCOPE, *security_scopes.scopes}
    if not required <= claims.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient scope",
            headers={
                "WWW-Authenticate": (
                    f'Bearer error="insufficient_scope", '
                    f'scope="{" ".join(sorted(required))}"'
                )
            },
        )
    business = session.get(Business, claims.business_id)
    # A secret rotation or reuse detection bumps token_version, which kills
    # older integration access tokens at once.
    if (
        business is None
        or not business.is_active
        or business.client_secret_hash is None
        or business.token_version != claims.token_version
    ):
        raise _unauthorized()
    return business


IntegrationBusiness = Annotated[
    Business, Security(get_current_integration_user, scopes=[INTEGRATION_SCOPE])
]
