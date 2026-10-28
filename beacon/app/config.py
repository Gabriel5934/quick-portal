"""Settings read from environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import URL

DEFAULT_DATABASE_PATH = "data/beacon.sqlite3"


@dataclass(frozen=True)
class Settings:
    # Shared secret Cielo sends in the X-Cielo-Webhook-Token header. When it is
    # empty every notification is rejected.
    cielo_webhook_token: str
    # SQLite database file. Relative paths resolve from the working directory
    # (/app in the container, where ./data is bind mounted).
    database_path: Path

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            cielo_webhook_token=os.environ.get("CIELO_WEBHOOK_TOKEN", ""),
            database_path=Path(
                os.environ.get("DATABASE_PATH") or DEFAULT_DATABASE_PATH
            ),
        )

    @property
    def database_url(self) -> URL:
        return URL.create("sqlite", database=str(self.database_path))
