"""Application factory. Run with ``uvicorn app.main:create_app --factory``."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.orm import sessionmaker

from app.cielo.routes import cielo_router
from app.config import Settings
from app.db import create_db_engine

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if not settings.cielo_webhook_token:
        logger.warning(
            "CIELO_WEBHOOK_TOKEN is not set: every Cielo notification will be "
            "rejected with 401."
        )

    engine = create_db_engine(settings.database_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    # Only the notification endpoint is exposed; no interactive docs.
    app = FastAPI(
        title="Beacon",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.include_router(cielo_router)
    return app
