"""Settings read from environment variables."""

import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

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


def _env_str(name: str) -> str:
    return os.environ.get(name, "").strip()


def _env_base_url(name: str) -> str:
    """Base URLs are joined with an absolute path, so trailing slashes go."""
    return _env_str(name).rstrip("/")


def _is_base_url(value: str) -> bool:
    """scheme://host[:port] with nothing after it (a trailing slash is fine)."""
    # urlsplit drops a bare "?" or "#", so check the delimiters themselves.
    if "?" in value or "#" in value:
        return False
    parts = urlsplit(value)
    return (
        parts.scheme in ("http", "https")
        # netloc alone would accept a port without a host ("http://:3000").
        and bool(parts.hostname)
        and parts.path in ("", "/")
    )


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
    # Cielo Split API. All required: create_app refuses to start when any is
    # empty. Merchant ID and client secret build the token request's Basic
    # header; the master merchant ID is sent as masterMerchantId when
    # onboarding sellers.
    cielo_merchant_id: str
    cielo_client_secret: str = field(repr=False)
    # Scheme and host only (e.g. https://authsandbox.braspag.com.br); the
    # endpoint paths are appended by app.cielo.
    cielo_auth_base_url: str
    cielo_onboarding_base_url: str
    cielo_master_merchant_id: str
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
            cielo_merchant_id=_env_str("CIELO_MERCHANT_ID"),
            cielo_client_secret=_env_str("CIELO_CLIENT_SECRET"),
            cielo_auth_base_url=_env_base_url("CIELO_AUTH_BASE_URL"),
            cielo_onboarding_base_url=_env_base_url("CIELO_ONBOARDING_BASE_URL"),
            cielo_master_merchant_id=_env_str("CIELO_MASTER_MERCHANT_ID"),
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

    @property
    def cielo_token_url(self) -> str:
        return self.cielo_auth_base_url.rstrip("/") + "/oauth2/token"

    @property
    def cielo_onboarding_url(self) -> str:
        return self.cielo_onboarding_base_url.rstrip("/") + "/api/merchants"

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
        self._validate_cielo()

    def _validate_cielo(self) -> None:
        required = {
            "CIELO_MERCHANT_ID": self.cielo_merchant_id,
            "CIELO_CLIENT_SECRET": self.cielo_client_secret,
            "CIELO_AUTH_BASE_URL": self.cielo_auth_base_url,
            "CIELO_ONBOARDING_BASE_URL": self.cielo_onboarding_base_url,
            "CIELO_MASTER_MERCHANT_ID": self.cielo_master_merchant_id,
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise ValueError(f"{', '.join(missing)} must be set")
        for name in ("CIELO_AUTH_BASE_URL", "CIELO_ONBOARDING_BASE_URL"):
            if not _is_base_url(required[name]):
                raise ValueError(
                    f"{name} must be an http(s) scheme and host without a path, "
                    "query or fragment, e.g. https://authsandbox.braspag.com.br"
                )
        try:
            uuid.UUID(self.cielo_master_merchant_id)
        except ValueError:
            raise ValueError("CIELO_MASTER_MERCHANT_ID must be a UUID") from None
