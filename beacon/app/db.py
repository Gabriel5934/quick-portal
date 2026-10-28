"""Database engine, declarative base and shared column types."""

from datetime import UTC, datetime
from enum import IntEnum
from pathlib import Path

from sqlalchemy import URL, Dialect, Engine, Integer, TypeDecorator, create_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class IntEnumType(TypeDecorator[IntEnum]):
    """Stores an IntEnum as its integer value."""

    impl = Integer
    cache_ok = True

    def __init__(self, enum_class: type[IntEnum]) -> None:
        super().__init__()
        self.enum_class = enum_class

    def process_bind_param(self, value: IntEnum | None, dialect: Dialect) -> int | None:
        return None if value is None else int(self.enum_class(value))

    def process_result_value(
        self, value: int | None, dialect: Dialect
    ) -> IntEnum | None:
        return None if value is None else self.enum_class(value)


def create_db_engine(database_path: Path) -> Engine:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(
        URL.create("sqlite", database=str(database_path)),
        # Requests are handled in a threadpool, so connections cross threads.
        connect_args={"check_same_thread": False},
    )
