"""Database engine, declarative base and shared column types."""

import enum
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import (
    URL,
    DateTime,
    Dialect,
    Engine,
    Integer,
    TypeDecorator,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetime.

    SQLite has no timezone support and returns naive datetimes even for
    ``DateTime(timezone=True)``, so comparing a stored value with ``utc_now()``
    raises TypeError. Values are converted to UTC on the way in (naive input is
    rejected) and tagged as UTC on the way out.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(
        self, value: datetime | None, dialect: Dialect
    ) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetimes are not allowed; use an aware UTC value")
        return value.astimezone(UTC)

    def process_result_value(
        self, value: datetime | None, dialect: Dialect
    ) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class IntEnumType[E: enum.IntEnum](TypeDecorator[E]):
    """IntEnum stored as its integer value.

    SQLAlchemy's Enum stores member names as strings; this keeps the integer
    codes external APIs use (e.g. Cielo's DocumentType). Add a CHECK constraint
    on the table to restrict the column to the enum's values.
    """

    impl = Integer
    cache_ok = True

    def __init__(self, enum_class: type[E]) -> None:
        super().__init__()
        self.enum_class = enum_class

    def process_bind_param(self, value: E | int | None, dialect: Dialect) -> int | None:
        if value is None:
            return None
        return int(self.enum_class(value))  # rejects values outside the enum

    def process_result_value(self, value: int | None, dialect: Dialect) -> E | None:
        if value is None:
            return None
        return self.enum_class(value)


def _enable_foreign_keys(dbapi_connection: Any, connection_record: Any) -> None:
    # SQLite ignores foreign keys (and ON DELETE) unless enabled per connection.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_engine(database_path: Path) -> Engine:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        URL.create("sqlite", database=str(database_path)),
        # Requests are handled in a threadpool, so connections cross threads.
        connect_args={"check_same_thread": False},
    )
    event.listen(engine, "connect", _enable_foreign_keys)
    return engine
