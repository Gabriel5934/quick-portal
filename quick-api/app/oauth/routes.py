"""/oauth endpoints: integration client credentials and sessions.

generate and rotate act on the caller's business (bearer user token plus
``X-Business-Cnpj``, see app.business.deps). login and refresh are for
integrations: no cookies, so no CSRF header either. login takes
``grant_type=client_credentials`` in an ``application/x-www-form-urlencoded``
body and the client credentials in an ``Authorization: Basic`` header
(app.oauth.deps); refresh takes the refresh token in its JSON body; tokens are
returned in the JSON bodies. Every response carrying a secret or token is ``no-store``.

Request headers and bodies are never logged; errors on these routes do not
echo the Authorization header or the input (app.oauth.errors).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBasicCredentials
from sqlalchemy.orm import Session

from app.auth.deps import get_session, get_settings
from app.business.deps import get_current_business
from app.business.models import Business
from app.config import Settings
from app.oauth import service
from app.oauth.deps import client_credentials_basic, invalid_client_credentials
from app.oauth.errors import (
    INVALID_REQUEST,
    UNSUPPORTED_GRANT_TYPE,
    InvalidRequest,
    UnsupportedGrantType,
)
from app.oauth.schemas import (
    CLIENT_CREDENTIALS_GRANT,
    ClientCredentialsConflict,
    ClientCredentialsOut,
    IntegrationTokenOut,
    OAuthLoginForm,
    OAuthRefreshIn,
)

NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}

oauth_router = APIRouter(prefix="/oauth", tags=["oauth"])

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
BusinessDep = Annotated[Business, Depends(get_current_business)]

_BUSINESS_ERRORS = {
    400: {"description": "Missing or invalid X-Business-Cnpj header"},
    401: {"description": "Missing or invalid access token"},
    403: {"description": "Not a member of this business"},
}


def _json(status_code: int, content: dict) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=content, headers=NO_STORE)


def _unauthorized(detail: str) -> JSONResponse:
    return _json(status.HTTP_401_UNAUTHORIZED, {"detail": detail})


def _token_out(
    issued: service.IssuedIntegrationSession, settings: Settings
) -> JSONResponse:
    body = IntegrationTokenOut(
        access_token=issued.access_token,
        expires_in=settings.access_token_ttl_seconds,
        refresh_token=issued.refresh_token,
    )
    return _json(status.HTTP_200_OK, body.model_dump())


@oauth_router.post(
    "/generate",
    status_code=status.HTTP_201_CREATED,
    response_model=ClientCredentialsOut,
    responses={
        **_BUSINESS_ERRORS,
        409: {
            "description": "Credentials already exist; the secret is not returned",
            "model": ClientCredentialsConflict,
        },
    },
)
def generate(business: BusinessDep, session: SessionDep) -> JSONResponse:
    """Creates the business's client_id and client_secret. The secret is
    returned only in this response."""
    business_id = business.id
    # Loading the business autobegan a transaction; end it so the service
    # can run its own.
    session.close()
    try:
        credentials = service.generate_credentials(session, business_id)
    except service.CredentialsExist as exc:
        conflict = ClientCredentialsConflict(
            detail="Client credentials already exist.",
            client_id=exc.client_id or "",
        )
        return _json(status.HTTP_409_CONFLICT, conflict.model_dump())
    body = ClientCredentialsOut(
        client_id=credentials.client_id, client_secret=credentials.client_secret
    )
    return _json(status.HTTP_201_CREATED, body.model_dump())


@oauth_router.post(
    "/rotate",
    response_model=ClientCredentialsOut,
    responses={
        **_BUSINESS_ERRORS,
        409: {"description": "No credentials to rotate, or a concurrent rotation"},
    },
)
def rotate(business: BusinessDep, session: SessionDep) -> JSONResponse:
    """Replaces the client_secret, returned only in this response, and
    revokes every integration access and refresh token of the business."""
    business_id = business.id
    session.close()
    try:
        credentials = service.rotate_secret(session, business_id)
    except service.RotationConflict:
        return _json(
            status.HTTP_409_CONFLICT,
            {"detail": "No client credentials to rotate, or they just changed."},
        )
    body = ClientCredentialsOut(
        client_id=credentials.client_id, client_secret=credentials.client_secret
    )
    return _json(status.HTTP_200_OK, body.model_dump())


async def client_credentials_grant(
    request: Request, form: Annotated[OAuthLoginForm, Form()]
) -> None:
    """Requires exactly one form field ``grant_type=client_credentials``.

    A repeated grant_type, even with equal values, is the RFC 6749
    ``invalid_request`` 400; a missing (no body, an empty form, a JSON body),
    empty or any other value is ``unsupported_grant_type`` (app.oauth.errors).
    FastAPI keeps only the last of repeated fields, so the count comes from
    the form Starlette already parsed and cached for ``form``. Only the form
    body is read, never the query string. login declares this before the
    Basic credentials, so it is checked first.
    """
    if len((await request.form()).getlist("grant_type")) > 1:
        raise InvalidRequest
    if form.grant_type != CLIENT_CREDENTIALS_GRANT:
        raise UnsupportedGrantType


@oauth_router.post(
    "/login",
    response_model=IntegrationTokenOut,
    responses={
        400: {
            "description": (
                "grant_type repeated (invalid_request), or missing or not "
                "client_credentials (unsupported_grant_type)"
            ),
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "error": {
                                "type": "string",
                                "enum": [
                                    INVALID_REQUEST,
                                    UNSUPPORTED_GRANT_TYPE,
                                ],
                            }
                        },
                        "required": ["error"],
                    }
                }
            },
        },
        401: {
            "description": "Missing, malformed or invalid client credentials",
            "headers": {
                "WWW-Authenticate": {
                    "description": "Basic",
                    "schema": {"type": "string"},
                }
            },
        },
    },
)
def login(
    _grant: Annotated[None, Depends(client_credentials_grant)],
    credentials: Annotated[HTTPBasicCredentials, Depends(client_credentials_basic)],
    session: SessionDep,
    settings: SettingsDep,
) -> JSONResponse:
    """Exchanges ``Authorization: Basic base64(client_id:client_secret)``
    plus the form body ``grant_type=client_credentials`` for an integration
    access token and refresh token."""
    try:
        business = service.authenticate(
            session, credentials.username, credentials.password
        )
        issued = service.issue_session(session, business, settings)
    except service.InvalidClientCredentials:
        # One response for unknown client_id, wrong secret and inactive
        # business, the same as for a malformed header.
        raise invalid_client_credentials() from None
    return _token_out(issued, settings)


@oauth_router.post(
    "/refresh",
    response_model=IntegrationTokenOut,
    responses={401: {"description": "Refresh token invalid, expired or reused"}},
)
def refresh(
    body: OAuthRefreshIn, session: SessionDep, settings: SettingsDep
) -> JSONResponse:
    try:
        issued = service.rotate_refresh(session, body.refresh_token, settings)
    except service.RefreshTokenReused:
        return _unauthorized("Refresh token was already used.")
    except service.InvalidRefreshToken:
        return _unauthorized("Refresh token is invalid or expired.")
    return _token_out(issued, settings)
