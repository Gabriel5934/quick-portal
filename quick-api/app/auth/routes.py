"""/auth endpoints: register, login, refresh, logout and me.

Handlers are sync so Argon2 and SQLite calls run in FastAPI's threadpool.
"""

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.deps import (
    get_current_user,
    get_session,
    get_settings,
    require_csrf_header,
)
from app.auth.models import User
from app.auth.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.config import Settings

REFRESH_COOKIE = "refresh_token"
# Sent only to /auth/*, so other endpoints never see the refresh token.
REFRESH_COOKIE_PATH = "/auth"

auth_router = APIRouter(prefix="/auth", tags=["auth"])

SessionDep = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _set_refresh_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_ttl_seconds,
        path=REFRESH_COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    # Browsers only replace the cookie when path/secure/samesite match.
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def _token_out(issued: service.IssuedSession, settings: Settings) -> TokenOut:
    return TokenOut(
        access_token=issued.access_token,
        expires_in=settings.access_token_ttl_seconds,
    )


def _refresh_rejected(detail: str, settings: Settings) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": detail}
    )
    _clear_refresh_cookie(response, settings)
    return response


@auth_router.post(
    "/register", status_code=status.HTTP_201_CREATED, response_model=UserOut
)
def register(body: RegisterIn, session: SessionDep) -> User:
    try:
        return service.register(session, body.email, body.password)
    except service.EmailTaken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address already exists.",
        ) from None


@auth_router.post("/login")
def login(
    body: LoginIn, response: Response, session: SessionDep, settings: SettingsDep
) -> TokenOut:
    try:
        user = service.authenticate(session, body.email, body.password)
    except service.InvalidCredentials:
        # One message for unknown email, wrong password and inactive account.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        ) from None
    issued = service.issue_session(session, user, settings)
    _set_refresh_cookie(response, issued.refresh_token, settings)
    return _token_out(issued, settings)


@auth_router.post(
    "/refresh",
    dependencies=[Depends(require_csrf_header)],
    response_model=TokenOut,
    responses={401: {"description": "Refresh token missing, invalid or reused"}},
)
def refresh(
    session: SessionDep, settings: SettingsDep, refresh_token: RefreshCookie = None
) -> Response:
    if not refresh_token:
        return _refresh_rejected("Refresh token cookie is missing.", settings)
    try:
        issued = service.rotate_refresh(session, refresh_token, settings)
    except service.RefreshTokenReused:
        return _refresh_rejected("Refresh token was already used.", settings)
    except service.InvalidRefreshToken:
        return _refresh_rejected("Refresh token is invalid or expired.", settings)
    response = JSONResponse(content=_token_out(issued, settings).model_dump())
    _set_refresh_cookie(response, issued.refresh_token, settings)
    return response


@auth_router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf_header)],
)
def logout(
    session: SessionDep, settings: SettingsDep, refresh_token: RefreshCookie = None
) -> Response:
    if refresh_token:
        service.logout(session, refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, settings)
    return response


@auth_router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
