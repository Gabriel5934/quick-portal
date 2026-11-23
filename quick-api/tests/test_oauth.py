"""Integration client credentials: /oauth generate, rotate, login and
refresh, the integration dependency, audience separation and the migration."""

import base64
import hashlib
from datetime import timedelta

import jwt
import pytest
from alembic import command
from fastapi import APIRouter, FastAPI, Security
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, select, update
from sqlalchemy.orm import Session

from app.auth.tokens import ALGORITHM
from app.business import service as business_service
from app.business.models import Business
from app.config import Settings
from app.db import utc_now
from app.oauth import service
from app.oauth.credentials import CLIENT_SECRET_PREFIX
from app.oauth.deps import IntegrationBusiness, get_current_integration_user
from app.oauth.models import IntegrationRefreshToken
from tests.conftest import JWT_SECRET, alembic_config, bearer, login, register

EMAIL = "ana@example.com"
OTHER_EMAIL = "bruno@example.com"
CNPJ_A = "12ABC345000199"
CNPJ_B = "98765432000110"


def add_business(session: Session, cnpj: str, *emails: str) -> Business:
    business = business_service.create_business(session, cnpj)
    for email in emails:
        business_service.link_user(session, email, cnpj)
    return business


def scoped(access_token: str, cnpj: str) -> dict[str, str]:
    return {**bearer(access_token), "X-Business-Cnpj": cnpj}


def business_row(app: FastAPI, cnpj: str) -> Business:
    with app.state.session_factory() as session:
        return session.scalar(select(Business).where(Business.cnpj == cnpj))


def refresh_rows(app: FastAPI, cnpj: str) -> list[IntegrationRefreshToken]:
    with app.state.session_factory() as session:
        business = session.scalar(select(Business).where(Business.cnpj == cnpj))
        return list(
            session.scalars(
                select(IntegrationRefreshToken)
                .where(IntegrationRefreshToken.business_id == business.id)
                .order_by(IntegrationRefreshToken.id)
            )
        )


@pytest.fixture
def user_access(client: TestClient, session: Session) -> str:
    """Ana, member of business A only; B exists with Bruno as its member."""
    register(client, EMAIL)
    register(client, OTHER_EMAIL)
    add_business(session, CNPJ_A, EMAIL)
    add_business(session, CNPJ_B, OTHER_EMAIL)
    return login(client, EMAIL)


@pytest.fixture
def credentials(client: TestClient, user_access: str) -> dict[str, str]:
    response = client.post("/oauth/generate", headers=scoped(user_access, CNPJ_A))
    assert response.status_code == 201, response.text
    return response.json()


def basic(client_id: str, client_secret: str) -> dict[str, str]:
    raw = f"{client_id}:{client_secret}".encode()
    return {"Authorization": "Basic " + base64.b64encode(raw).decode()}


GRANT = {"grant_type": "client_credentials"}


def oauth_login(client: TestClient, credentials: dict[str, str]):
    return client.post(
        "/oauth/login",
        headers=basic(credentials["client_id"], credentials["client_secret"]),
        data=GRANT,
    )


def assert_unsupported_grant(response) -> None:
    assert response.status_code == 400
    assert response.json() == {"error": "unsupported_grant_type"}
    assert response.headers["cache-control"] == "no-store"
    assert "www-authenticate" not in response.headers


def assert_invalid_request(response) -> None:
    assert response.status_code == 400
    assert response.json() == {"error": "invalid_request"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert "www-authenticate" not in response.headers


def set_secret(app: FastAPI, cnpj: str, secret: str) -> None:
    with app.state.session_factory() as session, session.begin():
        session.execute(
            update(Business)
            .where(Business.cnpj == cnpj)
            .values(client_secret_hash=hashlib.sha256(secret.encode()).hexdigest())
        )


def assert_invalid_client(response) -> None:
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid client credentials."}
    assert response.headers["www-authenticate"] == "Basic"
    assert response.headers["cache-control"] == "no-store"


def oauth_refresh(client: TestClient, refresh_token: str):
    return client.post("/oauth/refresh", json={"refresh_token": refresh_token})


@pytest.fixture
def integration_client(app: FastAPI, client: TestClient) -> TestClient:
    router = APIRouter()

    @router.get("/test-integration")
    def integration(business: IntegrationBusiness) -> dict[str, str]:
        return {"cnpj": business.cnpj}

    @router.get("/test-integration-extra-scope")
    def extra_scope(
        business: Business = Security(  # noqa: B008
            get_current_integration_user, scopes=["integration", "payments"]
        ),
    ) -> dict[str, str]:
        return {"cnpj": business.cnpj}

    app.include_router(router)
    return client


# POST /oauth/generate


def test_generate_returns_the_secret_once(
    app: FastAPI, client: TestClient, user_access: str
) -> None:
    response = client.post("/oauth/generate", headers=scoped(user_access, CNPJ_A))
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert set(body) == {"client_id", "client_secret"}
    secret = body["client_secret"]
    assert secret.startswith(CLIENT_SECRET_PREFIX)
    assert len(secret) >= len(CLIENT_SECRET_PREFIX) + 43

    business = business_row(app, CNPJ_A)
    assert business.client_id == body["client_id"]
    # Only the SHA-256 digest is stored.
    assert business.client_secret_hash == hashlib.sha256(secret.encode()).hexdigest()

    second = client.post("/oauth/generate", headers=scoped(user_access, CNPJ_A))
    assert second.status_code == 409
    assert second.headers["cache-control"] == "no-store"
    assert second.json()["client_id"] == body["client_id"]
    assert "client_secret" not in second.json()
    assert secret not in second.text
    # The stored credentials are untouched.
    after = business_row(app, CNPJ_A)
    assert after.client_secret_hash == business.client_secret_hash


def test_generate_only_affects_the_callers_business(
    app: FastAPI, client: TestClient, user_access: str
) -> None:
    # Ana is not a member of B.
    response = client.post("/oauth/generate", headers=scoped(user_access, CNPJ_B))
    assert response.status_code == 403
    assert business_row(app, CNPJ_B).client_id is None

    response = client.post("/oauth/generate", headers=scoped(user_access, CNPJ_A))
    assert response.status_code == 201
    assert business_row(app, CNPJ_B).client_id is None
    assert business_row(app, CNPJ_B).client_secret_hash is None


@pytest.mark.parametrize("path", ["/oauth/generate", "/oauth/rotate"])
def test_generate_and_rotate_require_a_user_and_business(
    client: TestClient, user_access: str, path: str
) -> None:
    assert client.post(path).status_code == 401
    assert client.post(path, headers=bearer(user_access)).status_code == 400


def test_generate_rejects_an_integration_token(
    client: TestClient, credentials: dict[str, str]
) -> None:
    integration_access = oauth_login(client, credentials).json()["access_token"]
    response = client.post(
        "/oauth/generate", headers=scoped(integration_access, CNPJ_A)
    )
    assert response.status_code == 401


# POST /oauth/rotate


def test_rotate_without_credentials_conflicts(
    client: TestClient, user_access: str
) -> None:
    response = client.post("/oauth/rotate", headers=scoped(user_access, CNPJ_A))
    assert response.status_code == 409
    assert "client_secret" not in response.json()


def test_rotate_replaces_the_secret_and_revokes_sessions(
    app: FastAPI,
    integration_client: TestClient,
    user_access: str,
    credentials: dict[str, str],
) -> None:
    client = integration_client
    tokens = oauth_login(client, credentials).json()
    assert (
        client.get("/test-integration", headers=bearer(tokens["access_token"]))
    ).status_code == 200
    version_before = business_row(app, CNPJ_A).token_version

    response = client.post("/oauth/rotate", headers=scoped(user_access, CNPJ_A))
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    rotated = response.json()
    assert rotated["client_id"] == credentials["client_id"]
    assert rotated["client_secret"] != credentials["client_secret"]
    assert rotated["client_secret"].startswith(CLIENT_SECRET_PREFIX)
    assert business_row(app, CNPJ_A).token_version == version_before + 1

    # Old access and refresh tokens are dead.
    assert (
        client.get("/test-integration", headers=bearer(tokens["access_token"]))
    ).status_code == 401
    assert oauth_refresh(client, tokens["refresh_token"]).status_code == 401
    # A stale-version refresh is not treated as reuse: no further bump.
    assert business_row(app, CNPJ_A).token_version == version_before + 1

    # Old secret fails, new secret works.
    assert oauth_login(client, credentials).status_code == 401
    new_tokens = oauth_login(client, rotated)
    assert new_tokens.status_code == 200
    assert (
        client.get(
            "/test-integration", headers=bearer(new_tokens.json()["access_token"])
        )
    ).status_code == 200
    assert oauth_refresh(client, new_tokens.json()["refresh_token"]).status_code == 200


def test_rotate_only_affects_the_callers_business(
    app: FastAPI, client: TestClient, user_access: str, session: Session
) -> None:
    # Give B credentials through its own member.
    bruno = login(client, OTHER_EMAIL)
    b_creds = client.post("/oauth/generate", headers=scoped(bruno, CNPJ_B)).json()
    b_before = business_row(app, CNPJ_B)

    response = client.post("/oauth/rotate", headers=scoped(user_access, CNPJ_B))
    assert response.status_code == 403
    b_after = business_row(app, CNPJ_B)
    assert b_after.client_secret_hash == b_before.client_secret_hash
    assert b_after.token_version == b_before.token_version
    assert oauth_login(client, b_creds).status_code == 200


def test_rotate_conflicts_when_the_hash_changed(
    app: FastAPI, session: Session, credentials: dict[str, str], monkeypatch
) -> None:
    """The UPDATE is conditional on the hash just read; a concurrent rotation
    committing in between makes it match no row."""
    business_id = business_row(app, CNPJ_A).id
    real_execute = session.execute
    calls = {"n": 0}

    def execute(statement, *args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 2:  # just before the conditional UPDATE
            with app.state.session_factory() as other, other.begin():
                other.execute(
                    update(Business)
                    .where(Business.id == business_id)
                    .values(client_secret_hash="0" * 64)
                )
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(session, "execute", execute)
    with pytest.raises(service.RotationConflict):
        service.rotate_secret(session, business_id)
    monkeypatch.undo()
    assert business_row(app, CNPJ_A).client_secret_hash == "0" * 64


# POST /oauth/login


def test_login_returns_tokens_in_the_body(
    app: FastAPI, client: TestClient, credentials: dict[str, str]
) -> None:
    response = oauth_login(client, credentials)  # no CSRF header
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in response.headers
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in", "refresh_token"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 300

    claims = jwt.decode(
        body["access_token"],
        JWT_SECRET,
        algorithms=[ALGORITHM],
        audience="integration",
    )
    business = business_row(app, CNPJ_A)
    assert claims["sub"] == str(business.id)
    assert claims["aud"] == "integration"
    assert claims["scope"] == "integration"
    assert claims["tv"] == business.token_version
    # The refresh token is stored hashed, with the business's version.
    rows = refresh_rows(app, CNPJ_A)
    assert len(rows) == 1
    assert rows[0].token_hash != body["refresh_token"]
    assert rows[0].token_version == business.token_version


@pytest.mark.parametrize(
    "override",
    [
        {"client_secret": "quick_api_wrong"},
        {"client_id": "quick_client_unknown"},
        {"client_id": "quick_client_unknown", "client_secret": "quick_api_wrong"},
        {"client_secret": ""},
        {"client_id": ""},
        {"client_secret": "x" * 200},
    ],
)
def test_login_rejects_wrong_credentials(
    client: TestClient, credentials: dict[str, str], override: dict[str, str]
) -> None:
    # Unknown client_id and wrong secret get the identical response.
    response = oauth_login(client, {**credentials, **override})
    assert_invalid_client(response)


def test_login_accepts_a_secret_containing_colons(
    app: FastAPI, client: TestClient, credentials: dict[str, str]
) -> None:
    """The header is split on its first ':' only."""
    secret = "quick_api_a:b::c:"
    set_secret(app, CNPJ_A, secret)
    response = oauth_login(client, {**credentials, "client_secret": secret})
    assert response.status_code == 200, response.text
    assert set(response.json()) >= {"access_token", "expires_in", "refresh_token"}
    # A split on the last ':' would send a different id and secret.
    assert (
        oauth_login(
            client,
            {
                "client_id": f"{credentials['client_id']}:quick_api_a:b:",
                "client_secret": "c",
            },
        ).status_code
        == 401
    )


def _encoded(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        "",
        "Basic",
        "Basic ",
        "Bearer {valid}",
        "Digest {valid}",
        "Basic not-base64!!",
        "Basic {valid_with_junk}",
        "Basic " + _encoded(b"no-colon-here"),
        "Basic " + _encoded(b":secret-only"),
        "Basic " + _encoded(b"client-only:"),
        "Basic " + _encoded(b":"),
        "Basic " + _encoded("cliént:sécret".encode()),
        "Basic " + _encoded(b"\xff\xfe:\xff"),
        "Basic " + "A" * 4000,
    ],
)
def test_login_rejects_a_malformed_authorization_header(
    client: TestClient, credentials: dict[str, str], authorization: str | None
) -> None:
    valid = basic(credentials["client_id"], credentials["client_secret"])
    encoded = valid["Authorization"].removeprefix("Basic ")
    headers = {}
    if authorization is not None:
        headers["Authorization"] = authorization.format(
            valid=encoded, valid_with_junk=encoded[:4] + "*" + encoded[4:]
        )
    response = client.post("/oauth/login", headers=headers, data=GRANT)
    assert_invalid_client(response)
    # Nothing of the header comes back.
    assert encoded not in response.text
    assert credentials["client_secret"] not in response.text
    assert credentials["client_id"] not in response.text


def test_login_accepts_a_lowercase_scheme(
    client: TestClient, credentials: dict[str, str]
) -> None:
    header = basic(credentials["client_id"], credentials["client_secret"])
    header["Authorization"] = header["Authorization"].replace("Basic", "basic", 1)
    assert client.post("/oauth/login", headers=header, data=GRANT).status_code == 200


def test_login_no_longer_accepts_a_json_body(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post(
        "/oauth/login",
        json={
            "client_id": credentials["client_id"],
            "client_secret": credentials["client_secret"],
        },
    )
    assert_unsupported_grant(response)
    assert credentials["client_secret"] not in response.text


@pytest.mark.parametrize(
    "kwargs",
    [
        {},  # no body
        {"data": {}},
        {"data": {"grant_type": ""}},
        {"data": {"grant_type": "password"}},
        {"data": {"grant_type": "Client_Credentials"}},
        {"data": {"grant_type": " client_credentials"}},
        {"data": {"grant_type": "refresh_token"}},
        {"data": {"other": "client_credentials"}},
        {"json": {"grant_type": "client_credentials"}},
        {"json": {}},
        {"params": {"grant_type": "client_credentials"}},
        {"content": b"", "headers": {"Content-Type": "text/plain"}},
    ],
)
def test_login_rejects_an_unsupported_grant_type(
    client: TestClient, credentials: dict[str, str], kwargs: dict
) -> None:
    """Valid credentials, but no form grant_type=client_credentials."""
    headers = {
        **basic(credentials["client_id"], credentials["client_secret"]),
        **kwargs.pop("headers", {}),
    }
    response = client.post("/oauth/login", headers=headers, **kwargs)
    assert_unsupported_grant(response)
    assert credentials["client_secret"] not in response.text
    # Nothing was issued.
    assert refresh_rows(client.app, CNPJ_A) == []


@pytest.mark.parametrize("authorization", [None, "Basic not-base64!!"])
def test_login_checks_the_grant_type_before_the_credentials(
    client: TestClient, authorization: str | None
) -> None:
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.post(
        "/oauth/login", headers=headers, data={"grant_type": "password"}
    )
    assert_unsupported_grant(response)


@pytest.mark.parametrize(
    "values",
    [
        ["client_credentials", "client_credentials"],
        ["password", "client_credentials"],
        ["client_credentials", "password"],
        ["client_credentials", "client_credentials", "client_credentials"],
    ],
)
def test_login_rejects_a_repeated_grant_type(
    client: TestClient, credentials: dict[str, str], values: list[str]
) -> None:
    """RFC 6749 section 3.2: request parameters must not repeat."""
    response = client.post(
        "/oauth/login",
        headers=basic(credentials["client_id"], credentials["client_secret"]),
        data={"grant_type": values},
    )
    assert_invalid_request(response)
    assert credentials["client_secret"] not in response.text
    assert "client_credentials" not in response.text
    assert refresh_rows(client.app, CNPJ_A) == []


@pytest.mark.parametrize("authorization", [None, "Basic not-base64!!"])
def test_login_checks_a_repeated_grant_type_before_the_credentials(
    client: TestClient, authorization: str | None
) -> None:
    headers = {} if authorization is None else {"Authorization": authorization}
    response = client.post(
        "/oauth/login",
        headers=headers,
        data={"grant_type": ["client_credentials", "client_credentials"]},
    )
    assert_invalid_request(response)


def test_login_rejects_a_repeated_grant_type_in_a_raw_body(
    client: TestClient, credentials: dict[str, str]
) -> None:
    response = client.post(
        "/oauth/login",
        headers={
            **basic(credentials["client_id"], credentials["client_secret"]),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        content=b"grant_type=password&grant_type=client_credentials",
    )
    assert_invalid_request(response)


def test_login_never_answers_422(
    client: TestClient, credentials: dict[str, str]
) -> None:
    header = basic(credentials["client_id"], credentials["client_secret"])
    for data in ({}, {"grant_type": ["a", "b"]}):
        response = client.post("/oauth/login", headers=header, data=data)
        assert response.status_code == 400


def test_login_does_not_log_the_authorization_header(
    client: TestClient, credentials: dict[str, str], caplog
) -> None:
    header = basic(credentials["client_id"], credentials["client_secret"])
    encoded = header["Authorization"].removeprefix("Basic ")
    with caplog.at_level("DEBUG"):
        ok = client.post("/oauth/login", headers=header, data=GRANT)
        assert ok.status_code == 200
        bad = {"Authorization": "Basic " + encoded + "*"}
        assert client.post("/oauth/login", headers=bad, data=GRANT).status_code == 401
        grant = {"grant_type": "password-" + credentials["client_secret"]}
        assert (
            client.post("/oauth/login", headers=header, data=grant).status_code == 400
        )
        repeated = {"grant_type": ["client_credentials", grant["grant_type"]]}
        assert (
            client.post("/oauth/login", headers=header, data=repeated).status_code
            == 400
        )
    for record in caplog.records:
        message = record.getMessage()
        assert encoded not in message
        assert credentials["client_secret"] not in message
        assert ok.json()["access_token"] not in message


def test_login_documents_basic_auth_and_the_grant_type_form(app: FastAPI) -> None:
    openapi = app.openapi()
    operation = openapi["paths"]["/oauth/login"]["post"]
    body = operation["requestBody"]
    assert body["required"] is True
    assert list(body["content"]) == ["application/x-www-form-urlencoded"]
    ref = body["content"]["application/x-www-form-urlencoded"]["schema"]["$ref"]
    schema = openapi["components"]["schemas"][ref.rsplit("/", 1)[-1]]
    assert schema["required"] == ["grant_type"]
    assert schema["properties"] == {
        "grant_type": {
            "type": "string",
            "enum": ["client_credentials"],
            "title": "Grant Type",
        }
    }
    assert operation["security"] == [{"ClientCredentialsBasic": []}]
    error = operation["responses"]["400"]["content"]["application/json"]["schema"]
    assert error["properties"]["error"]["enum"] == [
        "invalid_request",
        "unsupported_grant_type",
    ]
    assert all(p["in"] != "query" for p in operation.get("parameters", []))
    schemes = openapi["components"]["securitySchemes"]
    assert schemes["ClientCredentialsBasic"]["scheme"] == "basic"
    assert "OAuthLoginIn" not in openapi["components"]["schemas"]


def test_login_rejects_an_inactive_business(
    app: FastAPI, client: TestClient, credentials: dict[str, str]
) -> None:
    with app.state.session_factory() as session, session.begin():
        session.execute(update(Business).values(is_active=False))
    assert oauth_login(client, credentials).status_code == 401


def test_inactive_business_tokens_are_rejected(
    app: FastAPI, integration_client: TestClient, credentials: dict[str, str]
) -> None:
    tokens = oauth_login(integration_client, credentials).json()
    with app.state.session_factory() as session, session.begin():
        session.execute(update(Business).values(is_active=False))
    response = integration_client.get(
        "/test-integration", headers=bearer(tokens["access_token"])
    )
    assert response.status_code == 401
    assert oauth_refresh(integration_client, tokens["refresh_token"]).status_code == 401


def test_issue_session_fails_if_the_secret_rotated_meanwhile(
    app: FastAPI, session: Session, credentials: dict[str, str], settings: Settings
) -> None:
    business = service.authenticate(
        session, credentials["client_id"], credentials["client_secret"]
    )
    with app.state.session_factory() as other:
        service.rotate_secret(other, business.id)
    with pytest.raises(service.InvalidClientCredentials):
        service.issue_session(session, business, settings)
    assert refresh_rows(app, CNPJ_A) == []


def test_validation_errors_do_not_echo_tokens(client: TestClient) -> None:
    long_token = "r" * 500
    response = client.post("/oauth/refresh", json={"refresh_token": long_token})
    assert response.status_code == 422
    assert long_token not in response.text
    assert "input" not in response.json()["detail"][0]


def test_other_routes_keep_the_default_validation_errors(client: TestClient) -> None:
    response = client.post("/auth/login", json={"email": "nope", "password": "x"})
    assert response.status_code == 422
    assert "input" in response.json()["detail"][0]


# POST /oauth/refresh


def test_refresh_rotates_the_token(
    app: FastAPI, integration_client: TestClient, credentials: dict[str, str]
) -> None:
    client = integration_client
    first = oauth_login(client, credentials).json()
    response = oauth_refresh(client, first["refresh_token"])
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    second = response.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert (
        client.get("/test-integration", headers=bearer(second["access_token"]))
    ).status_code == 200

    rows = refresh_rows(app, CNPJ_A)
    assert [row.revoked_reason for row in rows] == ["rotated", None]
    assert rows[0].replaced_by_id == rows[1].id


def test_refresh_reuse_revokes_all_business_sessions(
    app: FastAPI, integration_client: TestClient, credentials: dict[str, str]
) -> None:
    client = integration_client
    first = oauth_login(client, credentials).json()
    other_session = oauth_login(client, credentials).json()
    second = oauth_refresh(client, first["refresh_token"]).json()
    version = business_row(app, CNPJ_A).token_version

    # Replaying the rotated-out token is reuse.
    response = oauth_refresh(client, first["refresh_token"])
    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token was already used."}
    assert business_row(app, CNPJ_A).token_version == version + 1
    assert all(row.revoked_at is not None for row in refresh_rows(app, CNPJ_A))

    # Every session of the business is gone, access and refresh.
    for tokens in (second, other_session):
        assert oauth_refresh(client, tokens["refresh_token"]).status_code == 401
        assert (
            client.get("/test-integration", headers=bearer(tokens["access_token"]))
        ).status_code == 401
    # The credentials still work for a fresh login.
    assert oauth_login(client, credentials).status_code == 200


def test_refresh_reuse_spares_a_generation_committed_meanwhile(
    app: FastAPI,
    integration_client: TestClient,
    credentials: dict[str, str],
    settings: Settings,
) -> None:
    client = integration_client
    first = oauth_login(client, credentials).json()
    oauth_refresh(client, first["refresh_token"])  # rotates `first` out
    business_id = business_row(app, CNPJ_A).id
    version = business_row(app, CNPJ_A).token_version
    newer: list[service.IssuedIntegrationSession] = []
    fired: list[bool] = []

    def concurrent_rotation(conn, cursor, statement, *args) -> None:
        # Before the replay's first write: a secret rotation and a login with
        # the new secret commit in another session, after the replay's reads.
        if fired or not statement.lstrip().upper().startswith("UPDATE"):
            return
        fired.append(True)  # once; the statements below also reach this hook
        with app.state.session_factory() as other:
            rotated = service.rotate_secret(other, business_id)
            business = service.authenticate(
                other, rotated.client_id, rotated.client_secret
            )
            newer.append(service.issue_session(other, business, settings))

    engine = app.state.session_factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", concurrent_rotation)
    try:
        response = oauth_refresh(client, first["refresh_token"])
    finally:
        event.remove(engine, "before_cursor_execute", concurrent_rotation)

    # The replayed token's generation died with the rotation: a plain 401
    # that leaves the newer session alone.
    assert newer
    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token is invalid or expired."}
    assert business_row(app, CNPJ_A).token_version == version + 1
    assert (
        client.get("/test-integration", headers=bearer(newer[0].access_token))
    ).status_code == 200
    assert oauth_refresh(client, newer[0].refresh_token).status_code == 200


def test_refresh_reuse_leaves_other_businesses_alone(
    app: FastAPI, client: TestClient, credentials: dict[str, str]
) -> None:
    bruno = login(client, OTHER_EMAIL)
    b_creds = client.post("/oauth/generate", headers=scoped(bruno, CNPJ_B)).json()
    b_tokens = oauth_login(client, b_creds).json()

    first = oauth_login(client, credentials).json()
    oauth_refresh(client, first["refresh_token"])
    assert oauth_refresh(client, first["refresh_token"]).status_code == 401
    assert oauth_refresh(client, b_tokens["refresh_token"]).status_code == 200


@pytest.mark.parametrize("token", ["garbage", ""])
def test_refresh_rejects_unknown_tokens(
    client: TestClient, credentials: dict[str, str], token: str
) -> None:
    response = oauth_refresh(client, token)
    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token is invalid or expired."}


def test_refresh_rejects_expired_tokens(
    app: FastAPI, client: TestClient, credentials: dict[str, str]
) -> None:
    tokens = oauth_login(client, credentials).json()
    with app.state.session_factory() as session, session.begin():
        session.execute(
            update(IntegrationRefreshToken).values(
                expires_at=utc_now() - timedelta(seconds=1)
            )
        )
    assert oauth_refresh(client, tokens["refresh_token"]).status_code == 401


def test_user_and_integration_refresh_tokens_are_not_interchangeable(
    client: TestClient, credentials: dict[str, str]
) -> None:
    login(client, EMAIL)
    user_refresh = client.cookies["refresh_token"]
    assert oauth_refresh(client, user_refresh).status_code == 401

    integration_refresh = oauth_login(client, credentials).json()["refresh_token"]
    client.cookies.clear()
    client.cookies.set(
        "refresh_token", integration_refresh, domain="testserver.local", path="/auth"
    )
    response = client.post(
        "/auth/refresh", headers={"X-Requested-With": "quick-portal"}
    )
    assert response.status_code == 401


# Audience separation and the integration dependency


def test_user_token_is_rejected_by_the_integration_dependency(
    integration_client: TestClient, user_access: str
) -> None:
    response = integration_client.get("/test-integration", headers=bearer(user_access))
    assert response.status_code == 401
    assert integration_client.get("/test-integration").status_code == 401


def test_integration_token_is_rejected_by_user_routes(
    client: TestClient, credentials: dict[str, str]
) -> None:
    access = oauth_login(client, credentials).json()["access_token"]
    assert client.get("/auth/me", headers=bearer(access)).status_code == 401
    assert client.get("/businesses", headers=bearer(access)).status_code == 401


def test_integration_dependency_returns_the_business(
    integration_client: TestClient, credentials: dict[str, str]
) -> None:
    access = oauth_login(integration_client, credentials).json()["access_token"]
    response = integration_client.get("/test-integration", headers=bearer(access))
    assert response.status_code == 200
    assert response.json() == {"cnpj": CNPJ_A}


def test_integration_dependency_checks_scopes(
    app: FastAPI, integration_client: TestClient, credentials: dict[str, str]
) -> None:
    access = oauth_login(integration_client, credentials).json()["access_token"]
    response = integration_client.get(
        "/test-integration-extra-scope", headers=bearer(access)
    )
    assert response.status_code == 403

    # A correctly signed integration token without the integration scope.
    business = business_row(app, CNPJ_A)
    now = utc_now()
    token = jwt.encode(
        {
            "sub": str(business.id),
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "typ": "access",
            "aud": "integration",
            "scope": "other",
            "tv": business.token_version,
        },
        JWT_SECRET,
        algorithm=ALGORITHM,
    )
    response = integration_client.get("/test-integration", headers=bearer(token))
    assert response.status_code == 403


def test_integration_dependency_rejects_a_stale_token_version(
    app: FastAPI, integration_client: TestClient, credentials: dict[str, str]
) -> None:
    access = oauth_login(integration_client, credentials).json()["access_token"]
    with app.state.session_factory() as session, session.begin():
        session.execute(
            update(Business).values(token_version=Business.token_version + 1)
        )
    response = integration_client.get("/test-integration", headers=bearer(access))
    assert response.status_code == 401


# Purge and migration


def test_purge_deletes_expired_integration_tokens(
    app: FastAPI, client: TestClient, session: Session, credentials: dict[str, str]
) -> None:
    oauth_login(client, credentials)
    assert service.purge_expired(session, utc_now() + timedelta(days=2)) == 1
    assert refresh_rows(app, CNPJ_A) == []


def test_migration_downgrades_and_upgrades(app: FastAPI, settings: Settings) -> None:
    def state() -> tuple[set[str], set[str]]:
        with app.state.session_factory() as fresh:
            inspector = inspect(fresh.connection())
            tables = set(inspector.get_table_names())
            columns = {column["name"] for column in inspector.get_columns("businesses")}
            return tables, columns

    added = {"client_id", "client_secret_hash", "token_version", "is_active"}
    tables, columns = state()
    assert "integration_refresh_tokens" in tables
    assert added <= columns
    config = alembic_config(settings)
    command.downgrade(config, "128d0576edd9")
    tables, columns = state()
    assert "integration_refresh_tokens" not in tables
    assert not added & columns
    command.upgrade(config, "head")
    tables, columns = state()
    assert "integration_refresh_tokens" in tables
    assert added <= columns
