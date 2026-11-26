"""SMTP_* settings and the shared FastMail instance. No mail is sent."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi_mail import FastMail

from app import mail
from app.config import Settings

SMTP_ENV = {
    "SMTP_USERNAME": "mailer",
    "SMTP_PASSWORD": "test-smtp-password",
    "SMTP_FROM": "dev@quickapi.com",
    "SMTP_PORT": "1025",
    "SMTP_SERVER": "mailhog",
}


@pytest.fixture
def smtp_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in SMTP_ENV.items():
        monkeypatch.setenv(name, value)


@pytest.fixture
def fresh_mailer() -> Iterator[None]:
    mail.get_mailer.cache_clear()
    yield
    mail.get_mailer.cache_clear()


def test_settings_read_smtp_env(smtp_env: None) -> None:
    settings = Settings.from_env()

    assert settings.smtp_username == "mailer"
    assert settings.smtp_password == "test-smtp-password"
    assert settings.smtp_from == "dev@quickapi.com"
    assert settings.smtp_port == 1025
    assert settings.smtp_server == "mailhog"
    assert "test-smtp-password" not in repr(settings)


def test_smtp_settings_default_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in SMTP_ENV:
        monkeypatch.delenv(name, raising=False)

    settings = Settings.from_env()

    assert settings.smtp_server == ""
    assert settings.smtp_port == 587


def test_template_folder_is_the_container_path() -> None:
    assert Path("/app/templates") == mail.TEMPLATE_FOLDER


def test_get_mailer_uses_settings(
    smtp_env: None,
    fresh_mailer: None,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # ConnectionConfig requires an existing folder; /app/templates exists
    # only in the container.
    monkeypatch.setattr(mail, "TEMPLATE_FOLDER", tmp_path)

    fm = mail.get_mailer()

    assert isinstance(fm, FastMail)
    assert fm is mail.get_mailer()
    assert fm.config.MAIL_SERVER == "mailhog"
    assert fm.config.MAIL_PORT == 1025
    assert fm.config.MAIL_FROM == "dev@quickapi.com"
    assert fm.config.TEMPLATE_FOLDER == tmp_path
    assert fm.config.MAIL_STARTTLS is False
    assert fm.config.MAIL_SSL_TLS is False
    assert fm.config.USE_CREDENTIALS is True
