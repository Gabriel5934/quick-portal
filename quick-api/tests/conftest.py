from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app

QUICK_API_DIR = Path(__file__).resolve().parent.parent
# Throwaway signing key, at least 32 bytes as create_app requires.
JWT_SECRET = "test-jwt-secret-0123456789abcdefghijklmnop"
PASSWORD = "correct horse battery"
CSRF = {"X-Requested-With": "quick-portal"}


def alembic_config(settings: Settings) -> Config:
    config = Config(str(QUICK_API_DIR / "alembic.ini"))
    config.set_main_option(
        "sqlalchemy.url",
        settings.database_url.render_as_string(hide_password=False),
    )
    return config


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        jwt_secret=JWT_SECRET,
        database_path=tmp_path / "data" / "quick-api.sqlite3",
        # httpx only sends Secure cookies over https; the client is http.
        cookie_secure=False,
    )


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    application = create_app(settings)  # creates the data directory
    command.upgrade(alembic_config(settings), "head")
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session(app: FastAPI) -> Iterator[Session]:
    with app.state.session_factory() as db_session:
        yield db_session


@pytest.fixture
def new_client(app: FastAPI) -> Iterator[Callable[[], TestClient]]:
    """Extra clients with their own cookie jars (other browsers/users)."""
    clients: list[TestClient] = []

    def make() -> TestClient:
        test_client = TestClient(app)
        clients.append(test_client)
        return test_client

    yield make
    for test_client in clients:
        test_client.close()


def register(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    response = client.post(
        "/auth/register", json={"email": email, "password": password}
    )
    assert response.status_code == 201, response.text
    return response.json()


def login(client: TestClient, email: str, password: str = PASSWORD) -> str:
    """Logs in, keeping the refresh cookie in the client; returns the access token."""
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def refresh(client: TestClient):
    return client.post("/auth/refresh", headers=CSRF)


def set_refresh_cookie(client: TestClient, value: str) -> None:
    """Replaces the client's refresh cookie, as a replaying attacker would.

    Uses the domain httpx stores server-set cookies under, so the value
    replaces the existing cookie instead of being sent alongside it.
    """
    client.cookies.set("refresh_token", value, domain="testserver.local", path="/auth")


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
