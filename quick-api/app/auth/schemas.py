"""Request and response bodies for /auth."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

MIN_PASSWORD_LENGTH = 10
# Argon2 hashes any length, but cap the input to bound the work per request.
MAX_PASSWORD_LENGTH = 1024


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH
    )


class LoginIn(BaseModel):
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
