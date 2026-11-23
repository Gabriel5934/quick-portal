"""Request and response bodies for /oauth."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# new_refresh_token() is 43 characters; the bound keeps hashing work small.
MAX_REFRESH_TOKEN_LENGTH = 128


class ClientCredentialsOut(BaseModel):
    """The plaintext secret is returned once and never again."""

    client_id: str
    client_secret: str


class ClientCredentialsConflict(BaseModel):
    detail: str
    client_id: str


CLIENT_CREDENTIALS_GRANT = "client_credentials"


def _login_form_schema(schema: dict[str, Any]) -> None:
    """Documents the contract: grant_type is required and must be
    ``client_credentials``.

    The field itself is optional so that a missing value reaches the route,
    which answers it with the RFC 6749 ``unsupported_grant_type`` 400 rather
    than a 422.
    """
    schema["properties"]["grant_type"] = {
        "type": "string",
        "enum": [CLIENT_CREDENTIALS_GRANT],
        "title": "Grant Type",
    }
    schema["required"] = ["grant_type"]


class OAuthLoginForm(BaseModel):
    """``application/x-www-form-urlencoded`` body of /oauth/login."""

    model_config = ConfigDict(json_schema_extra=_login_form_schema)

    grant_type: str | None = None


class OAuthRefreshIn(BaseModel):
    refresh_token: str = Field(max_length=MAX_REFRESH_TOKEN_LENGTH)


class IntegrationTokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 (OAuth2 token type)
    expires_in: int
    refresh_token: str
