"""Makes an existing user a member of an existing business.

Run with ``python -m app.scripts.link_user_business <email> <cnpj>``. Uses
DATABASE_PATH like the app and needs the migrated schema (``alembic upgrade
head``). An existing membership is left untouched, so running it again is safe.
"""

import argparse
import sys

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.auth.service import normalize_email
from app.business import service
from app.business.cnpj import InvalidCnpj, normalize_cnpj
from app.business.models import BusinessMembership
from app.config import Settings
from app.db import create_db_engine


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Link a user to a business.")
    parser.add_argument("email")
    parser.add_argument("cnpj")
    args = parser.parse_args(argv)
    email = normalize_email(args.email)
    try:
        cnpj = normalize_cnpj(args.cnpj)
    except InvalidCnpj as exc:
        print(f"error: {args.cnpj!r}: {exc}", file=sys.stderr)
        return 1

    settings = Settings.from_env()
    engine = create_db_engine(settings.database_path)
    session_factory = sessionmaker(engine, expire_on_commit=False)
    try:
        if not inspect(engine).has_table(BusinessMembership.__tablename__):
            print(
                f"error: no {BusinessMembership.__tablename__} table in "
                f"{settings.database_path}; run `alembic upgrade head` first",
                file=sys.stderr,
            )
            return 1
        with session_factory() as session:
            service.link_user(session, email, cnpj)
    except service.UserNotFound:
        print(f"error: no user {email}", file=sys.stderr)
        return 1
    except service.BusinessNotFound:
        print(f"error: no business {cnpj}", file=sys.stderr)
        return 1
    except service.AlreadyLinked:
        print(f"{email} -> {cnpj}: already linked")
        return 0
    except SQLAlchemyError as exc:
        print(
            f"error: could not link {email} to {cnpj}: {type(exc).__name__}",
            file=sys.stderr,
        )
        return 1
    finally:
        engine.dispose()
    print(f"{email} -> {cnpj}: linked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
