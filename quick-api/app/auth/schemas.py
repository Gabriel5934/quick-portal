"""Request and response bodies for /auth."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Lengths count code points. Any character is allowed and nothing is stripped.
MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 64


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH
    )


class LoginIn(BaseModel):
    """Only the maximum applies: it bounds the hashing work per request."""

    email: EmailStr
    password: str = Field(max_length=MAX_PASSWORD_LENGTH)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 (OAuth2 token type)
    expires_in: int
