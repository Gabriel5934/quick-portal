"""Cloudflare Turnstile verification for /auth/register.

Same approach as app.cielo.http: ``requests`` with a fixed timeout and no
redirects. Fails closed: missing settings, transport errors, non-2xx responses
and malformed bodies all count as a failed verification. The secret and the
token are never logged.
"""

import logging

import requests

from app.config import Settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TIMEOUT_SECONDS = 10
# Must match data-action on the portal's registration widget.
REGISTER_ACTION = "register"


def verify(
    settings: Settings,
    token: str,
    remote_ip: str | None = None,
    action: str = REGISTER_ACTION,
) -> bool:
    """True only when Cloudflare accepts the token for this action and host."""
    allowed = {hostname.lower() for hostname in settings.turnstile_hostnames}
    if not settings.turnstile_secret or not allowed:
        logger.warning("Turnstile is not configured; rejecting verification")
        return False
    if not token:
        return False
    data = {"secret": settings.turnstile_secret, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        response = requests.post(
            SITEVERIFY_URL,
            data=data,
            timeout=TIMEOUT_SECONDS,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        logger.warning("Turnstile siteverify failed (%s)", type(exc).__name__)
        return False
    if not 200 <= response.status_code < 300:
        logger.warning("Turnstile siteverify failed (%d)", response.status_code)
        return False
    try:
        body = response.json()
    except requests.JSONDecodeError:
        return False
    if not isinstance(body, dict):
        return False
    hostname = body.get("hostname")
    return (
        body.get("success") is True
        and body.get("action") == action
        and isinstance(hostname, str)
        and hostname.lower() in allowed
    )
