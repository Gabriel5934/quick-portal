"""Shared FastAPI-Mail client, configured from the SMTP_* settings."""

from functools import lru_cache
from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail
from pydantic import SecretStr

from app.config import Settings

# Jinja templates for send_message(template_name=...). The container path:
# docker-compose.dev.yml mounts ./templates here. The production image does
# not ship it, so ConnectionConfig gets no folder there: plain-text mail
# still works, and template mail fails at send time.
TEMPLATE_FOLDER = Path("/app/templates")


@lru_cache(maxsize=1)
def get_mailer() -> FastMail:
    """The process-wide FastMail instance, built on first use.

    Raises pydantic.ValidationError when the settings are unusable (for
    example an empty SMTP_FROM).
    """
    settings = Settings.from_env()
    config = ConnectionConfig(
        MAIL_USERNAME=settings.smtp_username,
        MAIL_PASSWORD=SecretStr(settings.smtp_password),
        MAIL_FROM=settings.smtp_from,
        MAIL_PORT=settings.smtp_port,
        MAIL_SERVER=settings.smtp_server,
        MAIL_STARTTLS=settings.smtp_port == 587,
        MAIL_SSL_TLS=settings.smtp_port == 465,
        # MailHog in dev needs no login: an empty username skips it.
        USE_CREDENTIALS=bool(settings.smtp_username),
        VALIDATE_CERTS=True,
        TEMPLATE_FOLDER=TEMPLATE_FOLDER if TEMPLATE_FOLDER.is_dir() else None,
    )
    fm = FastMail(config)
    return fm
