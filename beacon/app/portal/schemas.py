"""Response bodies for the endpoints Quick API calls over the private network."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.cielo.enums import CieloTransactionChangeType


class TransactionOut(BaseModel):
    """A stored transaction notification, without its raw ``body`` bytes."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    payment_id: uuid.UUID | None
    change_type: CieloTransactionChangeType | None
    recurrent_payment_id: uuid.UUID | None
    received_at: datetime | None


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int
