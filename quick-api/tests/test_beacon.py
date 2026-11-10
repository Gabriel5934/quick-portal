"""Beacon settings and the private-network client (app.beacon.client).

Beacon is never reached: ``responses`` intercepts every ``requests`` call.
"""

from dataclasses import replace

import pytest
import requests
import responses

from app.beacon.client import (
    TIMEOUT_SECONDS,
    BeaconInvalidResponse,
    BeaconNotConfigured,
    BeaconTimeout,
    BeaconUnavailable,
    BeaconUpstreamError,
    list_transactions,
)
from app.config import Settings
from app.main import create_app
from tests.conftest import JWT_SECRET

BEACON_IP = "172.26.0.10"
PORTAL_TOKEN = "test-portal-token"
TRANSACTIONS_URL = f"http://{BEACON_IP}:8000/transactions"
PAGE = {
    "items": [
        {
            "id": 1,
            "payment_id": "0b7b7d3c-3f4e-4a8b-9a51-1d2f3e4a5b6c",
            "change_type": 1,
            "recurrent_payment_id": None,
            "received_at": "2026-11-09T12:00:00",
        }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0,
}


@pytest.fixture
def beacon_settings(settings: Settings) -> Settings:
    return replace(
        settings, beacon_private_ip=BEACON_IP, beacon_portal_token=PORTAL_TOKEN
    )


# --- Settings ----------------------------------------------------------------


def test_beacon_is_optional(settings: Settings) -> None:
    assert settings.beacon_base_url == ""
    settings.validate()


def test_settings_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", JWT_SECRET)
    monkeypatch.setenv("BEACON_PRIVATE_IP", f" {BEACON_IP} ")
    monkeypatch.setenv("BEACON_PORTAL_TOKEN", PORTAL_TOKEN)
    settings = Settings.from_env()

    assert settings.beacon_base_url == f"http://{BEACON_IP}:8000"
    assert settings.beacon_portal_token == PORTAL_TOKEN
    assert PORTAL_TOKEN not in repr(settings)


def test_settings_from_env_without_beacon(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", JWT_SECRET)
    monkeypatch.delenv("BEACON_PRIVATE_IP", raising=False)
    monkeypatch.delenv("BEACON_PORTAL_TOKEN", raising=False)
    settings = Settings.from_env()

    assert settings.beacon_base_url == ""
    assert settings.beacon_portal_token == ""


@pytest.mark.parametrize("host", [BEACON_IP, "beacon", "beacon.internal", "ip-1-2"])
def test_valid_beacon_hosts(settings: Settings, host: str) -> None:
    replace(settings, beacon_private_ip=host).validate()


@pytest.mark.parametrize(
    "host",
    [
        "http://172.26.0.10",
        "172.26.0.10:8000",
        "172.26.0.10/transactions",
        "172.26.0.256",
        "1.2.3",
        "::1",
        "[::1]",
        "-beacon",
        "beacon-",
        "bea con",
        "beacon..internal",
        "user@beacon",
    ],
)
def test_invalid_beacon_hosts_are_rejected(settings: Settings, host: str) -> None:
    with pytest.raises(ValueError, match="BEACON_PRIVATE_IP"):
        create_app(replace(settings, beacon_private_ip=host))


# --- Client ------------------------------------------------------------------


@pytest.mark.parametrize(
    "overrides",
    [
        {"beacon_private_ip": ""},
        {"beacon_portal_token": ""},
        {"beacon_private_ip": "", "beacon_portal_token": ""},
    ],
)
@responses.activate
def test_not_configured(beacon_settings: Settings, overrides: dict) -> None:
    with pytest.raises(BeaconNotConfigured):
        list_transactions(replace(beacon_settings, **overrides), limit=10, offset=0)
    assert len(responses.calls) == 0


@responses.activate
def test_list_transactions(beacon_settings: Settings) -> None:
    responses.get(
        TRANSACTIONS_URL,
        json=PAGE,
        match=[
            responses.matchers.query_param_matcher({"limit": "10", "offset": "20"}),
            responses.matchers.header_matcher({"X-Portal-Token": PORTAL_TOKEN}),
        ],
    )

    assert list_transactions(beacon_settings, limit=10, offset=20) == PAGE
    (call,) = responses.calls
    assert call.request.req_kwargs["timeout"] == TIMEOUT_SECONDS == 120


@pytest.mark.parametrize("status_code", [301, 401, 422, 500])
@responses.activate
def test_non_success_status(beacon_settings: Settings, status_code: int) -> None:
    responses.get(TRANSACTIONS_URL, status=status_code, json={"detail": "x"})

    with pytest.raises(BeaconUpstreamError) as excinfo:
        list_transactions(beacon_settings, limit=10, offset=0)
    assert excinfo.value.upstream_status == status_code


@responses.activate
def test_non_json_body(beacon_settings: Settings) -> None:
    responses.get(TRANSACTIONS_URL, body="<html>")

    with pytest.raises(BeaconInvalidResponse):
        list_transactions(beacon_settings, limit=10, offset=0)


@pytest.mark.parametrize(
    ("exception", "expected"),
    [
        (requests.ConnectTimeout(), BeaconTimeout),
        (requests.ReadTimeout(), BeaconTimeout),
        (requests.ConnectionError(), BeaconUnavailable),
    ],
)
@responses.activate
def test_transport_errors(
    beacon_settings: Settings, exception: Exception, expected: type[Exception]
) -> None:
    responses.get(TRANSACTIONS_URL, body=exception)

    with pytest.raises(expected):
        list_transactions(beacon_settings, limit=10, offset=0)
