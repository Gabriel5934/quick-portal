"""Cielo token management, seller onboarding (POST /cielo/onboard) and
listing (GET /cielo/get-sellers).

Cielo is never reached: ``responses`` intercepts every ``requests`` call. The
test client itself uses httpx, which ``responses`` does not touch.
"""

import base64
import json
import logging
import threading
import time
import uuid
from collections.abc import Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs

import pytest
import requests
import responses
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from app.auth.models import User
from app.cielo import service
from app.cielo.errors import CieloInvalidCredentials, CieloInvalidResponse
from app.cielo.http import TIMEOUT_SECONDS
from app.cielo.models import CieloDocumentType, CieloSeller, CieloSellerMembership
from app.cielo.tokens import EXPIRY_MARGIN_SECONDS, CieloTokenManager
from app.config import Settings
from app.main import create_app
from tests.conftest import (
    CIELO_AUTH_BASE_URL,
    CIELO_CLIENT_SECRET,
    CIELO_MERCHANT_ID,
    CIELO_ONBOARDING_BASE_URL,
    bearer,
    login,
    register,
)

TOKEN_URL = CIELO_AUTH_BASE_URL + "/oauth2/token"
ONBOARD_URL = CIELO_ONBOARDING_BASE_URL + "/api/merchants"
SELLER_ID = "5dcee8e4-f432-42e4-a2a6-5a30c8ce2ca5"
CNPJ = "96462142000140"
CPF = "64829167000"
CONTACT_NAME = "Nome do Contato do Seller"
MAIL_ADDRESS = "seller@email.mail.com"
CONTACT_PHONE = "11987654321"

CREDENTIALS_BODY = {"message": "Invalid Cielo Credentials"}
INVALID_FORMAT_BODY = {"message": "Invalid format from Cielo"}


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def cnpj_seller(**overrides) -> dict:
    seller = {
        "contact_name": CONTACT_NAME,
        "contact_phone": CONTACT_PHONE,
        "corporate_name": "Seller Corporativo Ltda",
        "document_number": CNPJ,
        "document_type": "CNPJ",
        "fancy_name": "Seller Nome Fantasia",
        "mail_address": MAIL_ADDRESS,
        "website": "https://www.website.com.br",
        "bank_account": {
            "bank": "001",
            "bank_account_type": "CheckingAccount",
            "number": "0002",
            "operation": "2",
            "verifier_digit": "2",
            "agency_number": "0002",
            "agency_digit": "x",
        },
        "address": {
            "street": "Rua Teste",
            "number": "50",
            "complement": "AP 255",
            "neighborhood": "Centro",
            "city": "São Paulo",
            "state": "SP",
            "zip_code": "12345687",
        },
    }
    seller.update(overrides)
    return seller


def cpf_seller(**overrides) -> dict:
    seller = cnpj_seller(
        document_type="CPF",
        document_number=CPF,
        birthday_date="2019/04/25",
        business_activity_id="24",
    )
    seller.update(overrides)
    return seller


def created_body(**overrides) -> dict:
    """A trimmed Cielo 201 body."""
    body = {
        "id": SELLER_ID,
        "type": "Subordinate",
        "masterMerchantId": CIELO_MERCHANT_ID,
        "documentType": 2,
        "documentNumber": CNPJ,
        "contactName": CONTACT_NAME,
        "mailAddress": MAIL_ADDRESS,
    }
    body.update(overrides)
    return body


@pytest.fixture
def cielo_http() -> Iterator[responses.RequestsMock]:
    with responses.RequestsMock(assert_all_requests_are_fired=False) as mock:
        yield mock


def add_token(
    mock: responses.RequestsMock,
    token: str = "token-1",  # noqa: S107
    expires_in: int = 1200,
) -> None:
    mock.add(
        responses.POST,
        TOKEN_URL,
        json={"access_token": token, "token_type": "bearer", "expires_in": expires_in},
    )


def calls_to(mock: responses.RequestsMock, url: str) -> list:
    return [call for call in mock.calls if call.request.url == url]


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    register(client, "ana@example.com")
    return bearer(login(client, "ana@example.com"))


def onboard(client: TestClient, headers: dict[str, str], seller: dict | None = None):
    return client.post("/cielo/onboard", json=seller or cnpj_seller(), headers=headers)


def sellers(app: FastAPI) -> list[CieloSeller]:
    with app.state.session_factory() as session:
        return list(session.scalars(select(CieloSeller)))


def memberships(app: FastAPI) -> list[CieloSellerMembership]:
    with app.state.session_factory() as session:
        return list(session.scalars(select(CieloSellerMembership)))


# Token manager


def test_token_request_uses_basic_auth_form_and_timeout(
    settings: Settings, cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    assert CieloTokenManager(settings).get_token() == "token-1"

    (call,) = cielo_http.calls
    expected = base64.b64encode(
        f"{CIELO_MERCHANT_ID}:{CIELO_CLIENT_SECRET}".encode()
    ).decode()
    assert call.request.headers["Authorization"] == f"Basic {expected}"
    assert call.request.headers["Content-Type"] == "application/x-www-form-urlencoded"
    assert parse_qs(call.request.body) == {"grant_type": ["client_credentials"]}
    assert call.request.req_kwargs["timeout"] == TIMEOUT_SECONDS == 120


def test_token_is_reused_until_it_expires_within_the_margin(
    settings: Settings, cielo_http: responses.RequestsMock
) -> None:
    clock = FakeClock()
    manager = CieloTokenManager(settings, clock=clock)
    add_token(cielo_http, "token-1", expires_in=120)
    start = clock.now

    assert manager.get_token() == "token-1"
    clock.now = start + 120 - EXPIRY_MARGIN_SECONDS - 1  # 61s left
    assert manager.get_token() == "token-1"
    assert len(cielo_http.calls) == 1

    cielo_http.replace(
        responses.POST,
        TOKEN_URL,
        json={"access_token": "token-2", "expires_in": 120},
    )
    clock.now = start + 120 - EXPIRY_MARGIN_SECONDS  # exactly the margin left
    assert manager.get_token() == "token-2"
    assert len(cielo_http.calls) == 2


def test_concurrent_callers_share_one_refresh(
    settings: Settings, cielo_http: responses.RequestsMock
) -> None:
    requests_made = 0
    counter_lock = threading.Lock()

    def slow_token(request):
        nonlocal requests_made
        with counter_lock:
            requests_made += 1
        time.sleep(0.2)  # long enough for every thread to reach the lock
        return 200, {}, json.dumps({"access_token": "shared", "expires_in": 1200})

    cielo_http.add_callback(responses.POST, TOKEN_URL, callback=slow_token)
    manager = CieloTokenManager(settings)
    barrier = threading.Barrier(10)
    tokens: list[str] = []

    def worker() -> None:
        barrier.wait()
        tokens.append(manager.get_token())

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert tokens == ["shared"] * 10
    assert requests_made == 1


def test_clear_drops_the_cached_token(
    settings: Settings, cielo_http: responses.RequestsMock
) -> None:
    manager = CieloTokenManager(settings)
    add_token(cielo_http, "token-1")
    manager.get_token()
    manager.clear()
    manager.get_token()
    assert len(cielo_http.calls) == 2


def test_clear_with_a_stale_token_keeps_the_newer_one(
    settings: Settings, cielo_http: responses.RequestsMock
) -> None:
    manager = CieloTokenManager(settings)
    add_token(cielo_http, "token-1")
    manager.get_token()
    manager.clear("some-older-token")
    assert manager.get_token() == "token-1"
    assert len(cielo_http.calls) == 1
    manager.clear("token-1")
    manager.get_token()
    assert len(cielo_http.calls) == 2


@pytest.mark.parametrize("status", [400, 401])
def test_rejected_credentials_raise(
    settings: Settings, cielo_http: responses.RequestsMock, status: int
) -> None:
    cielo_http.add(
        responses.POST, TOKEN_URL, status=status, json={"error": "invalid_client"}
    )
    manager = CieloTokenManager(settings)
    with pytest.raises(CieloInvalidCredentials):
        manager.get_token()
    # Nothing was cached: the next call tries again.
    with pytest.raises(CieloInvalidCredentials):
        manager.get_token()
    assert len(cielo_http.calls) == 2


@pytest.mark.parametrize(
    "body",
    [
        {"token_type": "bearer", "expires_in": 1200},
        {"access_token": "", "expires_in": 1200},
        {"access_token": "token", "expires_in": "1200"},
        {"access_token": "token", "expires_in": 0},
        {"access_token": "token", "expires_in": True},
        ["token"],
    ],
)
def test_malformed_token_response_raises(
    settings: Settings, cielo_http: responses.RequestsMock, body
) -> None:
    cielo_http.add(responses.POST, TOKEN_URL, json=body)
    with pytest.raises(CieloInvalidResponse):
        CieloTokenManager(settings).get_token()


# Onboarding: success


def test_onboard_creates_the_seller_and_membership(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())

    response = onboard(client, auth)

    assert response.status_code == 201, response.text
    assert response.json() == {
        "id": SELLER_ID,
        "document_type": "CNPJ",
        "document_number": CNPJ,
        "fancy_name": "Seller Nome Fantasia",
    }
    (seller,) = sellers(app)
    assert seller.id == uuid.UUID(SELLER_ID)
    assert seller.document_type is CieloDocumentType.CNPJ
    assert seller.document_number == CNPJ
    assert seller.fancy_name == "Seller Nome Fantasia"
    (membership,) = memberships(app)
    with app.state.session_factory() as session:
        user = session.scalar(select(User))
    assert (membership.seller_id, membership.user_id) == (seller.id, user.id)
    assert membership.created_at.tzinfo is not None


def test_onboard_forwards_camel_case_with_server_fields(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http, "token-1")
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    seller = cnpj_seller(
        master_merchant_id="33333333-3333-4333-8333-333333333333",
        masterMerchantId="33333333-3333-4333-8333-333333333333",
        type="Master",
        unknown_field="dropped",
    )
    del seller["website"]  # optional fields left out are not sent

    assert onboard(client, auth, seller).status_code == 201

    (call,) = calls_to(cielo_http, ONBOARD_URL)
    assert call.request.headers["Authorization"] == "Bearer token-1"
    assert call.request.req_kwargs["timeout"] == 120
    assert json.loads(call.request.body) == {
        "type": "Subordinate",
        "masterMerchantId": CIELO_MERCHANT_ID,
        "contactName": CONTACT_NAME,
        "contactPhone": CONTACT_PHONE,
        "corporateName": "Seller Corporativo Ltda",
        "documentNumber": CNPJ,
        "documentType": "CNPJ",
        "fancyName": "Seller Nome Fantasia",
        "mailAddress": MAIL_ADDRESS,
        "bankAccount": {
            "bank": "001",
            "bankAccountType": "CheckingAccount",
            "number": "0002",
            "operation": "2",
            "verifierDigit": "2",
            "agencyNumber": "0002",
            "agencyDigit": "x",
            "documentNumber": CNPJ,
            "documentType": "CNPJ",
        },
        "address": {
            "street": "Rua Teste",
            "number": "50",
            "complement": "AP 255",
            "neighborhood": "Centro",
            "city": "São Paulo",
            "state": "SP",
            "zipCode": "12345687",
        },
    }


def test_onboard_cpf_seller(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    cielo_http.add(
        responses.POST,
        ONBOARD_URL,
        status=201,
        json=created_body(documentType=1, documentNumber=CPF),
    )
    response = onboard(client, auth, cpf_seller(business_activity_id=24))
    assert response.status_code == 201, response.text
    assert response.json()["document_type"] == "CPF"
    sent = json.loads(calls_to(cielo_http, ONBOARD_URL)[0].request.body)
    assert sent["birthdayDate"] == "2019/04/25"
    assert sent["businessActivityId"] == "24"


def test_onboarding_the_same_id_overwrites_and_keeps_one_membership(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    assert onboard(client, auth).status_code == 201

    cielo_http.replace(
        responses.POST,
        ONBOARD_URL,
        status=201,
        json=created_body(documentType=1, documentNumber=CPF),
    )
    assert onboard(client, auth, cpf_seller(fancy_name="Novo Nome")).status_code == 201

    (seller,) = sellers(app)
    assert seller.document_type is CieloDocumentType.CPF
    assert seller.document_number == CPF
    assert seller.fancy_name == "Novo Nome"
    assert len(memberships(app)) == 1


def test_another_user_onboarding_the_same_id_adds_a_membership(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    assert onboard(client, auth).status_code == 201
    register(client, "bruno@example.com")
    other = bearer(login(client, "bruno@example.com"))
    assert onboard(client, other).status_code == 201

    assert len(sellers(app)) == 1
    assert len(memberships(app)) == 2
    # The token was requested once and reused.
    assert len(calls_to(cielo_http, TOKEN_URL)) == 1


def test_deleting_a_user_removes_its_memberships(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    assert onboard(client, auth).status_code == 201
    with app.state.session_factory() as session, session.begin():
        session.execute(delete(User))
    assert memberships(app) == []
    assert len(sellers(app)) == 1


# Onboarding: Cielo failures


@pytest.mark.parametrize(
    "body",
    [
        created_body(id=None),
        {k: v for k, v in created_body().items() if k != "id"},
        {k: v for k, v in created_body().items() if k != "documentType"},
        {k: v for k, v in created_body().items() if k != "documentNumber"},
        created_body(id="not-a-uuid"),
        created_body(id=123),
        created_body(documentType=3),
        created_body(documentType="1"),
        created_body(documentType="CNPJ"),
        created_body(documentType=True),
        created_body(documentNumber=96462142000140),
        created_body(documentNumber=""),
        # Only camelCase keys are read.
        {"Id": SELLER_ID, "DocumentType": 2, "DocumentNumber": CNPJ},
        # What cielo-mock returns today.
        {"MerchantId": SELLER_ID},
        ["not", "an", "object"],
    ],
)
def test_malformed_success_is_a_502(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    body,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=body)
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == INVALID_FORMAT_BODY
    assert sellers(app) == []


def test_non_json_success_is_a_502(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=200, body="<html>ok</html>")
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == INVALID_FORMAT_BODY


def test_redirect_is_not_followed(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    cielo_http.add(
        responses.POST,
        ONBOARD_URL,
        status=302,
        headers={"Location": "https://elsewhere.test/"},
    )
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == INVALID_FORMAT_BODY
    assert len(cielo_http.calls) == 2  # token + onboarding, no redirect


def test_401_clears_the_token_cache(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(
        responses.POST,
        ONBOARD_URL,
        status=401,
        json=[{"Code": "Unauthorized", "Message": "Access token is invalid."}],
    )
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == CREDENTIALS_BODY
    assert app.state.cielo.tokens._cached is None

    cielo_http.replace(responses.POST, ONBOARD_URL, status=201, json=created_body())
    assert onboard(client, auth).status_code == 201
    assert len(calls_to(cielo_http, TOKEN_URL)) == 2


@pytest.mark.parametrize("status", [400, 401])
def test_rejected_credentials_are_a_502(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    status: int,
) -> None:
    cielo_http.add(
        responses.POST,
        TOKEN_URL,
        status=status,
        json={"error": "invalid_client", "error_description": "falhou"},
    )
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == CREDENTIALS_BODY
    assert calls_to(cielo_http, ONBOARD_URL) == []
    assert sellers(app) == []


def test_other_token_errors_are_relayed(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    cielo_http.add(
        responses.POST, TOKEN_URL, status=503, json={"error": "temporarily_unavailable"}
    )
    response = onboard(client, auth)
    assert response.status_code == 503
    assert response.json() == {"error": "temporarily_unavailable"}


def test_malformed_token_response_is_a_502(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    cielo_http.add(responses.POST, TOKEN_URL, json={"token_type": "bearer"})
    response = onboard(client, auth)
    assert response.status_code == 502
    assert response.json() == INVALID_FORMAT_BODY


@pytest.mark.parametrize("status", [400, 403, 404, 409, 422, 500, 503])
def test_cielo_errors_are_relayed_unchanged(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    status: int,
) -> None:
    add_token(cielo_http)
    body = (
        b'{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1",'
        b'"title":"One or more validation errors occurred.","status":400,'
        b'"errors":{"DocumentNumber":["invalid"]}}'
    )
    cielo_http.add(
        responses.POST,
        ONBOARD_URL,
        status=status,
        body=body,
        content_type="application/problem+json",
    )
    response = onboard(client, auth)
    assert response.status_code == status
    assert response.content == body
    assert response.headers["content-type"] == "application/problem+json"
    assert sellers(app) == []


@pytest.mark.parametrize("url", [TOKEN_URL, ONBOARD_URL])
@pytest.mark.parametrize(
    ("error", "status"),
    [
        (requests.exceptions.ReadTimeout(), 504),
        (requests.exceptions.ConnectTimeout(), 504),
        (requests.exceptions.ConnectionError(), 502),
        (requests.exceptions.SSLError(), 502),
    ],
)
def test_transport_errors(
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    url: str,
    error: Exception,
    status: int,
) -> None:
    if url == ONBOARD_URL:
        add_token(cielo_http)
    cielo_http.add(responses.POST, url, body=error)
    response = onboard(client, auth)
    assert response.status_code == status
    assert set(response.json()) == {"message"}


# Onboarding: saving fails after Cielo succeeded


def test_save_failure_logs_the_recovery_ids_only(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    add_token(cielo_http, "secret-access-token")
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())

    def failing_save(*args) -> None:
        # Real DBAPI errors carry the SQL parameters in their message.
        raise OperationalError(
            "INSERT INTO cielo_sellers ...",
            {"contact": CONTACT_NAME, "mail": MAIL_ADDRESS},
            Exception("database is locked"),
        )

    monkeypatch.setattr(service, "save_seller", failing_save)
    caplog.set_level(logging.DEBUG)

    response = onboard(client, auth)

    assert response.status_code == 500
    assert set(response.json()) == {"message"}
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    line = errors[0].getMessage()
    assert SELLER_ID in line and CNPJ in line
    assert errors[0].exc_info is None
    logged = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (
        CONTACT_NAME,
        MAIL_ADDRESS,
        CONTACT_PHONE,
        "Rua Teste",
        "database is locked",
        "secret-access-token",
        CIELO_CLIENT_SECRET,
    ):
        assert secret not in logged
    assert sellers(app) == []


def test_success_logs_no_secrets_or_seller_data(
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    add_token(cielo_http, "secret-access-token")
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    caplog.set_level(logging.DEBUG)
    assert onboard(client, auth).status_code == 201
    logged = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (
        CONTACT_NAME,
        MAIL_ADDRESS,
        CNPJ,
        "secret-access-token",
        CIELO_CLIENT_SECRET,
    ):
        assert secret not in logged


# Onboarding: authentication and validation


def test_onboard_requires_a_bearer_token(
    client: TestClient, cielo_http: responses.RequestsMock
) -> None:
    assert client.post("/cielo/onboard", json=cnpj_seller()).status_code == 401
    response = onboard(client, bearer("not-a-jwt"))
    assert response.status_code == 401
    assert len(cielo_http.calls) == 0


@pytest.mark.parametrize(
    "seller",
    [
        cnpj_seller(document_type="RG"),
        cnpj_seller(contact_name=""),
        cnpj_seller(contact_phone="1" * 12),
        cnpj_seller(document_number="1" * 15),
        cnpj_seller(fancy_name="x" * 51),
        cnpj_seller(mail_address="x" * 51),
        cnpj_seller(website="x" * 201),
        cnpj_seller(business_activity_id="0"),
        cnpj_seller(business_activity_id="101"),
        cnpj_seller(business_activity_id="abc"),
        cnpj_seller(bank_account={**cnpj_seller()["bank_account"], "bank": "0001"}),
        cnpj_seller(
            bank_account={
                **cnpj_seller()["bank_account"],
                "bank_account_type": "Investment",
            }
        ),
        cnpj_seller(bank_account={"bank": "001"}),
        cnpj_seller(address={**cnpj_seller()["address"], "state": "SPX"}),
        cnpj_seller(address={**cnpj_seller()["address"], "zip_code": "1234567890"}),
        cpf_seller(birthday_date=None),
        cpf_seller(business_activity_id=None),
        {k: v for k, v in cnpj_seller().items() if k != "corporate_name"},
    ],
)
def test_invalid_payloads_never_reach_cielo(
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
    seller: dict,
) -> None:
    response = onboard(client, auth, seller)
    assert response.status_code == 422, response.text
    assert len(cielo_http.calls) == 0


def test_bank_account_document_is_copied_from_the_seller(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    cielo_http.add(
        responses.POST,
        ONBOARD_URL,
        status=201,
        json=created_body(documentType=1, documentNumber=CPF),
    )
    seller = cpf_seller()
    # Sent by the client, but ignored.
    seller["bank_account"].update(document_number=CNPJ, document_type="CNPJ")
    assert onboard(client, auth, seller).status_code == 201
    sent = json.loads(calls_to(cielo_http, ONBOARD_URL)[0].request.body)
    assert sent["bankAccount"]["documentNumber"] == CPF
    assert sent["bankAccount"]["documentType"] == "CPF"


def test_bank_account_and_address_are_optional(
    client: TestClient, auth: dict[str, str], cielo_http: responses.RequestsMock
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    seller = cnpj_seller()
    del seller["bank_account"], seller["address"]
    assert onboard(client, auth, seller).status_code == 201
    sent = json.loads(calls_to(cielo_http, ONBOARD_URL)[0].request.body)
    assert "bankAccount" not in sent and "address" not in sent


# Get sellers


GET_SELLERS = "/cielo/get-sellers"
T0 = datetime(2026, 1, 1, tzinfo=UTC)


def user_id(app: FastAPI, email: str) -> uuid.UUID:
    with app.state.session_factory() as session:
        return session.scalars(select(User.id).where(User.email == email)).one()


def add_seller(
    app: FastAPI,
    owner_ids: list[uuid.UUID],
    document_type: CieloDocumentType = CieloDocumentType.CNPJ,
    document_number: str = CNPJ,
    created_at: datetime = T0,
    seller_id: uuid.UUID | None = None,
    fancy_name: str = "Seller Nome Fantasia",
) -> uuid.UUID:
    """Inserts a seller and a membership per owner, all at ``created_at``."""
    seller_id = seller_id or uuid.uuid4()
    with app.state.session_factory() as session, session.begin():
        session.add(
            CieloSeller(
                id=seller_id,
                document_type=document_type,
                document_number=document_number,
                fancy_name=fancy_name,
            )
        )
        session.flush()
        session.add_all(
            CieloSellerMembership(
                seller_id=seller_id, user_id=owner, created_at=created_at
            )
            for owner in owner_ids
        )
    return seller_id


def get_sellers(client: TestClient, headers: dict[str, str]) -> list[dict]:
    response = client.get(GET_SELLERS, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_get_sellers_requires_a_bearer_token(client: TestClient) -> None:
    assert client.get(GET_SELLERS).status_code == 401
    response = client.get(GET_SELLERS, headers=bearer("not-a-jwt"))
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_get_sellers_is_empty_without_memberships(
    app: FastAPI, client: TestClient, auth: dict[str, str]
) -> None:
    register(client, "bruno@example.com")
    add_seller(app, [user_id(app, "bruno@example.com")])
    assert get_sellers(client, auth) == []


def test_get_sellers_returns_only_the_callers_sellers(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    register(client, "bruno@example.com")
    other = bearer(login(client, "bruno@example.com"))
    ana, bruno = user_id(app, "ana@example.com"), user_id(app, "bruno@example.com")
    anas = add_seller(app, [ana], CieloDocumentType.CPF, CPF, fancy_name="Loja da Ana")
    brunos = add_seller(app, [bruno], document_number="11111111000111")

    assert get_sellers(client, auth) == [
        {
            "id": str(anas),
            "document_type": "CPF",
            "document_number": CPF,
            "fancy_name": "Loja da Ana",
        }
    ]
    assert get_sellers(client, other) == [
        {
            "id": str(brunos),
            "document_type": "CNPJ",
            "document_number": "11111111000111",
            "fancy_name": "Seller Nome Fantasia",
        }
    ]
    # Read-only: Cielo is never called.
    assert len(cielo_http.calls) == 0


def test_a_shared_seller_is_returned_to_every_member(
    client: TestClient,
    auth: dict[str, str],
    cielo_http: responses.RequestsMock,
) -> None:
    add_token(cielo_http)
    cielo_http.add(responses.POST, ONBOARD_URL, status=201, json=created_body())
    onboarded = onboard(client, auth)
    assert onboarded.status_code == 201
    register(client, "bruno@example.com")
    other = bearer(login(client, "bruno@example.com"))
    assert onboard(client, other).status_code == 201

    # Same shape as the onboard 201 body, and nothing else.
    assert get_sellers(client, auth) == [onboarded.json()]
    assert get_sellers(client, other) == [onboarded.json()]
    assert set(onboarded.json()) == {
        "id",
        "document_type",
        "document_number",
        "fancy_name",
    }


def test_get_sellers_orders_by_membership_then_seller_id(
    app: FastAPI, client: TestClient, auth: dict[str, str]
) -> None:
    ana = user_id(app, "ana@example.com")
    low = uuid.UUID("00000000-0000-4000-8000-000000000001")
    high = uuid.UUID("ffffffff-ffff-4fff-bfff-ffffffffffff")
    newest = add_seller(app, [ana], created_at=T0 + timedelta(days=2))
    # Inserted first but with the later id: the tie is broken by id.
    tied_high = add_seller(app, [ana], created_at=T0, seller_id=high)
    tied_low = add_seller(app, [ana], created_at=T0, seller_id=low)
    middle = add_seller(
        app, [ana], CieloDocumentType.CPF, CPF, created_at=T0 + timedelta(days=1)
    )

    listed = get_sellers(client, auth)
    assert [seller["id"] for seller in listed] == [
        str(tied_low),
        str(tied_high),
        str(middle),
        str(newest),
    ]
    assert [seller["document_type"] for seller in listed] == [
        "CNPJ",
        "CNPJ",
        "CPF",
        "CNPJ",
    ]
    assert all(
        set(seller) == {"id", "document_type", "document_number", "fancy_name"}
        for seller in listed
    )


# Settings


CIELO_ENV = {
    "CIELO_MERCHANT_ID": "cielo_merchant_id",
    "CIELO_CLIENT_SECRET": "cielo_client_secret",
    "CIELO_AUTH_BASE_URL": "cielo_auth_base_url",
    "CIELO_ONBOARDING_BASE_URL": "cielo_onboarding_base_url",
}


@pytest.mark.parametrize("name", CIELO_ENV)
@pytest.mark.parametrize("value", ["", "   "])
def test_create_app_requires_every_cielo_setting(
    settings: Settings, name: str, value: str
) -> None:
    with pytest.raises(ValueError, match=name):
        create_app(replace(settings, **{CIELO_ENV[name]: value}))


@pytest.mark.parametrize(
    "url",
    [
        "cielo-mock:3000",
        "ftp://cielo.test",
        "https://cielo.test/oauth2/token",
        "https://cielo.test/api",
        "https://cielo.test?x=1",
        "http://h?a=1",
        "http://h#frag",
        # urlsplit reports an empty query/fragment for a bare delimiter.
        "http://h?",
        "http://h#",
        "http://h/?",
        "http://h:3000#",
        # A netloc with a port but no host.
        "http://:3000",
        "http://user@:3000",
    ],
)
@pytest.mark.parametrize("field", ["cielo_auth_base_url", "cielo_onboarding_base_url"])
def test_base_urls_must_be_scheme_and_host(
    settings: Settings, field: str, url: str
) -> None:
    with pytest.raises(ValueError, match=field.upper()):
        create_app(replace(settings, **{field: url}))


@pytest.mark.parametrize("url", ["http://h", "http://h/", "https://h:3000"])
@pytest.mark.parametrize("field", ["cielo_auth_base_url", "cielo_onboarding_base_url"])
def test_base_urls_accept_scheme_and_host(
    settings: Settings, field: str, url: str
) -> None:
    create_app(replace(settings, **{field: url}))


def test_merchant_id_must_be_a_uuid(settings: Settings) -> None:
    with pytest.raises(ValueError, match="CIELO_MERCHANT_ID"):
        create_app(replace(settings, cielo_merchant_id="merchant"))


def test_cielo_settings_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CIELO_MERCHANT_ID", f" {CIELO_MERCHANT_ID} ")
    monkeypatch.setenv("CIELO_CLIENT_SECRET", CIELO_CLIENT_SECRET)
    monkeypatch.setenv("CIELO_AUTH_BASE_URL", "http://cielo-mock:3000/")
    monkeypatch.setenv("CIELO_ONBOARDING_BASE_URL", "http://cielo-mock:3000//")
    settings = Settings.from_env()
    assert settings.cielo_merchant_id == CIELO_MERCHANT_ID
    assert settings.cielo_auth_base_url == "http://cielo-mock:3000"
    assert settings.cielo_token_url == "http://cielo-mock:3000/oauth2/token"
    assert settings.cielo_onboarding_url == "http://cielo-mock:3000/api/merchants"


def test_cielo_secret_is_not_in_repr(settings: Settings) -> None:
    assert CIELO_CLIENT_SECRET not in repr(settings)
