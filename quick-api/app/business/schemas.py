"""Response bodies for /businesses."""

import uuid

from pydantic import BaseModel, ConfigDict


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Normalized: 14 uppercase letters or digits, no punctuation.
    cnpj: str
