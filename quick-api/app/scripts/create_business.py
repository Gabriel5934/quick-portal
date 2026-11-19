"""Creates a business.

Run with ``python -m app.scripts.create_business <cnpj>``. Uses DATABASE_PATH
like the app and needs the migrated schema (``alembic upgrade head``). The CNPJ
may be punctuated or lowercase; it is stored normalized. An existing business
is left untouched, so running it again is safe.
"""

import argparse
import sys

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.business import service
from app.business.cnpj import InvalidCnpj, normalize_cnpj
from app.business.models import Business
from app.config import Settings
from app.db import create_db_engine


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a business.")
    parser.add_argument("cnpj")
    args = parser.parse_args(argv)
    try:
        cnpj = normalize_cnpj(args.cnpj)
    except InvalidCnpj as exc:
        print(f"error: {args.cnpj!r}: {exc}", file=sys.stderr)
        return 1

    settings = Settings.from_env()
    engine = create_db_engine(settings.database_path)
    session_factory = sessionmaker(engine, expire_on_commit=False)
    try:
        if not inspect(engine).has_table(Business.__tablename__):
            print(
                f"error: no {Business.__tablename__} table in "
                f"{settings.database_path}; run `alembic upgrade head` first",
                file=sys.stderr,
            )
            return 1
        with session_factory() as session:
            service.create_business(session, cnpj)
    except service.BusinessExists:
        print(f"{cnpj}: already exists, left unchanged")
        return 0
    except SQLAlchemyError as exc:
        print(f"error: could not create {cnpj}: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        engine.dispose()
    print(f"{cnpj}: created")
    return 0


if __name__ == "__main__":
    sys.exit(main())
