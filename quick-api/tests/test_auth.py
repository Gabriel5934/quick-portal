import base64
import json
import uuid
from collections.abc import Callable
from dataclasses import replace
from datetime import timedelta

import jwt
import pytest
from alembic import command
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.auth.models import RefreshToken, RevokedReason, User
from app.auth.tokens import (
    ALGORITHM,
    create_access_token,
    decode_access_token,
    hash_refresh_token,
)
from app.config import Settings
from app.db import utc_now
from app.main import create_app
from tests.conftest import (
    CSRF,
    JWT_SECRET,
    PASSWORD,
    alembic_config,
    bearer,
    login,
    refresh,
    register,
    set_refresh_cookie,
)

EMAIL = "ana@example.com"


def refresh_rows(app: FastAPI) -> list[RefreshToken]:
    with app.state.session_factory() as session:
        return list(session.scalars(select(RefreshToken).order_by(RefreshToken.id)))


def set_cookie_header(response) -> str:
    (header,) = response.headers.get_list("set-cookie")
    return header


def assert_cookie_cleared(response) -> None:
    header = set_cookie_header(response)
    assert header.startswith('refresh_token="";') or header.startswith(
        "refresh_token=;"
    )
    assert "Max-Age=0" in header
    assert "Path=/auth" in header


# Registration and login


def test_register_and_login(client: TestClient) -> None:
    created = register(client, EMAIL)
    assert created["email"] == EMAIL
    uuid.UUID(created["id"])
    assert "password" not in created and "password_hash" not in created

    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 300

    me = client.get("/auth/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json() == created


def test_refresh_cookie_flags(client: TestClient, settings: Settings) -> None:
    register(client, EMAIL)
    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    header = set_cookie_header(response)
    attributes = [part.strip().lower() for part in header.split(";")]
    assert "httponly" in attributes
    assert "path=/auth" in attributes
    assert f"max-age={settings.refresh_token_ttl_seconds}" in attributes
    assert "samesite=lax" in attributes
    assert "secure" not in attributes  # cookie_secure=False in the fixture
    # The refresh token is never in the body.
    assert "refresh_token" not in response.json()


def test_secure_cookie_by_default(settings: Settings) -> None:
    secure = replace(settings, cookie_secure=True)
    app = create_app(secure)
    command.upgrade(alembic_config(secure), "head")
    with TestClient(app, base_url="https://testserver") as client:
        register(client, EMAIL)
        response = client.post(
            "/auth/login", json={"email": EMAIL, "password": PASSWORD}
        )
    assert "secure" in set_cookie_header(response).lower().split("; ")


def test_duplicate_email_is_rejected(client: TestClient) -> None:
    register(client, EMAIL)
    response = client.post(
        "/auth/register", json={"email": " Ana@Example.COM ", "password": PASSWORD}
    )
    assert response.status_code == 409


def test_email_is_normalized(client: TestClient) -> None:
    created = register(client, "  Bruno@Example.COM")
    assert created["email"] == "bruno@example.com"
    login(client, "BRUNO@example.com ")


def test_short_password_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/auth/register", json={"email": EMAIL, "password": "123456789"}
    )
    assert response.status_code == 422


def test_password_is_hashed(app: FastAPI, client: TestClient) -> None:
    register(client, EMAIL)
    with app.state.session_factory() as session:
        user = session.scalar(select(User))
    assert user.password_hash.startswith("$argon2")
    assert PASSWORD not in user.password_hash


def test_wrong_password_and_unknown_email_look_the_same(client: TestClient) -> None:
    register(client, EMAIL)
    wrong_password = client.post(
        "/auth/login", json={"email": EMAIL, "password": "wrong password!"}
    )
    unknown_email = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": PASSWORD}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()
    assert "set-cookie" not in wrong_password.headers
    assert "set-cookie" not in unknown_email.headers


def test_inactive_user_cannot_log_in(app: FastAPI, client: TestClient) -> None:
    register(client, EMAIL)
    with app.state.session_factory() as session, session.begin():
        session.execute(update(User).values(is_active=False))
    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid email or password."}


# Refresh


def test_refresh_rotates_the_token(app: FastAPI, client: TestClient) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    old_cookie = client.cookies["refresh_token"]

    response = refresh(client)
    assert response.status_code == 200
    new_cookie = client.cookies["refresh_token"]
    assert new_cookie != old_cookie

    old_row, new_row = refresh_rows(app)
    assert old_row.token_hash == hash_refresh_token(old_cookie)
    assert old_row.revoked_reason is RevokedReason.ROTATED
    assert old_row.revoked_at is not None
    assert old_row.replaced_by_id == new_row.id
    assert new_row.token_hash == hash_refresh_token(new_cookie)
    assert new_row.revoked_at is None

    me = client.get("/auth/me", headers=bearer(response.json()["access_token"]))
    assert me.status_code == 200


def test_refresh_without_cookie(client: TestClient) -> None:
    response = refresh(client)
    assert response.status_code == 401
    assert_cookie_cleared(response)


def test_unknown_refresh_token(app: FastAPI, client: TestClient) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    set_refresh_cookie(client, "not-a-real-token")
    response = refresh(client)
    assert response.status_code == 401
    assert_cookie_cleared(response)
    # Nothing was revoked.
    (row,) = refresh_rows(app)
    assert row.revoked_at is None


def test_expired_refresh_token_does_not_revoke_other_sessions(
    app: FastAPI, client: TestClient, new_client: Callable[[], TestClient]
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    other = new_client()
    other_access = login(other, EMAIL)
    expired_hash = hash_refresh_token(client.cookies["refresh_token"])
    with app.state.session_factory() as session, session.begin():
        session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == expired_hash)
            .values(expires_at=utc_now() - timedelta(seconds=1))
        )

    response = refresh(client)
    assert response.status_code == 401
    assert_cookie_cleared(response)

    assert all(row.revoked_at is None for row in refresh_rows(app))
    assert other.get("/auth/me", headers=bearer(other_access)).status_code == 200
    assert refresh(other).status_code == 200


def test_refresh_for_inactive_user_is_rejected(
    app: FastAPI, client: TestClient
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    with app.state.session_factory() as session, session.begin():
        session.execute(update(User).values(is_active=False))
    assert refresh(client).status_code == 401
    (row,) = refresh_rows(app)
    assert row.revoked_at is None


# Logout


def test_logout_revokes_the_token_and_is_idempotent(
    app: FastAPI, client: TestClient
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    cookie = client.cookies["refresh_token"]

    response = client.post("/auth/logout", headers=CSRF)
    assert response.status_code == 204
    assert_cookie_cleared(response)
    (row,) = refresh_rows(app)
    assert row.revoked_reason is RevokedReason.LOGOUT

    set_refresh_cookie(client, cookie)
    again = client.post("/auth/logout", headers=CSRF)
    assert again.status_code == 204
    (row,) = refresh_rows(app)
    assert row.revoked_reason is RevokedReason.LOGOUT  # keeps its original reason

    assert client.post("/auth/logout", headers=CSRF).status_code == 204  # no cookie


def test_replaying_a_logged_out_token_does_not_revoke_other_sessions(
    app: FastAPI, client: TestClient, new_client: Callable[[], TestClient]
) -> None:
    register(client, EMAIL)
    first_access = login(client, EMAIL)
    cookie = client.cookies["refresh_token"]
    other = new_client()
    other_access = login(other, EMAIL)

    assert client.post("/auth/logout", headers=CSRF).status_code == 204
    set_refresh_cookie(client, cookie)
    response = refresh(client)
    assert response.status_code == 401
    assert_cookie_cleared(response)

    # The other session and the user's access tokens are untouched.
    assert refresh(other).status_code == 200
    assert other.get("/auth/me", headers=bearer(other_access)).status_code == 200
    assert client.get("/auth/me", headers=bearer(first_access)).status_code == 200
    with app.state.session_factory() as session:
        assert session.scalar(select(User.token_version)) == 0


@pytest.mark.parametrize("path", ["/auth/refresh", "/auth/logout"])
@pytest.mark.parametrize("headers", [{}, {"X-Requested-With": "XMLHttpRequest"}])
def test_csrf_header_is_required(
    app: FastAPI, client: TestClient, path: str, headers: dict[str, str]
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    response = client.post(path, headers=headers)
    assert response.status_code == 403
    (row,) = refresh_rows(app)
    assert row.revoked_at is None


# Access tokens


def access_payload(user_id: str, **overrides) -> dict:
    now = utc_now()
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "typ": "access",
        "tv": 0,
    }
    payload.update(overrides)
    return {key: value for key, value in payload.items() if value is not None}


def _b64(data: dict) -> str:
    raw = json.dumps(data, default=lambda value: int(value.timestamp())).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def test_valid_hand_built_token_is_accepted(client: TestClient) -> None:
    user_id = register(client, EMAIL)["id"]
    token = jwt.encode(access_payload(user_id), JWT_SECRET, algorithm=ALGORITHM)
    assert client.get("/auth/me", headers=bearer(token)).status_code == 200


@pytest.mark.parametrize(
    "make_token",
    [
        pytest.param(
            lambda uid: (
                jwt.encode(access_payload(uid), JWT_SECRET, algorithm=ALGORITHM)[:-2]
                + "xx"
            ),
            id="tampered-signature",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(uid), "another-secret-0123456789abcdefghijk", ALGORITHM
            ),
            id="wrong-key",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(
                    uid,
                    iat=utc_now() - timedelta(minutes=10),
                    exp=utc_now() - timedelta(seconds=1),
                ),
                JWT_SECRET,
                algorithm=ALGORITHM,
            ),
            id="expired",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(uid, typ="refresh"), JWT_SECRET, algorithm=ALGORITHM
            ),
            id="wrong-typ",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(uid, tv=None), JWT_SECRET, algorithm=ALGORITHM
            ),
            id="missing-tv",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(uid, tv=1), JWT_SECRET, algorithm=ALGORITHM
            ),
            id="stale-tv",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload(str(uuid.uuid4())), JWT_SECRET, algorithm=ALGORITHM
            ),
            id="unknown-user",
        ),
        pytest.param(
            lambda uid: jwt.encode(
                access_payload("not-a-uuid"), JWT_SECRET, algorithm=ALGORITHM
            ),
            id="malformed-sub",
        ),
        pytest.param(
            lambda uid: (
                f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(access_payload(uid))}."
            ),
            id="alg-none",
        ),
        pytest.param(lambda uid: "garbage", id="garbage"),
    ],
)
def test_bad_access_tokens_are_rejected(
    client: TestClient, make_token: Callable[[str], str]
) -> None:
    user_id = register(client, EMAIL)["id"]
    response = client.get("/auth/me", headers=bearer(make_token(user_id)))
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_missing_access_token(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401


def test_inactive_user_access_token_is_rejected(
    app: FastAPI, client: TestClient
) -> None:
    register(client, EMAIL)
    access = login(client, EMAIL)
    with app.state.session_factory() as session, session.begin():
        session.execute(update(User).values(is_active=False))
    assert client.get("/auth/me", headers=bearer(access)).status_code == 401


def test_access_token_round_trip(app: FastAPI, client: TestClient, settings) -> None:
    register(client, EMAIL)
    with app.state.session_factory() as session:
        user = session.scalar(select(User))
    claims = decode_access_token(
        create_access_token(user, settings, utc_now()), settings
    )
    assert claims.user_id == user.id
    assert claims.token_version == 0


# App configuration


@pytest.mark.parametrize("secret", ["", "too-short-secret"])
def test_create_app_rejects_a_weak_secret(settings: Settings, secret: str) -> None:
    with pytest.raises(ValueError, match="JWT_SECRET"):
        create_app(replace(settings, jwt_secret=secret))


def test_samesite_none_requires_secure(settings: Settings) -> None:
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        create_app(replace(settings, cookie_samesite="none", cookie_secure=False))


@pytest.mark.parametrize("origins", [("*",), ("http://localhost:5173", "*")])
def test_wildcard_cors_origin_is_rejected(
    settings: Settings, origins: tuple[str, ...]
) -> None:
    with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
        create_app(replace(settings, cors_allowed_origins=origins))


def test_secret_is_not_in_repr(settings: Settings) -> None:
    assert JWT_SECRET not in repr(settings)


def test_docs_are_disabled_by_default(client: TestClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_docs_can_be_enabled(app: FastAPI, settings: Settings) -> None:
    # ``app`` migrated the database at settings.database_path.
    with TestClient(create_app(replace(settings, api_docs_enabled=True))) as client:
        assert client.get("/openapi.json").status_code == 200


def test_settings_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("COOKIE_SAMESITE", "None")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://a.test, http://b.test")
    monkeypatch.setenv("REFRESH_TOKEN_TTL_SECONDS", "60")
    settings = Settings.from_env()
    assert settings.cookie_secure is False
    assert settings.cookie_samesite == "none"
    assert settings.cors_allowed_origins == ("http://a.test", "http://b.test")
    assert settings.refresh_token_ttl_seconds == 60
    assert settings.access_token_ttl_seconds == 300


def test_cors_allows_the_frontend_with_credentials(client: TestClient) -> None:
    response = client.options(
        "/auth/refresh",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-requested-with",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
