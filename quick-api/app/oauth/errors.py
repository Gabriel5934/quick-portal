"""Error responses of /oauth routes that never echo the request.

FastAPI's default 422 handler includes each invalid value (``input``) in the
response, which for these routes would be a refresh token (the refresh body).
login never answers 422: a repeated ``grant_type`` form field is the RFC 6749
``invalid_request`` 400 and a missing or wrong one the ``unsupported_grant_type``
400 below, and a bad Authorization header is a 401 of its own
(app.oauth.deps).
"""

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

INVALID_REQUEST = "invalid_request"
UNSUPPORTED_GRANT_TYPE = "unsupported_grant_type"
SENSITIVE_PATH_PREFIX = "/oauth/"
_REDACTED_KEYS = frozenset({"input", "ctx", "url"})


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> Response:
    if not request.url.path.startswith(SENSITIVE_PATH_PREFIX):
        return await request_validation_exception_handler(request, exc)
    errors = [
        {key: value for key, value in error.items() if key not in _REDACTED_KEYS}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(errors)},
        headers={"Cache-Control": "no-store"},
    )


class OAuthLoginError(Exception):
    """An RFC 6749 section 5.2 error of /oauth/login, answered as a 400."""

    error: str


class InvalidRequest(OAuthLoginError):
    """The login form repeats grant_type (RFC 6749 section 3.2)."""

    error = INVALID_REQUEST


class UnsupportedGrantType(OAuthLoginError):
    """The login form's grant_type is missing or not ``client_credentials``."""

    error = UNSUPPORTED_GRANT_TYPE


async def oauth_login_error_handler(request: Request, exc: OAuthLoginError) -> Response:
    # Never includes the submitted values.
    return JSONResponse(
        status_code=400,
        content={"error": exc.error},
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )
