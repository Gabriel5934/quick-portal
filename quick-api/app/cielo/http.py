"""The one place Quick API sends HTTP requests to Cielo.

Uses ``requests`` with a 120 second timeout on every call and turns transport
failures into CieloError. Headers (credentials, tokens) and bodies (seller
data) are never logged.
"""

import requests

from app.cielo.errors import CieloTimeout, CieloUnavailable, CieloUpstreamError

TIMEOUT_SECONDS = 120


def post(url: str, **kwargs) -> requests.Response:
    """``requests.post`` with the shared timeout and no redirects.

    Redirects are not followed: a POST must not silently become a GET to
    another URL. Raises CieloTimeout or CieloUnavailable.
    """
    try:
        return requests.post(
            url, timeout=TIMEOUT_SECONDS, allow_redirects=False, **kwargs
        )
    # ConnectTimeout is both a Timeout and a ConnectionError; it maps to 504.
    except requests.Timeout as exc:
        raise CieloTimeout(type(exc).__name__) from exc
    except requests.RequestException as exc:
        raise CieloUnavailable(type(exc).__name__) from exc


def relay(response: requests.Response) -> CieloUpstreamError:
    """Cielo's error response, to be returned to the client as is."""
    return CieloUpstreamError(
        response.status_code, response.content, response.headers.get("Content-Type")
    )


def is_success(response: requests.Response) -> bool:
    return 200 <= response.status_code < 300
