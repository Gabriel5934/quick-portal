"""Reads data from Beacon over the Lightsail private network.

Same approach as app.cielo.http: ``requests`` with a fixed timeout, no
redirects (the X-Portal-Token header must never follow one to another host),
and transport failures turned into BeaconError. Headers are never logged.
"""

import logging
from typing import Any

import requests
from fastapi import status

from app.config import Settings

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 120
PORTAL_TOKEN_HEADER = "X-Portal-Token"  # noqa: S105 (header name)


class BeaconError(Exception):
    status_code = status.HTTP_502_BAD_GATEWAY
    message = "Beacon request failed"


class BeaconNotConfigured(BeaconError):
    """BEACON_PRIVATE_IP or BEACON_PORTAL_TOKEN is empty."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "Beacon is not configured (BEACON_PRIVATE_IP, BEACON_PORTAL_TOKEN)"


class BeaconTimeout(BeaconError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    message = "Beacon did not respond in time"


class BeaconUnavailable(BeaconError):
    """Connection refused, DNS failure or another transport error."""

    message = "Could not connect to Beacon"


class BeaconUpstreamError(BeaconError):
    """Beacon answered with a non-2xx status (401 means a wrong token)."""

    def __init__(self, upstream_status: int):
        super().__init__(f"Beacon returned {upstream_status}")
        self.upstream_status = upstream_status


class BeaconInvalidResponse(BeaconError):
    """A 2xx response whose body is not JSON."""

    message = "Invalid format from Beacon"


def list_transactions(settings: Settings, limit: int, offset: int) -> Any:
    """GET {beacon_base_url}/transactions; returns the parsed JSON page.

    Raises BeaconNotConfigured, BeaconTimeout, BeaconUnavailable,
    BeaconUpstreamError or BeaconInvalidResponse.
    """
    if not settings.beacon_base_url or not settings.beacon_portal_token:
        raise BeaconNotConfigured
    try:
        response = requests.get(
            settings.beacon_base_url + "/transactions",
            params={"limit": limit, "offset": offset},
            headers={
                PORTAL_TOKEN_HEADER: settings.beacon_portal_token,
                "Accept": "application/json",
            },
            timeout=TIMEOUT_SECONDS,
            allow_redirects=False,
        )
    # ConnectTimeout is both a Timeout and a ConnectionError; it maps to 504.
    except requests.Timeout as exc:
        raise BeaconTimeout(type(exc).__name__) from exc
    except requests.RequestException as exc:
        raise BeaconUnavailable(type(exc).__name__) from exc
    if not 200 <= response.status_code < 300:
        logger.warning("Beacon GET /transactions failed (%d)", response.status_code)
        raise BeaconUpstreamError(response.status_code)
    try:
        return response.json()
    except requests.JSONDecodeError:
        raise BeaconInvalidResponse from None
