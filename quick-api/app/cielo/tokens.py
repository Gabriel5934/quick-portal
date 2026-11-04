"""Cielo access tokens: cached in memory and refreshed single-flight.

Tokens are short-lived (20 minutes in production), so they are never
persisted. A cached token is reused until it is about to expire; the margin
keeps a token from expiring mid-request. When it must be refreshed, a lock lets
one thread request a new token while concurrent callers wait and then reuse
it. The lock is per process: each uvicorn worker refreshes on its own.
"""

import base64
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

from fastapi import status

from app.cielo import http
from app.cielo.errors import CieloInvalidCredentials, CieloInvalidResponse
from app.config import Settings

logger = logging.getLogger(__name__)

# A token that expires within this many seconds is treated as expired.
EXPIRY_MARGIN_SECONDS = 60
# The token endpoint answers bad client credentials with one of these.
CREDENTIALS_REJECTED = (status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED)


@dataclass(frozen=True)
class CachedToken:
    """A token and its expiry, swapped together so readers never see a new
    token with an old expiry (or the reverse)."""

    access_token: str = field(repr=False)
    # Deadline on the manager's clock (time.monotonic by default).
    expires_at: float

    def is_valid(self, now: float) -> bool:
        return now + EXPIRY_MARGIN_SECONDS < self.expires_at


def basic_authorization(merchant_id: str, client_secret: str) -> str:
    credentials = f"{merchant_id}:{client_secret}".encode()
    return "Basic " + base64.b64encode(credentials).decode("ascii")


class CieloTokenManager:
    def __init__(
        self, settings: Settings, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._settings = settings
        self._clock = clock
        self._lock = threading.Lock()
        # Replaced as a whole, never mutated; reading the attribute is atomic.
        self._cached: CachedToken | None = None

    def get_token(self) -> str:
        """A token valid for at least EXPIRY_MARGIN_SECONDS more.

        Raises CieloError when a refresh fails. Threads waiting on the lock
        then try the refresh themselves, one at a time.
        """
        cached = self._cached
        if cached is not None and cached.is_valid(self._clock()):
            return cached.access_token
        with self._lock:
            # Another thread may have refreshed while this one waited.
            cached = self._cached
            if cached is not None and cached.is_valid(self._clock()):
                return cached.access_token
            cached = self._request_token()
            self._cached = cached
            return cached.access_token

    def clear(self, rejected_token: str | None = None) -> None:
        """Drops the cached token so the next call requests a new one.

        With ``rejected_token``, only drops it if it is still the cached one,
        so a token another thread just refreshed survives a late rejection.
        """
        with self._lock:
            cached = self._cached
            if rejected_token is None or (
                cached is not None and cached.access_token == rejected_token
            ):
                self._cached = None

    def _request_token(self) -> CachedToken:
        settings = self._settings
        # Measured before the request, so the expiry errs on the early side.
        requested_at = self._clock()
        response = http.post(
            settings.cielo_token_url,
            data={"grant_type": "client_credentials"},
            headers={
                "Authorization": basic_authorization(
                    settings.cielo_merchant_id, settings.cielo_client_secret
                ),
                "Accept": "application/json",
            },
        )
        if response.status_code in CREDENTIALS_REJECTED:
            logger.warning(
                "Cielo rejected the client credentials (%d)", response.status_code
            )
            raise CieloInvalidCredentials
        if response.status_code >= status.HTTP_400_BAD_REQUEST:
            logger.warning("Cielo token request failed (%d)", response.status_code)
            raise http.relay(response)
        if not http.is_success(response):  # 1xx/3xx; redirects are not followed
            raise CieloInvalidResponse

        try:
            body = response.json()
        except ValueError:
            raise CieloInvalidResponse from None
        access_token = body.get("access_token") if isinstance(body, dict) else None
        expires_in = body.get("expires_in") if isinstance(body, dict) else None
        if (
            not isinstance(access_token, str)
            or not access_token
            or not isinstance(expires_in, int | float)
            or isinstance(expires_in, bool)
            or expires_in <= 0
        ):
            raise CieloInvalidResponse
        logger.info("Requested a new Cielo token (expires in %ss)", expires_in)
        return CachedToken(access_token, requested_at + expires_in)
