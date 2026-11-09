"""Read-only endpoint Quick API calls over the Lightsail private network.

Published only on the instance's private IP (see docker-compose.yml), not
through Caddy. The Lightsail firewall does not filter private traffic, so every
request must carry the shared PORTAL_TOKEN in the X-Portal-Token header.
"""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import defer

from app.cielo.models import CieloNotificationTransaction
from app.portal.schemas import TransactionOut, TransactionPage

PORTAL_TOKEN_HEADER = "X-Portal-Token"  # noqa: S105 (header name)
DEFAULT_LIMIT = 50
MAX_LIMIT = 100

portal_router = APIRouter(tags=["portal"])


def require_portal_token(
    request: Request,
    token: Annotated[str | None, Header(alias=PORTAL_TOKEN_HEADER)] = None,
) -> None:
    """Rejects requests whose token header is missing or wrong (constant time)."""
    expected: str = request.app.state.settings.portal_token
    if (
        not expected
        or token is None
        or not hmac.compare_digest(token.encode(), expected.encode())
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


@portal_router.get("/transactions", dependencies=[Depends(require_portal_token)])
def list_transactions(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = DEFAULT_LIMIT,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionPage:
    """Every stored transaction notification, oldest first (by id)."""
    model = CieloNotificationTransaction
    with request.app.state.session_factory() as session:
        total = session.scalar(select(func.count()).select_from(model)) or 0
        rows = session.scalars(
            select(model)
            # The raw body is never returned, so it is not loaded either.
            .options(defer(model.body))
            .order_by(model.id)
            .limit(limit)
            .offset(offset)
        ).all()
        items = [TransactionOut.model_validate(row) for row in rows]
    return TransactionPage(items=items, total=total, limit=limit, offset=offset)
