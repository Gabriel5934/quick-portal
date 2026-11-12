"""Cloudflare Turnstile on /auth/register.

Cloudflare is never reached: ``responses`` intercepts every ``requests`` call
(the test client uses httpx, which ``responses`` does not touch).
"""

import json
from collections.abc import Iterator
from dataclasses import replace
from urllib.parse import parse_qs

import httpx
import pytest
import requests
import responses
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth import turnstile
from app.auth.models import User
from app.config import Settings
from tests.conftest import PASSWORD, TURNSTILE_TOKEN

EMAIL = "ana@example.com"
SECRET = "test-turnstile-secret"  # noqa: S105
HOSTNAMES = ("localhost", "127.0.0.1", "quick-portal-sandbox.duckdns.org")


@pytest.fixture
def turnstile_passes() -> None:
    """Overrides conftest's autouse fixture: the real verify runs here."""


@pytest.fixture
def settings(settings: Settings) -> Settings:
    return replace(settings, turnstile_secret=SECRET, turnstile_hostnames=HOSTNAMES)


@pytest.fixture
def cloudflare() -> Iterator[responses.RequestsMock]:
    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        yield mock


def siteverify(
    mock: responses.RequestsMock,
    *,
    success: bool = True,
    action: str = "register",
    hostname: str = "localhost",
) -> None:
    mock.add(
        responses.POST,
        turnstile.SITEVERIFY_URL,
        json={"success": success, "action": action, "hostname": hostname},
    )


def post_register(client: TestClient, **overrides) -> httpx.Response:
    body = {"email": EMAIL, "password": PASSWORD, "turnstile_token": TURNSTILE_TOKEN}
    body.update(overrides)
    return client.post("/auth/register", json={k: v for k, v in body.items() if v})


def users(app: FastAPI) -> list[User]:
    with app.state.session_factory() as session:
        return list(session.scalars(select(User)))


def test_success_creates_the_user(
    app: FastAPI, client: TestClient, cloudflare: responses.RequestsMock
) -> None:
    siteverify(cloudflare, hostname="quick-portal-sandbox.duckdns.org")
    response = post_register(client)
    assert response.status_code == 201, response.text
    assert [user.email for user in users(app)] == [EMAIL]

    (call,) = cloudflare.calls
    form = parse_qs(call.request.body)
    assert form == {"secret": [SECRET], "response": [TURNSTILE_TOKEN]}


@pytest.mark.parametrize(
    "result",
    [
        {"success": False},
        {"action": "login"},
        {"hostname": "evil.example.com"},
    ],
    ids=["success-false", "wrong-action", "hostname-not-allowed"],
)
def test_rejected_verification_does_not_create_the_user(
    app: FastAPI,
    client: TestClient,
    cloudflare: responses.RequestsMock,
    result: dict,
) -> None:
    siteverify(cloudflare, **result)
    response = post_register(client)
    assert response.status_code == 400
    assert response.json() == {"detail": "Captcha verification failed."}
    assert users(app) == []


def test_network_error_rejects(
    app: FastAPI, client: TestClient, cloudflare: responses.RequestsMock
) -> None:
    cloudflare.add(
        responses.POST,
        turnstile.SITEVERIFY_URL,
        body=requests.ConnectionError("unreachable"),
    )
    assert post_register(client).status_code == 400
    assert users(app) == []


@pytest.mark.parametrize(
    ("status", "body"),
    [(500, json.dumps({"success": True})), (200, "not json"), (200, "[]")],
    ids=["non-2xx", "non-json", "non-object"],
)
def test_bad_siteverify_response_rejects(
    settings: Settings, cloudflare: responses.RequestsMock, status: int, body: str
) -> None:
    cloudflare.add(responses.POST, turnstile.SITEVERIFY_URL, status=status, body=body)
    assert turnstile.verify(settings, TURNSTILE_TOKEN) is False


@pytest.mark.parametrize(
    "changes",
    [{"turnstile_secret": ""}, {"turnstile_hostnames": ()}],
    ids=["missing-secret", "empty-allowlist"],
)
def test_missing_configuration_rejects_without_calling_cloudflare(
    app: FastAPI,
    settings: Settings,
    cloudflare: responses.RequestsMock,
    changes: dict,
) -> None:
    siteverify(cloudflare)
    app.state.settings = replace(settings, **changes)
    with TestClient(app) as client:
        assert post_register(client).status_code == 400
    assert len(cloudflare.calls) == 0
    assert users(app) == []


@pytest.mark.parametrize("token", [None, "a" * 2049], ids=["missing", "too-long"])
def test_missing_or_oversized_token_is_invalid(
    app: FastAPI,
    client: TestClient,
    cloudflare: responses.RequestsMock,
    token: str | None,
) -> None:
    siteverify(cloudflare)
    response = post_register(client, turnstile_token=token)
    assert response.status_code == 422
    assert len(cloudflare.calls) == 0
    assert users(app) == []


def test_empty_token_is_rejected_without_calling_cloudflare(
    settings: Settings, cloudflare: responses.RequestsMock
) -> None:
    siteverify(cloudflare)
    assert turnstile.verify(settings, "") is False
    assert len(cloudflare.calls) == 0


def test_hostnames_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TURNSTILE_SECRET", SECRET)
    monkeypatch.setenv(
        "TURNSTILE_HOSTNAMES",
        " localhost, ,127.0.0.1 ,quick-portal-sandbox.duckdns.org,",
    )
    settings = Settings.from_env()
    assert settings.turnstile_hostnames == HOSTNAMES
    assert SECRET not in repr(settings)
