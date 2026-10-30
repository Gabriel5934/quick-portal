"""Settings read from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import URL

DEFAULT_DATABASE_PATH = "data/quick-api.sqlite3"
DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 5 * 60
DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60
DEFAULT_CORS_ALLOWED_ORIGINS = "http://localhost:5173"
# PyJWT warns about HS256 keys shorter than the 32-byte SHA-256 output.
MIN_JWT_SECRET_BYTES = 32


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name, "").strip().lower()
    if not value:
        return default
    if value in ("1", "true", "yes", "on"):
        return True
    if value in ("0", "false", "no", "off"):
        return False
    raise ValueError(f"{name} must be true or false, got {value!r}")


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name) or default)


def _split_origins(value: str) -> tuple[str, ...]:
    """Origins separated by spaces and/or commas."""
    return tuple(origin for origin in value.replace(",", " ").split() if origin)


@dataclass(frozen=True)
class Settings:
    # Signs access tokens (HS256). Required: create_app refuses to start when it
    # is empty or shorter than MIN_JWT_SECRET_BYTES.
    jwt_secret: str = field(repr=False)
    # SQLite database file. Relative paths resolve from the working directory
    # (/app in the container, where ./data is bind mounted).
    database_path: Path
    access_token_ttl_seconds: int = DEFAULT_ACCESS_TOKEN_TTL_SECONDS
    refresh_token_ttl_seconds: int = DEFAULT_REFRESH_TOKEN_TTL_SECONDS
    # Refresh cookie attributes. Secure must be off for plain-HTTP development;
    # a cross-site frontend needs SameSite=none (which requires Secure).
    cookie_secure: bool = True
    cookie_samesite: str = "lax"
    cors_allowed_origins: tuple[str, ...] = (DEFAULT_CORS_ALLOWED_ORIGINS,)
    # Serves /docs, /redoc and /openapi.json. Off unless explicitly enabled.
    api_docs_enabled: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            jwt_secret=os.environ.get("JWT_SECRET", ""),
            database_path=Path(
                os.environ.get("DATABASE_PATH") or DEFAULT_DATABASE_PATH
            ),
            access_token_ttl_seconds=_env_int(
                "ACCESS_TOKEN_TTL_SECONDS", DEFAULT_ACCESS_TOKEN_TTL_SECONDS
            ),
            refresh_token_ttl_seconds=_env_int(
                "REFRESH_TOKEN_TTL_SECONDS", DEFAULT_REFRESH_TOKEN_TTL_SECONDS
            ),
            cookie_secure=_env_bool("COOKIE_SECURE", True),
            cookie_samesite=(os.environ.get("COOKIE_SAMESITE") or "lax").lower(),
            cors_allowed_origins=_split_origins(
                os.environ.get("CORS_ALLOWED_ORIGINS", DEFAULT_CORS_ALLOWED_ORIGINS)
            ),
            api_docs_enabled=_env_bool("API_DOCS_ENABLED", False),
        )

    @property
    def database_url(self) -> URL:
        return URL.create("sqlite", database=str(self.database_path))

    def validate(self) -> None:
        """Raises ValueError for settings the app must not start with."""
        if len(self.jwt_secret.encode()) < MIN_JWT_SECRET_BYTES:
            raise ValueError(
                f"JWT_SECRET must be set to at least {MIN_JWT_SECRET_BYTES} bytes"
            )
        if self.cookie_samesite not in ("lax", "strict", "none"):
            raise ValueError("COOKIE_SAMESITE must be lax, strict or none")
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("COOKIE_SAMESITE=none requires COOKIE_SECURE=true")
        if self.access_token_ttl_seconds <= 0 or self.refresh_token_ttl_seconds <= 0:
            raise ValueError("token TTLs must be positive")
        # CORS runs with credentials, so "*" would let any site make
        # credentialed requests (the request origin is echoed back).
        if "*" in self.cors_allowed_origins:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must not contain '*'; list the allowed "
                "origins explicitly, e.g. https://app.example.com"
            )
