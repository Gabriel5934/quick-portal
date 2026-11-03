"""Failures talking to Cielo, each with the response Quick API returns for it.

Bodies use ``{"message": ...}`` as the Quick API docs specify, except
CieloUpstreamError, which passes Cielo's own status and body through.
"""

from fastapi import status
from fastapi.responses import JSONResponse, Response

INVALID_CREDENTIALS = "Invalid Cielo Credentials"
INVALID_FORMAT = "Invalid format from Cielo"


class CieloError(Exception):
    status_code = status.HTTP_502_BAD_GATEWAY
    message = "Cielo request failed"

    def to_response(self) -> Response:
        return JSONResponse(
            status_code=self.status_code, content={"message": self.message}
        )


class CieloInvalidCredentials(CieloError):
    """The token endpoint rejected our credentials (400/401), or Cielo
    rejected the bearer token (401)."""

    message = INVALID_CREDENTIALS


class CieloInvalidResponse(CieloError):
    """A 2xx (or otherwise non-error) response without the expected fields."""

    message = INVALID_FORMAT


class CieloTimeout(CieloError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    message = "Cielo did not respond in time"


class CieloUnavailable(CieloError):
    """Connection refused, DNS failure, TLS error or another transport error."""

    message = "Could not connect to Cielo"


class CieloUpstreamError(CieloError):
    """Any other 4xx/5xx: relayed with Cielo's status and body unchanged, so
    validation errors stay actionable for the client."""

    def __init__(self, status_code: int, content: bytes, content_type: str | None):
        super().__init__(f"Cielo returned {status_code}")
        self.status_code = status_code
        self.content = content
        self.content_type = content_type

    def to_response(self) -> Response:
        return Response(
            content=self.content,
            status_code=self.status_code,
            media_type=self.content_type,
        )
