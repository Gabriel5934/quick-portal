"""GET /cielo/transactions: Beacon's transaction page behind Quick API auth.

Beacon is never reached: ``responses`` intercepts every ``requests`` call.
"""

from collections.abc import Iterator
from dataclasses import replace

import pytest
import requests
import responses
from alembic import command
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.beacon.client import (
    BeaconInvalidResponse,
    BeaconNotConfigured,
    BeaconTimeout,
    BeaconUnavailable,
    BeaconUpstreamError,
)
from app.config import Settings
from app.main import create_app
from tests.conftest import alembic_config, bearer, login, register
from tests.test_beacon import BEACON_IP, PAGE, PORTAL_TOKEN, TRANSACTIONS_URL

TRANSACTIONS = "/cielo/transactions"


@pytest.fixture
def beacon_app(settings: Settings) -> FastAPI:
    configured = replace(
        settings, beacon_private_ip=BEACON_IP, beacon_portal_token=PORTAL_TOKEN
    )
    application = create_app(configured)
    command.upgrade(alembic_config(configured), "head")
    return application


@pytest.fixture
def beacon_client(beacon_app: FastAPI) -> Iterator[TestClient]:
    with TestClient(beacon_app) as test_client:
        yield test_client


@pytest.fixture
def auth(beacon_client: TestClient) -> dict[str, str]:
    register(beacon_client, "ana@example.com")
    return bearer(login(beacon_client, "ana@example.com"))


@pytest.fixture
def beacon_http() -> Iterator[responses.RequestsMock]:
    with responses.RequestsMock() as mock:
        yield mock


def test_requires_a_bearer_token(
    beacon_client: TestClient, beacon_http: responses.RequestsMock
) -> None:
    assert beacon_client.get(TRANSACTIONS).status_code == 401
    response = beacon_client.get(TRANSACTIONS, headers=bearer("not-a-jwt"))
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert len(beacon_http.calls) == 0


def test_returns_beacons_page(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
) -> None:
    beacon_http.get(
        TRANSACTIONS_URL,
        json={**PAGE, "items": [{**PAGE["items"][0], "body": "secret"}]},
        match=[
            responses.matchers.query_param_matcher({"limit": "10", "offset": "20"}),
            responses.matchers.header_matcher({"X-Portal-Token": PORTAL_TOKEN}),
        ],
    )

    response = beacon_client.get(
        TRANSACTIONS, params={"limit": 10, "offset": 20}, headers=auth
    )

    assert response.status_code == 200, response.text
    # Unknown fields are dropped; the rest is returned as Beacon sent it.
    assert response.json() == PAGE
    assert set(response.json()["items"][0]) == {
        "id",
        "payment_id",
        "change_type",
        "recurrent_payment_id",
        "received_at",
    }


def test_default_paging(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
) -> None:
    page = {"items": [], "total": 0, "limit": 50, "offset": 0}
    beacon_http.get(
        TRANSACTIONS_URL,
        json=page,
        match=[responses.matchers.query_param_matcher({"limit": "50", "offset": "0"})],
    )

    response = beacon_client.get(TRANSACTIONS, headers=auth)

    assert response.status_code == 200, response.text
    assert response.json() == page


@pytest.mark.parametrize(
    "params",
    [{"limit": 0}, {"limit": 101}, {"limit": "x"}, {"offset": -1}, {"offset": "x"}],
)
def test_invalid_paging_is_a_422(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
    params: dict,
) -> None:
    response = beacon_client.get(TRANSACTIONS, params=params, headers=auth)

    assert response.status_code == 422
    assert len(beacon_http.calls) == 0


def test_not_configured(client: TestClient) -> None:
    register(client, "ana@example.com")
    headers = bearer(login(client, "ana@example.com"))

    response = client.get(TRANSACTIONS, headers=headers)

    assert response.status_code == BeaconNotConfigured.status_code == 503
    assert response.json() == {"message": BeaconNotConfigured.message}


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (requests.ReadTimeout(), BeaconTimeout),
        (requests.ConnectionError(), BeaconUnavailable),
    ],
)
def test_transport_errors(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
    body: Exception,
    expected: type[Exception],
) -> None:
    beacon_http.get(TRANSACTIONS_URL, body=body)

    response = beacon_client.get(TRANSACTIONS, headers=auth)

    assert response.status_code == expected.status_code
    assert response.json() == {"message": expected.message}


@pytest.mark.parametrize("upstream_status", [401, 422, 500])
def test_upstream_error_is_not_relayed(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
    upstream_status: int,
) -> None:
    beacon_http.get(
        TRANSACTIONS_URL, status=upstream_status, json={"detail": "upstream detail"}
    )

    response = beacon_client.get(TRANSACTIONS, headers=auth)

    assert response.status_code == BeaconUpstreamError.status_code == 502
    assert response.json() == {"message": BeaconUpstreamError.message}
    assert "upstream detail" not in response.text


@pytest.mark.parametrize(
    "body",
    [
        {"items": [], "total": 0, "limit": 50},
        {**PAGE, "items": [{**PAGE["items"][0], "change_type": 99}]},
        {**PAGE, "items": [{**PAGE["items"][0], "payment_id": "not-a-uuid"}]},
        [],
    ],
)
def test_invalid_page_is_a_502(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
    body: object,
) -> None:
    beacon_http.get(TRANSACTIONS_URL, json=body)

    response = beacon_client.get(TRANSACTIONS, headers=auth)

    assert response.status_code == 502
    assert response.json() == {"message": BeaconInvalidResponse.message}


def test_non_json_page_is_a_502(
    beacon_client: TestClient,
    auth: dict[str, str],
    beacon_http: responses.RequestsMock,
) -> None:
    beacon_http.get(TRANSACTIONS_URL, body="<html>")

    response = beacon_client.get(TRANSACTIONS, headers=auth)

    assert response.status_code == 502
    assert response.json() == {"message": BeaconInvalidResponse.message}
