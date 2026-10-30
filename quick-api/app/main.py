"""Application factory. Run with ``uvicorn app.main:create_app --factory``."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import sessionmaker
from starlette.concurrency import run_in_threadpool

from app.auth.deps import CSRF_HEADER
from app.auth.routes import auth_router
from app.auth.service import purge_expired
from app.config import Settings
from app.db import create_db_engine

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate()  # refuses to start without a usable JWT_SECRET

    engine = create_db_engine(settings.database_path)
    session_factory = sessionmaker(engine, expire_on_commit=False)

    def purge() -> None:
        with session_factory() as session:
            deleted = purge_expired(session)
        if deleted:
            logger.info("Purged %d expired refresh tokens", deleted)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        # Needs the migrated schema: the Docker command runs
        # `alembic upgrade head` before uvicorn.
        await run_in_threadpool(purge)
        yield
        engine.dispose()

    docs = settings.api_docs_enabled
    app = FastAPI(
        title="Quick API",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allowed_origins),
        # Lets the browser send and store the refresh cookie cross-origin.
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", CSRF_HEADER],
    )

    @app.get("/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    return app
