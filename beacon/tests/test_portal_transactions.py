import uuid
from dataclasses import replace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.cielo.enums import CieloTransactionChangeType
from app.cielo.models import (
    CieloNotificationOnboardingKyc,
    CieloNotificationTransaction,
)
from app.config import Settings
from app.main import create_app
from tests.conftest import PORTAL_TOKEN, TOKEN

URL = "/transactions"
HEADER = "X-Portal-Token"
PAYMENT_ID = uuid.UUID("0b7b7d3c-3f4e-4a8b-9a51-1d2f3e4a5b6c")
ITEM_FIELDS = {"id", "payment_id", "change_type", "recurrent_payment_id", "received_at"}


def get(client: TestClient, token: str | None = PORTAL_TOKEN, **params):
    headers = {} if token is None else {HEADER: token}
    return client.get(URL, headers=headers, params=params)


def add_transactions(app: FastAPI, count: int) -> list[int]:
    """Stores ``count`` transactions (and one other notification); returns ids."""
    with app.state.session_factory() as session, session.begin():
        rows = [
            CieloNotificationTransaction(
                body=f'{{"ChangeType": 1, "n": {n}}}'.encode(),
                payment_id=PAYMENT_ID,
                change_type=CieloTransactionChangeType.TRANSACTION_STATUS,
            )
            for n in range(count)
        ]
        session.add_all(rows)
        # Other notification types must not be listed.
        session.add(CieloNotificationOnboardingKyc(body=b"{}"))
        session.flush()
        return [row.id for row in rows]


# --- Authentication ----------------------------------------------------------


@pytest.mark.parametrize(
    "token", [None, "", "wrong-token", PORTAL_TOKEN + "x", PORTAL_TOKEN[:-1], TOKEN]
)
def test_missing_or_wrong_token_is_rejected(client: TestClient, token: str | None):
    assert get(client, token).status_code == 401


def test_unconfigured_token_rejects_everything(app: FastAPI) -> None:
    unconfigured = replace(app.state.settings, portal_token="")
    with TestClient(create_app(unconfigured)) as client:
        assert get(client, token="").status_code == 401
        assert get(client, token=None).status_code == 401
        assert get(client, token=PORTAL_TOKEN).status_code == 401


def test_webhook_token_is_not_accepted(client: TestClient) -> None:
    response = client.get(URL, headers={"X-Cielo-Webhook-Token": TOKEN})

    assert response.status_code == 401


def test_portal_token_is_not_accepted_for_notifications(client: TestClient) -> None:
    response = client.post(
        "/cielo/notifications", content=b"{}", headers={HEADER: PORTAL_TOKEN}
    )

    assert response.status_code == 401


def test_header_name_is_case_insensitive(client: TestClient) -> None:
    response = client.get(URL, headers={"x-portal-token": PORTAL_TOKEN})

    assert response.status_code == 200


# --- Pagination --------------------------------------------------------------


def test_empty(client: TestClient) -> None:
    response = get(client)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "limit": 50, "offset": 0}


def test_defaults_return_the_first_50_by_id(app: FastAPI, client: TestClient) -> None:
    ids = add_transactions(app, 55)

    body = get(client).json()

    assert body["total"] == 55
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert [item["id"] for item in body["items"]] == ids[:50]


def test_limit_and_offset(app: FastAPI, client: TestClient) -> None:
    ids = add_transactions(app, 7)

    body = get(client, limit=3, offset=2).json()

    assert body["total"] == 7
    assert body["limit"] == 3
    assert body["offset"] == 2
    assert [item["id"] for item in body["items"]] == ids[2:5]


def test_offset_past_the_end_is_empty(app: FastAPI, client: TestClient) -> None:
    add_transactions(app, 3)

    body = get(client, offset=10).json()

    assert body == {"items": [], "total": 3, "limit": 50, "offset": 10}


@pytest.mark.parametrize(("limit", "offset"), [(1, 0), (100, 0), (50, 0)])
def test_limit_bounds_are_accepted(client: TestClient, limit: int, offset: int):
    assert get(client, limit=limit, offset=offset).status_code == 200


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": -1},
        {"limit": 101},
        {"offset": -1},
        {"limit": "abc"},
        {"offset": "abc"},
    ],
)
def test_out_of_range_params_are_rejected(client: TestClient, params: dict) -> None:
    assert get(client, **params).status_code == 422


def test_bad_params_without_token_are_rejected_with_401(client: TestClient) -> None:
    assert get(client, token=None, limit=0).status_code == 401


# --- Fields ------------------------------------------------------------------


def test_items_exclude_the_raw_body(app: FastAPI, client: TestClient) -> None:
    recurrent_id = uuid.uuid4()
    with app.state.session_factory() as session, session.begin():
        row = CieloNotificationTransaction(
            body=b'{"secret": "raw"}',
            payment_id=PAYMENT_ID,
            change_type=CieloTransactionChangeType.PARTIALLY_CANCELLED_OR_REFUNDED,
            recurrent_payment_id=recurrent_id,
        )
        session.add(row)
        session.flush()
        row_id = row.id

    response = get(client)

    assert response.status_code == 200
    assert b"raw" not in response.content
    (item,) = response.json()["items"]
    assert set(item) == ITEM_FIELDS
    assert item["id"] == row_id
    assert item["payment_id"] == str(PAYMENT_ID)
    assert item["change_type"] == int(
        CieloTransactionChangeType.PARTIALLY_CANCELLED_OR_REFUNDED
    )
    assert item["recurrent_payment_id"] == str(recurrent_id)
    assert item["received_at"] is not None


def test_null_fields_are_returned_as_null(app: FastAPI, client: TestClient) -> None:
    with app.state.session_factory() as session, session.begin():
        session.add(CieloNotificationTransaction(body=b"{}"))

    (item,) = get(client).json()["items"]

    assert item["payment_id"] is None
    assert item["change_type"] is None
    assert item["recurrent_payment_id"] is None


def test_settings_from_env_portal_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PORTAL_TOKEN", "from-env")
    settings = Settings.from_env()

    assert settings.portal_token == "from-env"
    assert "from-env" not in repr(settings)
