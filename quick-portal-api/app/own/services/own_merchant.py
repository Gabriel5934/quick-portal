import json
import logging
import uuid
from pathlib import Path

import requests
from django.conf import settings
from django.utils import timezone

from own.services.own_auth import get_own_token

logger = logging.getLogger(__name__)


def _response_body(response):
    try:
        return response.json()
    except ValueError:
        return response.text


def _write_registration_trace(payload, url, *, response=None, error=None):
    """Persist an opt-in, full OWN registration request/response trace."""
    if not settings.OWN_REGISTRATION_TRACE_ENABLED:
        return

    trace = {
        "recorded_at": timezone.now().isoformat(),
        "url": url,
        "request_payload": payload,
    }
    if response is not None:
        trace["response"] = {
            "status_code": response.status_code,
            "body": _response_body(response),
        }
    if error is not None:
        trace["error"] = str(error)

    try:
        trace_dir = Path(settings.OWN_REGISTRATION_TRACE_DIR)
        trace_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{timezone.now():%Y%m%dT%H%M%S%fZ}-{uuid.uuid4().hex}.json"
        (trace_dir / filename).write_text(
            json.dumps(trace, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    except OSError:
        logger.exception("Unable to write OWN registration trace")


class MerchantRegistrationError(Exception):
    def __init__(self, message, status_code=None, response_body=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


def register_merchant(payload: dict) -> dict:
    """Register a merchant in OWN and return the upstream success payload."""
    token = get_own_token()
    url = f"{settings.OWN_BASE_URL}/cadastrarConveniada"

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except requests.RequestException as exc:
        _write_registration_trace(payload, url, error=exc)
        raise MerchantRegistrationError(f"Connection error: {exc}") from exc

    _write_registration_trace(payload, url, response=response)
    if response.status_code == 200:
        return response.json()

    raise MerchantRegistrationError(
        f"Merchant registration failed with status {response.status_code}",
        status_code=response.status_code,
        response_body=response.text,
    )
