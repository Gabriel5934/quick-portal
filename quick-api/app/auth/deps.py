"""FastAPI dependencies: DB session, current user and the CSRF header check."""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.models import User
from app.auth.tokens import InvalidAccessToken, decode_access_token
from app.config import Settings

CSRF_HEADER = "X-Requested-With"
CSRF_HEADER_VALUE = "quick-portal"

_bearer = HTTPBearer(auto_error=False)


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_session(request: Request) -> Iterator[Session]:
    with request.app.state.session_factory() as session:
        yield session


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """Bearer access token → active user whose token_version matches ``tv``."""
    if credentials is None:
        raise _unauthorized()
    try:
        claims = decode_access_token(credentials.credentials, settings)
    except InvalidAccessToken:
        raise _unauthorized() from None
    user = session.get(User, claims.user_id)
    # A token_version bump (reuse detection) kills older access tokens at once.
    if user is None or not user.is_active or user.token_version != claims.token_version:
        raise _unauthorized()
    return user


def require_csrf_header(
    value: Annotated[str | None, Header(alias=CSRF_HEADER)] = None,
) -> None:
    """Cross-site forms cannot set custom headers, and CORS gates fetch()."""
    if value != CSRF_HEADER_VALUE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing or invalid {CSRF_HEADER} header.",
        )
