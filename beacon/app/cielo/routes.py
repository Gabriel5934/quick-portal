"""Endpoint that receives Cielo Split API notifications."""

import hmac
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, sessionmaker
from starlette.concurrency import run_in_threadpool

from app.cielo.models import CieloNotification, CieloNotificationUnhandled
from app.cielo.parsing import parse_notification

logger = logging.getLogger(__name__)

WEBHOOK_TOKEN_HEADER = "X-Cielo-Webhook-Token"  # noqa: S105 (header name)

cielo_router = APIRouter(prefix="/cielo", tags=["cielo"])


def require_cielo_webhook_token(
    request: Request,
    token: Annotated[str | None, Header(alias=WEBHOOK_TOKEN_HEADER)] = None,
) -> None:
    """Rejects requests whose token header is missing or wrong (constant time)."""
    expected: str = request.app.state.settings.cielo_webhook_token
    if (
        not expected
        or token is None
        or not hmac.compare_digest(token.encode(), expected.encode())
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)


def store_notification(
    session_factory: sessionmaker[Session], notification: CieloNotification
) -> None:
    with session_factory() as session, session.begin():
        session.add(notification)


@cielo_router.post(
    "/notifications", dependencies=[Depends(require_cielo_webhook_token)]
)
async def receive_cielo_notification(request: Request) -> Response:
    body = await request.body()
    try:
        notification = parse_notification(body)
    except Exception:
        # Parsing is not expected to raise; never lose the raw body if it does.
        logger.exception("Failed to parse Cielo notification; storing it unhandled")
        notification = CieloNotificationUnhandled(body=body)

    session_factory = request.app.state.session_factory
    try:
        try:
            await run_in_threadpool(store_notification, session_factory, notification)
        except Exception:
            if isinstance(notification, CieloNotificationUnhandled):
                raise  # already the fallback; nothing else to try
            logger.exception(
                "Failed to store %s (ChangeType=%r, PaymentId=%s); storing unhandled",
                type(notification).__name__,
                getattr(notification, "change_type", None),
                getattr(notification, "payment_id", None),
            )
            await run_in_threadpool(
                store_notification,
                session_factory,
                CieloNotificationUnhandled(body=body),
            )
    except Exception:
        logger.exception("Failed to store Cielo notification")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal Server Error"},
        )

    return Response(status_code=status.HTTP_200_OK)
