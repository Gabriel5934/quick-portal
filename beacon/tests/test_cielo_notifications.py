import json
import uuid
from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError

from app.cielo.enums import (
    CieloBank,
    CieloBankAccountType,
    CieloDocumentType,
    CieloMerchantType,
    CieloOnboardingBankAccountValidationStatus,
    CieloOnboardingChangeType,
    CieloOnboardingGlobalStatus,
    CieloOnboardingKycStatus,
    CieloTransactionChangeType,
)
from app.cielo.models import (
    CieloNotification,
    CieloNotificationOnboardingBankAccountValidation,
    CieloNotificationOnboardingGlobal,
    CieloNotificationOnboardingKyc,
    CieloNotificationTransaction,
    CieloNotificationUnhandled,
)
from app.config import Settings
from app.db import Base
from app.main import create_app
from tests.conftest import TOKEN

URL = "/cielo/notifications"
HEADER = "X-Cielo-Webhook-Token"
ALL_MODELS: list[type[CieloNotification]] = [
    CieloNotificationUnhandled,
    CieloNotificationTransaction,
    CieloNotificationOnboardingGlobal,
    CieloNotificationOnboardingKyc,
    CieloNotificationOnboardingBankAccountValidation,
]

MASTER_ID = "96ffb8be-6693-4f9b-bf8e-925b555b3207"
MERCHANT_ID = "4d76b525-e66d-402e-a318-5fd3ce1af7aa"
PAYMENT_ID = "0b7b7d3c-3f4e-4a8b-9a51-1d2f3e4a5b6c"
RECURRENT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"


def encode(payload: Any) -> bytes:
    return json.dumps(payload).encode()


def post(client: TestClient, body: bytes, token: str | None = TOKEN):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers[HEADER] = token
    return client.post(URL, content=body, headers=headers)


def rows[M: CieloNotification](app: FastAPI, model: type[M]) -> list[M]:
    with app.state.session_factory() as session:
        return list(session.scalars(select(model).order_by(model.id)))


def row_counts(app: FastAPI) -> dict[str, int]:
    return {model.__tablename__: len(rows(app, model)) for model in ALL_MODELS}


def only_row[M: CieloNotification](app: FastAPI, model: type[M]) -> M:
    """Asserts the notification went to ``model``'s table and nowhere else."""
    counts = row_counts(app)
    assert counts == {
        name: (1 if name == model.__tablename__ else 0) for name in counts
    }
    (row,) = rows(app, model)
    assert row.received_at is not None
    return row


# --- Authentication ----------------------------------------------------------


@pytest.mark.parametrize("token", [None, "", "wrong-token", TOKEN + "x", TOKEN[:-1]])
def test_missing_or_wrong_token_is_rejected_and_not_stored(
    app: FastAPI, client: TestClient, token: str | None
) -> None:
    response = post(client, encode({"ChangeType": 1, "PaymentId": PAYMENT_ID}), token)

    assert response.status_code == 401
    assert all(count == 0 for count in row_counts(app).values())


def test_header_name_is_case_insensitive(app: FastAPI, client: TestClient) -> None:
    response = client.post(
        URL,
        content=encode({"ChangeType": 1}),
        headers={"x-cielo-webhook-token": TOKEN},
    )

    assert response.status_code == 200
    only_row(app, CieloNotificationTransaction)


def test_unconfigured_token_rejects_everything(settings: Settings) -> None:
    unconfigured = Settings(
        cielo_webhook_token="", database_path=settings.database_path
    )
    with TestClient(create_app(unconfigured)) as client:
        assert post(client, encode({"ChangeType": 1}), token="").status_code == 401
        assert post(client, encode({"ChangeType": 1}), token=None).status_code == 401


def test_only_post_is_exposed(client: TestClient) -> None:
    assert client.get(URL, headers={HEADER: TOKEN}).status_code == 405
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


# --- Routing by ChangeType ---------------------------------------------------


@pytest.mark.parametrize("change_type", list(CieloTransactionChangeType))
def test_transaction_change_types(
    app: FastAPI, client: TestClient, change_type: CieloTransactionChangeType
) -> None:
    body = encode(
        {
            "PaymentId": PAYMENT_ID,
            "ChangeType": int(change_type),
            "RecurrentPaymentId": RECURRENT_ID,
        }
    )

    response = post(client, body)

    assert response.status_code == 200
    row = only_row(app, CieloNotificationTransaction)
    assert row.body == body
    assert row.change_type is change_type
    assert row.payment_id == uuid.UUID(PAYMENT_ID)
    assert row.recurrent_payment_id == uuid.UUID(RECURRENT_ID)


def test_transaction_without_recurrent_payment_id(
    app: FastAPI, client: TestClient
) -> None:
    body = encode({"PaymentId": PAYMENT_ID, "ChangeType": 25})

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationTransaction)
    assert row.change_type is CieloTransactionChangeType.PARTIALLY_CANCELLED_OR_REFUNDED
    assert row.recurrent_payment_id is None


def test_kyc_notification(app: FastAPI, client: TestClient) -> None:
    body = encode(
        {
            "ChangeType": 20,
            "MasterMerchantId": MASTER_ID,
            "Data": {"SubordinateMerchantId": MERCHANT_ID, "Status": 3},
        }
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingKyc)
    assert row.body == body
    assert row.change_type is CieloOnboardingChangeType.KYC
    assert row.master_merchant_id == uuid.UUID(MASTER_ID)
    assert row.subordinate_merchant_id == uuid.UUID(MERCHANT_ID)
    assert row.status is CieloOnboardingKycStatus.APPROVED_WITH_RESTRICTION


def test_bank_account_validation_notification(app: FastAPI, client: TestClient) -> None:
    body = encode(
        {
            "ChangeType": 21,
            "MasterMerchantId": MASTER_ID,
            "Data": {
                "MerchantId": MERCHANT_ID,
                "MerchantType": "Subordinate",
                "Status": 3,
                "AccountNumber": "123",
                "AccountDigit": "1",
                "AgencyNumber": "3581",
                "AgencyDigit": "x",
                "CompeCode": "260",
                "BankAccountType": 1,
                "DocumentNumber": "45224563215",
                "DocumentType": 2,
            },
        }
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingBankAccountValidation)
    assert row.body == body
    assert row.change_type is CieloOnboardingChangeType.BANK_ACCOUNT_VALIDATION
    assert row.master_merchant_id == uuid.UUID(MASTER_ID)
    assert row.merchant_id == uuid.UUID(MERCHANT_ID)
    assert row.merchant_type is CieloMerchantType.SUBORDINATE
    assert row.status is CieloOnboardingBankAccountValidationStatus.SUCCESS
    assert row.bank_code is CieloBank.BANK_260
    assert row.bank_account_type is CieloBankAccountType.CHECKING_ACCOUNT
    assert row.account_number == "123"
    assert row.account_digit == "1"
    assert row.agency_number == "3581"
    assert row.agency_digit == "x"
    assert row.document_number == "45224563215"
    assert row.document_type is CieloDocumentType.CNPJ


def bank_account_validation_row(
    app: FastAPI, client: TestClient, data: dict[str, Any]
) -> CieloNotificationOnboardingBankAccountValidation:
    body = encode({"ChangeType": 21, "MasterMerchantId": MASTER_ID, "Data": data})
    assert post(client, body).status_code == 200
    return only_row(app, CieloNotificationOnboardingBankAccountValidation)


def test_bank_account_validation_status_is_read_from_data_status(
    app: FastAPI, client: TestClient
) -> None:
    row = bank_account_validation_row(
        app, client, {"Status": 4, "BankAccountValidationStatus": 3}
    )

    assert row.status is CieloOnboardingBankAccountValidationStatus.ERROR


def test_bank_account_validation_status_ignores_legacy_key(
    app: FastAPI, client: TestClient
) -> None:
    row = bank_account_validation_row(app, client, {"BankAccountValidationStatus": 3})

    assert row.status is None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1, CieloDocumentType.CPF),
        (2, CieloDocumentType.CNPJ),
        ("1", CieloDocumentType.CPF),  # digit-only strings are accepted
        ("2", CieloDocumentType.CNPJ),
    ],
)
def test_document_type_is_parsed_as_integer(
    app: FastAPI, client: TestClient, value: Any, expected: CieloDocumentType
) -> None:
    row = bank_account_validation_row(app, client, {"DocumentType": value})

    assert row.document_type is expected
    assert row.document_type.label == expected.name


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1, CieloBankAccountType.CHECKING_ACCOUNT),
        (2, CieloBankAccountType.SAVINGS_ACCOUNT),
        ("1", CieloBankAccountType.CHECKING_ACCOUNT),
        ("2", CieloBankAccountType.SAVINGS_ACCOUNT),
    ],
)
def test_bank_account_type_is_parsed_as_integer(
    app: FastAPI, client: TestClient, value: Any, expected: CieloBankAccountType
) -> None:
    row = bank_account_validation_row(app, client, {"BankAccountType": value})

    assert row.bank_account_type is expected


INVALID_INT_ENUM_VALUES = [
    0,
    3,
    -1,
    "0",
    "3",
    "-1",
    " 1",
    "1.0",
    "١",  # non-ASCII digit
    1.0,
    True,
    None,
    "",
    [1],
]


@pytest.mark.parametrize(
    "value", [*INVALID_INT_ENUM_VALUES, "CPF", "CNPJ", "cpf", "Cpf"]
)
def test_unknown_document_type_is_null(
    app: FastAPI, client: TestClient, value: Any
) -> None:
    row = bank_account_validation_row(app, client, {"DocumentType": value})

    assert row.document_type is None


@pytest.mark.parametrize(
    "value", [*INVALID_INT_ENUM_VALUES, "CheckingAccount", "SavingsAccount"]
)
def test_unknown_bank_account_type_is_null(
    app: FastAPI, client: TestClient, value: Any
) -> None:
    row = bank_account_validation_row(app, client, {"BankAccountType": value})

    assert row.bank_account_type is None


def test_onboarding_global_notification(app: FastAPI, client: TestClient) -> None:
    body = encode(
        {
            "ChangeType": 23,
            "MasterMerchantId": MASTER_ID,
            "Data": {
                "SubordinateMerchantId": MERCHANT_ID,
                "OnboardingStatus": 2,
                "KycAnalysisInfo": {"Status": 2},
                "BankAccountValidation": {"Status": 3},
            },
        }
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingGlobal)
    assert row.body == body
    assert row.change_type is CieloOnboardingChangeType.GLOBAL
    assert row.master_merchant_id == uuid.UUID(MASTER_ID)
    assert row.subordinate_merchant_id == uuid.UUID(MERCHANT_ID)
    assert row.status is CieloOnboardingGlobalStatus.APPROVED
    assert row.kyc_status is CieloOnboardingKycStatus.APPROVED
    assert (
        row.bank_account_validation_status
        is CieloOnboardingBankAccountValidationStatus.SUCCESS
    )


# --- Unhandled and malformed bodies ------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        encode({"PaymentId": PAYMENT_ID}),  # no ChangeType
        encode({"ChangeType": None}),
        encode({"ChangeType": 22}),
        encode({"ChangeType": 9}),
        encode({"ChangeType": 0}),
        encode({"ChangeType": -1}),
        encode({"ChangeType": 1.5}),
        encode({"ChangeType": True}),
        encode({"ChangeType": "abc"}),
        encode({"ChangeType": [1]}),
        encode([{"ChangeType": 1}]),  # not an object
        encode("ChangeType"),
        encode(1),
        b"null",
        b"",
        b"{not json",
        b"\xff\xfe\x00garbage",
    ],
)
def test_unhandled_or_non_object_bodies_go_to_unhandled(
    app: FastAPI, client: TestClient, body: bytes
) -> None:
    response = post(client, body)

    assert response.status_code == 200
    row = only_row(app, CieloNotificationUnhandled)
    assert row.body == body


def test_typed_parse_failure_still_stores_typed_row(
    app: FastAPI, client: TestClient
) -> None:
    body = encode(
        {"PaymentId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "ChangeType": 1}
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationTransaction)
    assert row.body == body
    assert row.change_type is CieloTransactionChangeType.TRANSACTION_STATUS
    assert row.payment_id is None
    assert row.recurrent_payment_id is None


def test_bank_account_fields_that_fail_to_parse_are_null(
    app: FastAPI, client: TestClient
) -> None:
    body = encode(
        {
            "ChangeType": 21,
            "MasterMerchantId": 12345,
            "Data": {
                "MerchantId": "not-a-uuid",
                "MerchantType": "Reseller",
                "Status": 9,
                "CompeCode": "999",
                "BankAccountType": "1",  # numeric strings are accepted
                "AccountNumber": "1" * 16,
                "AccountDigit": 1,
                "AgencyNumber": "3581",
                "DocumentNumber": "1" * 16,
                "DocumentType": "CNPJ",  # the type is a number, not a name
            },
        }
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingBankAccountValidation)
    assert row.body == body
    assert row.change_type is CieloOnboardingChangeType.BANK_ACCOUNT_VALIDATION
    assert row.bank_account_type is CieloBankAccountType.CHECKING_ACCOUNT
    assert row.agency_number == "3581"
    for field in (
        "master_merchant_id",
        "merchant_id",
        "merchant_type",
        "status",
        "bank_code",
        "account_number",
        "account_digit",
        "agency_digit",
        "document_number",
        "document_type",
    ):
        assert getattr(row, field) is None, field


def test_string_with_lone_surrogate_is_null(app: FastAPI, client: TestClient) -> None:
    # Valid JSON, but the decoded str cannot be encoded as UTF-8 for storage.
    body = (
        b'{"ChangeType": 21, "Data": {"MerchantId": "' + MERCHANT_ID.encode() + b'", '
        b'"AccountNumber": "\\ud800", "AgencyNumber": "3581"}}'
    )

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingBankAccountValidation)
    assert row.body == body
    assert row.account_number is None
    assert row.agency_number == "3581"
    assert row.merchant_id == uuid.UUID(MERCHANT_ID)


def test_integer_string_over_the_digit_limit_is_null(
    app: FastAPI, client: TestClient
) -> None:
    # Longer than Python's default int/str conversion limit (4300 digits).
    row = bank_account_validation_row(
        app, client, {"MerchantId": MERCHANT_ID, "Status": "1" * 5000}
    )

    assert row.status is None
    assert row.master_merchant_id == uuid.UUID(MASTER_ID)
    assert row.merchant_id == uuid.UUID(MERCHANT_ID)


@pytest.mark.parametrize("data", [None, "oops", [1, 2], {}])
def test_onboarding_with_missing_or_invalid_data_is_stored(
    app: FastAPI, client: TestClient, data: Any
) -> None:
    body = encode({"ChangeType": 23, "MasterMerchantId": MASTER_ID, "Data": data})

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingGlobal)
    assert row.body == body
    assert row.master_merchant_id == uuid.UUID(MASTER_ID)
    assert row.subordinate_merchant_id is None
    assert row.status is None
    assert row.kyc_status is None
    assert row.bank_account_validation_status is None


def test_raw_body_is_stored_byte_for_byte(app: FastAPI, client: TestClient) -> None:
    body = b'{ "ChangeType" : 20 ,\n "Data": {"Status": 1}, "Extra": "\xc3\xa7"}  '

    assert post(client, body).status_code == 200
    row = only_row(app, CieloNotificationOnboardingKyc)
    assert row.body == body
    assert row.status is CieloOnboardingKycStatus.UNDER_ANALYSIS


# --- Storage -----------------------------------------------------------------


def test_identical_notifications_are_stored_as_separate_rows(
    app: FastAPI, client: TestClient
) -> None:
    body = encode({"PaymentId": PAYMENT_ID, "ChangeType": 1})

    assert post(client, body).status_code == 200
    assert post(client, body).status_code == 200

    stored = rows(app, CieloNotificationTransaction)
    assert len(stored) == 2
    assert stored[0].id != stored[1].id
    assert all(row.body == body for row in stored)


def test_storage_failure_returns_500(app: FastAPI, client: TestClient) -> None:
    with app.state.session_factory() as session, session.begin():
        session.execute(text("DROP TABLE cielo_notification_transaction"))

    response = post(client, encode({"PaymentId": PAYMENT_ID, "ChangeType": 1}))

    assert response.status_code == 500


def test_commit_failure_returns_500_and_stores_nothing(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_commit(self: Any) -> None:
        raise OperationalError("COMMIT", {}, Exception("database or disk is full"))

    monkeypatch.setattr(
        "sqlalchemy.orm.session.SessionTransaction.commit", failing_commit
    )

    response = post(client, encode({"ChangeType": 99}))

    monkeypatch.undo()
    assert response.status_code == 500
    assert all(count == 0 for count in row_counts(app).values())


def test_migrations_match_models(app: FastAPI) -> None:
    engine = app.state.session_factory.kw["bind"]
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []
