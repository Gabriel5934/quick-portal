"""Settings read from environment variables."""

import ipaddress
import os
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import URL

DEFAULT_DATABASE_PATH = "data/quick-api.sqlite3"
DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 5 * 60
DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60
# PyJWT warns about HS256 keys shorter than the 32-byte SHA-256 output.
MIN_JWT_SECRET_BYTES = 32
BEACON_PORT = 8000
# RFC 1123 hostname: dot-separated labels of letters, digits and inner hyphens.
_HOSTNAME_LABEL = re.compile(r"(?!-)[A-Za-z0-9-]{1,63}(?<!-)")


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


def _env_list(name: str) -> tuple[str, ...]:
    """Comma-separated values, trimmed, with empty entries dropped."""
    parts = (part.strip() for part in _env_str(name).split(","))
    return tuple(part for part in parts if part)


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


def _is_ipv4_or_hostname(value: str) -> bool:
    """A bare IPv4 address or hostname: no scheme, port, path or brackets."""
    try:
        ipaddress.IPv4Address(value)
    except ValueError:
        pass
    else:
        return True
    labels = value.split(".")
    # All-numeric dotted values are malformed IPv4 addresses, not hostnames.
    if len(value) > 253 or all(label.isdigit() for label in labels):
        return False
    return all(_HOSTNAME_LABEL.fullmatch(label) for label in labels)


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
    # header; the merchant ID (a UUID) is also sent as masterMerchantId when
    # onboarding sellers.
    cielo_merchant_id: str
    cielo_client_secret: str = field(repr=False)
    # Scheme and host only (e.g. https://authsandbox.braspag.com.br); the
    # endpoint paths are appended by app.cielo.
    cielo_auth_base_url: str
    cielo_onboarding_base_url: str
    access_token_ttl_seconds: int = DEFAULT_ACCESS_TOKEN_TTL_SECONDS
    refresh_token_ttl_seconds: int = DEFAULT_REFRESH_TOKEN_TTL_SECONDS
    # Serves /docs, /redoc and /openapi.json. Off unless explicitly enabled.
    api_docs_enabled: bool = False
    # Beacon over the Lightsail private network. Optional: when either is
    # empty Quick API still starts and app.beacon raises BeaconNotConfigured.
    # beacon_private_ip is an IPv4 address or hostname only (validated when
    # set); beacon_base_url adds the scheme and port.
    beacon_private_ip: str = ""
    # Sent as X-Portal-Token; must match PORTAL_TOKEN in Beacon's env.
    beacon_portal_token: str = field(default="", repr=False)
    # Cloudflare Turnstile on /auth/register. Not checked at startup, but
    # registration fails closed: with either empty every registration is
    # rejected. Hostnames are the ones the widget may be solved on.
    turnstile_secret: str = field(default="", repr=False)
    turnstile_hostnames: tuple[str, ...] = ()

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
            access_token_ttl_seconds=_env_int(
                "ACCESS_TOKEN_TTL_SECONDS", DEFAULT_ACCESS_TOKEN_TTL_SECONDS
            ),
            refresh_token_ttl_seconds=_env_int(
                "REFRESH_TOKEN_TTL_SECONDS", DEFAULT_REFRESH_TOKEN_TTL_SECONDS
            ),
            api_docs_enabled=_env_bool("API_DOCS_ENABLED", False),
            beacon_private_ip=_env_str("BEACON_PRIVATE_IP"),
            beacon_portal_token=_env_str("BEACON_PORTAL_TOKEN"),
            turnstile_secret=_env_str("TURNSTILE_SECRET"),
            turnstile_hostnames=_env_list("TURNSTILE_HOSTNAMES"),
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

    @property
    def beacon_base_url(self) -> str:
        """http://{BEACON_PRIVATE_IP}:8000, or empty when the IP is unset."""
        if not self.beacon_private_ip:
            return ""
        return f"http://{self.beacon_private_ip}:{BEACON_PORT}"

    def validate(self) -> None:
        """Raises ValueError for settings the app must not start with."""
        if len(self.jwt_secret.encode()) < MIN_JWT_SECRET_BYTES:
            raise ValueError(
                f"JWT_SECRET must be set to at least {MIN_JWT_SECRET_BYTES} bytes"
            )
        if self.access_token_ttl_seconds <= 0 or self.refresh_token_ttl_seconds <= 0:
            raise ValueError("token TTLs must be positive")
        self._validate_cielo()
        self._validate_beacon()

    def _validate_cielo(self) -> None:
        required = {
            "CIELO_MERCHANT_ID": self.cielo_merchant_id,
            "CIELO_CLIENT_SECRET": self.cielo_client_secret,
            "CIELO_AUTH_BASE_URL": self.cielo_auth_base_url,
            "CIELO_ONBOARDING_BASE_URL": self.cielo_onboarding_base_url,
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
            uuid.UUID(self.cielo_merchant_id)
        except ValueError:
            raise ValueError("CIELO_MERCHANT_ID must be a UUID") from None

    def _validate_beacon(self) -> None:
        if self.beacon_private_ip and not _is_ipv4_or_hostname(self.beacon_private_ip):
            raise ValueError(
                "BEACON_PRIVATE_IP must be an IPv4 address or hostname without a "
                "scheme, port or path, e.g. 172.26.0.10"
            )
