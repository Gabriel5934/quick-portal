from dataclasses import replace
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_docs_are_disabled_by_default(client: TestClient) -> None:
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_docs_can_be_enabled(app: FastAPI, settings: Settings) -> None:
    # ``app`` migrated the database at settings.database_path.
    with TestClient(create_app(replace(settings, api_docs_enabled=True))) as client:
        assert client.get("/openapi.json").status_code == 200
        assert client.get("/docs").status_code == 200
        assert client.get("/redoc").status_code == 200


def test_settings_from_env_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "CIELO_WEBHOOK_TOKEN",
        "DATABASE_PATH",
        "MAX_REQUEST_BODY_BYTES",
        "API_DOCS_ENABLED",
        "PORTAL_TOKEN",
    ):
        monkeypatch.delenv(name, raising=False)
    settings = Settings.from_env()
    assert settings.database_path == Path("data/beacon.sqlite3")
    assert settings.api_docs_enabled is False
    assert settings.portal_token == ""


@pytest.mark.parametrize(
    ("value", "expected"),
    [("true", True), ("false", False), ("", False)],
)
def test_settings_from_env_api_docs_enabled(
    monkeypatch: pytest.MonkeyPatch, value: str, expected: bool
) -> None:
    monkeypatch.setenv("API_DOCS_ENABLED", value)
    assert Settings.from_env().api_docs_enabled is expected


def test_settings_from_env_rejects_invalid_api_docs_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("API_DOCS_ENABLED", "maybe")
    with pytest.raises(ValueError, match="API_DOCS_ENABLED"):
        Settings.from_env()
