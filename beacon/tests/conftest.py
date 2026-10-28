from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app

BEACON_DIR = Path(__file__).resolve().parent.parent
TOKEN = "test-webhook-token"


def alembic_config(settings: Settings) -> Config:
    config = Config(str(BEACON_DIR / "alembic.ini"))
    config.set_main_option(
        "sqlalchemy.url",
        settings.database_url.render_as_string(hide_password=False),
    )
    return config


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        cielo_webhook_token=TOKEN,
        database_path=tmp_path / "data" / "beacon.sqlite3",
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
