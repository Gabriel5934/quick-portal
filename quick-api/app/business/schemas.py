"""Response bodies for /businesses."""

import uuid

from pydantic import BaseModel, ConfigDict


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    # Normalized: 14 uppercase letters or digits, no punctuation.
    cnpj: str
    # Integration client id (app.oauth); null until credentials are generated.
    # The secret (and its hash) is never exposed here.
    client_id: str | None
