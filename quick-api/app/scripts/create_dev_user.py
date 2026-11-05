"""Creates the local development login user.

Run with ``python -m app.scripts.create_dev_user`` (``make dev`` runs it in the
quick-api container). Uses DATABASE_PATH like the app and needs the migrated
schema (``alembic upgrade head``). An existing user is left untouched, so
running it again is safe. The password is printed nowhere.

The credential is well known, so never run this against a production
database. Settings have no environment or mode flag to guard on.
"""

import sys

from sqlalchemy import inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.auth.models import User
from app.auth.service import EmailTaken, normalize_email, register
from app.config import Settings
from app.db import create_db_engine

DEV_EMAIL = "user@example.com"
DEV_PASSWORD = "password"  # noqa: S105 (well-known local development login)


def main() -> int:
    settings = Settings.from_env()
    engine = create_db_engine(settings.database_path)
    session_factory = sessionmaker(engine, expire_on_commit=False)
    email = normalize_email(DEV_EMAIL)
    try:
        if not inspect(engine).has_table(User.__tablename__):
            print(
                f"error: no {User.__tablename__} table in {settings.database_path}; "
                "run `alembic upgrade head` first",
                file=sys.stderr,
            )
            return 1
        with session_factory() as session:
            with session.begin():
                exists = session.scalar(select(User.id).where(User.email == email))
            if exists is not None:
                print(f"{email}: already exists, left unchanged")
                return 0
            try:
                register(session, email, DEV_PASSWORD)
            except EmailTaken:
                # Created concurrently between the check and the insert.
                print(f"{email}: already exists, left unchanged")
                return 0
    except SQLAlchemyError as exc:
        print(f"error: could not create {email}: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    print(f"{email}: created")
    return 0


if __name__ == "__main__":
    sys.exit(main())
