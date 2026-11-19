"""Businesses: CNPJ normalization, models, /businesses, the business-scoped
dependency, the scripts and the migration."""

from typing import Annotated

import pytest
from alembic import command
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.business import service
from app.business.cnpj import InvalidCnpj, normalize_cnpj
from app.business.deps import get_current_business
from app.business.models import Business, BusinessMembership
from app.config import Settings
from app.oauth.service import generate_credentials
from app.scripts import create_business, link_user_business
from tests.conftest import alembic_config, bearer, login, register

EMAIL = "ana@example.com"
OTHER_EMAIL = "bruno@example.com"
CNPJ_A = "12ABC345000199"
CNPJ_B = "98765432000110"
CNPJ_C = "00000000000191"


def add_business(session: Session, cnpj: str, *emails: str) -> Business:
    business = service.create_business(session, cnpj)
    for email in emails:
        service.link_user(session, email, cnpj)
    return business


# CNPJ normalization


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("12345678000195", "12345678000195"),
        ("12ABC345000199", "12ABC345000199"),
        ("12.abc.345/0001-99", "12ABC345000199"),
        (" 12.345.678/0001-95 ", "12345678000195"),
        ("12abc345000199", "12ABC345000199"),
    ],
)
def test_normalize_cnpj(raw: str, expected: str) -> None:
    assert normalize_cnpj(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "1234567800019",  # 13
        "123456780001955",  # 15
        "12.345.678/0001-9",  # 13 after stripping
        "",
        "12345678000Ç95",  # non-ASCII letter
        "1234567800019é",
    ],
)
def test_normalize_cnpj_rejects(raw: str) -> None:
    with pytest.raises(InvalidCnpj):
        normalize_cnpj(raw)


def test_invalid_cnpj_is_a_value_error() -> None:
    assert issubclass(InvalidCnpj, ValueError)


# Model constraints


def test_duplicate_cnpj_is_rejected(session: Session) -> None:
    service.create_business(session, CNPJ_A)
    with pytest.raises(service.BusinessExists):
        service.create_business(session, "12.abc.345/0001-99")
    with pytest.raises(IntegrityError):
        with session.begin():
            session.add(Business(cnpj=CNPJ_A))


@pytest.mark.parametrize("cnpj", ["12abc345000199", "1234567800019"])
def test_unnormalized_cnpj_is_rejected_by_the_database(
    session: Session, cnpj: str
) -> None:
    with pytest.raises(IntegrityError, match="ck_businesses_cnpj_normalized"):
        with session.begin():
            session.add(Business(cnpj=cnpj))


# GET /businesses


def test_list_businesses_requires_a_token(client: TestClient) -> None:
    assert client.get("/businesses").status_code == 401


def test_list_businesses_returns_only_the_callers(
    client: TestClient, session: Session
) -> None:
    register(client, EMAIL)
    register(client, OTHER_EMAIL)
    b = add_business(session, CNPJ_B, EMAIL)
    a = add_business(session, CNPJ_A, EMAIL, OTHER_EMAIL)
    add_business(session, CNPJ_C, OTHER_EMAIL)

    response = client.get("/businesses", headers=bearer(login(client, EMAIL)))
    assert response.status_code == 200
    # Ordered by CNPJ, not by creation.
    assert response.json() == [
        {"id": str(a.id), "cnpj": CNPJ_A, "client_id": None},
        {"id": str(b.id), "cnpj": CNPJ_B, "client_id": None},
    ]


def test_list_businesses_exposes_client_id_but_not_the_secret(
    client: TestClient, session: Session
) -> None:
    register(client, EMAIL)
    with_credentials = add_business(session, CNPJ_A, EMAIL)
    without_credentials = add_business(session, CNPJ_B, EMAIL)
    credentials = generate_credentials(session, with_credentials.id)

    response = client.get("/businesses", headers=bearer(login(client, EMAIL)))
    assert response.status_code == 200
    assert response.json() == [
        {
            "id": str(with_credentials.id),
            "cnpj": CNPJ_A,
            "client_id": credentials.client_id,
        },
        {"id": str(without_credentials.id), "cnpj": CNPJ_B, "client_id": None},
    ]
    assert "client_secret" not in response.text
    assert credentials.client_secret not in response.text
    session.refresh(with_credentials)
    assert with_credentials.client_secret_hash not in response.text


def test_list_businesses_is_empty_without_memberships(client: TestClient) -> None:
    register(client, EMAIL)
    response = client.get("/businesses", headers=bearer(login(client, EMAIL)))
    assert response.json() == []


# Business-scoped dependency, through a test-only route


@pytest.fixture
def scoped_client(app: FastAPI, client: TestClient) -> TestClient:
    router = APIRouter()

    @router.get("/test-business-scope")
    def scoped(
        business: Annotated[Business, Depends(get_current_business)],
    ) -> dict[str, str]:
        return {"cnpj": business.cnpj}

    app.include_router(router)
    return client


def test_business_scope_requires_a_token(scoped_client: TestClient) -> None:
    response = scoped_client.get(
        "/test-business-scope", headers={"X-Business-Cnpj": CNPJ_A}
    )
    assert response.status_code == 401


def test_business_scope_member_gets_the_business(
    scoped_client: TestClient, session: Session
) -> None:
    register(scoped_client, EMAIL)
    add_business(session, CNPJ_A, EMAIL)
    headers = bearer(login(scoped_client, EMAIL)) | {
        "X-Business-Cnpj": "12.abc.345/0001-99"
    }
    response = scoped_client.get("/test-business-scope", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"cnpj": CNPJ_A}


@pytest.mark.parametrize("value", [None, "", "1234567800019", "12.345.678/0001-9"])
def test_business_scope_rejects_missing_or_malformed_header(
    scoped_client: TestClient, value: str | None
) -> None:
    register(scoped_client, EMAIL)
    headers = bearer(login(scoped_client, EMAIL))
    if value is not None:
        headers["X-Business-Cnpj"] = value
    response = scoped_client.get("/test-business-scope", headers=headers)
    assert response.status_code == 400


def test_business_scope_hides_whether_the_cnpj_exists(
    scoped_client: TestClient, session: Session
) -> None:
    register(scoped_client, EMAIL)
    register(scoped_client, OTHER_EMAIL)
    add_business(session, CNPJ_A, OTHER_EMAIL)
    headers = bearer(login(scoped_client, EMAIL))

    not_member = scoped_client.get(
        "/test-business-scope", headers=headers | {"X-Business-Cnpj": CNPJ_A}
    )
    unknown = scoped_client.get(
        "/test-business-scope", headers=headers | {"X-Business-Cnpj": CNPJ_B}
    )
    assert not_member.status_code == unknown.status_code == 403
    assert not_member.json() == unknown.json()


# Scripts


@pytest.fixture
def database_env(app: FastAPI, settings: Settings, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_PATH", str(settings.database_path))


def memberships(session: Session) -> list[BusinessMembership]:
    return list(session.scalars(select(BusinessMembership)))


def test_create_business_script_is_idempotent(
    database_env: None, session: Session, capsys
) -> None:
    assert create_business.main(["12.abc.345/0001-99"]) == 0
    assert "12ABC345000199: created" in capsys.readouterr().out
    assert create_business.main([CNPJ_A.lower()]) == 0
    assert "already exists, left unchanged" in capsys.readouterr().out
    assert session.scalars(select(Business.cnpj)).all() == [CNPJ_A]


def test_create_business_script_rejects_an_invalid_cnpj(
    database_env: None, session: Session
) -> None:
    assert create_business.main(["1234"]) == 1
    assert session.scalars(select(Business)).all() == []


def test_link_script_needs_an_existing_user_and_business(
    database_env: None, client: TestClient, session: Session, capsys
) -> None:
    register(client, EMAIL)
    assert link_user_business.main([EMAIL, CNPJ_A]) == 1
    assert "no business" in capsys.readouterr().err

    service.create_business(session, CNPJ_A)
    assert link_user_business.main([OTHER_EMAIL, CNPJ_A]) == 1
    assert "no user" in capsys.readouterr().err
    assert link_user_business.main([EMAIL, "1234"]) == 1
    assert memberships(session) == []


def test_link_script_is_idempotent(
    database_env: None, client: TestClient, session: Session, capsys
) -> None:
    user_id = register(client, EMAIL)["id"]
    business = service.create_business(session, CNPJ_A)

    assert link_user_business.main([" Ana@Example.COM ", "12.abc.345/0001-99"]) == 0
    assert "linked" in capsys.readouterr().out
    assert link_user_business.main([EMAIL, CNPJ_A]) == 0
    assert "already linked" in capsys.readouterr().out

    (membership,) = memberships(session)
    assert membership.business_id == business.id
    assert str(membership.user_id) == user_id


def test_link_user_service_errors(client: TestClient, session: Session) -> None:
    register(client, EMAIL)
    with pytest.raises(service.BusinessNotFound):
        service.link_user(session, EMAIL, CNPJ_A)
    service.create_business(session, CNPJ_A)
    with pytest.raises(service.UserNotFound):
        service.link_user(session, OTHER_EMAIL, CNPJ_A)
    service.link_user(session, EMAIL, CNPJ_A)
    with pytest.raises(service.AlreadyLinked):
        service.link_user(session, EMAIL, CNPJ_A)


def test_link_user_maps_a_racing_insert_to_already_linked(
    client: TestClient, session: Session, monkeypatch
) -> None:
    register(client, EMAIL)
    add_business(session, CNPJ_A, EMAIL)
    # Hide the existing membership from the pre-check, as a concurrent call
    # committing between the check and the insert would.
    monkeypatch.setattr(session, "get", lambda *args, **kwargs: None)
    with pytest.raises(service.AlreadyLinked) as excinfo:
        service.link_user(session, EMAIL, CNPJ_A)
    assert isinstance(excinfo.value.__cause__, IntegrityError)


# Migration


def test_migration_downgrades_and_upgrades(app: FastAPI, settings: Settings) -> None:
    def tables() -> set[str]:
        with app.state.session_factory() as fresh:
            return set(inspect(fresh.connection()).get_table_names())

    assert {"businesses", "business_membership"} <= tables()
    config = alembic_config(settings)
    command.downgrade(config, "10901133c034")
    assert not {"businesses", "business_membership"} & tables()
    command.upgrade(config, "head")
    assert {"businesses", "business_membership"} <= tables()
