"""SQLite specifics: UTC datetimes, foreign keys, migrations and the purge."""

import uuid
from datetime import UTC, datetime, timedelta, timezone

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.models import RefreshToken, User
from app.config import Settings
from app.db import Base, utc_now


def make_user(session: Session, email: str = "ana@example.com") -> User:
    user = User(email=email, password_hash="not-a-real-hash")  # noqa: S106
    with session.begin():
        session.add(user)
    return user


def make_token(
    session: Session, user: User, expires_at: datetime, **values
) -> RefreshToken:
    row = RefreshToken(
        user_id=user.id,
        token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
        expires_at=expires_at,
        **values,
    )
    with session.begin():
        session.add(row)
    return row


def reload(app: FastAPI, model, row_id):
    with app.state.session_factory() as session:
        return session.get(model, row_id)


# UTCDateTime


def test_datetimes_round_trip_as_aware_utc(app: FastAPI, session: Session) -> None:
    user = make_user(session)
    expires_at = datetime(2030, 1, 2, 3, 4, 5, 123456, tzinfo=UTC)
    row = make_token(session, user, expires_at)

    stored = reload(app, RefreshToken, row.id)
    assert stored.expires_at == expires_at
    assert stored.expires_at.tzinfo is UTC
    assert stored.created_at.tzinfo is UTC
    assert reload(app, User, user.id).created_at.tzinfo is UTC
    # The comparison that fails with naive values from SQLite.
    assert stored.expires_at > utc_now()


def test_other_timezones_are_stored_as_utc(app: FastAPI, session: Session) -> None:
    user = make_user(session)
    sao_paulo = timezone(timedelta(hours=-3))
    row = make_token(session, user, datetime(2030, 1, 1, 21, 0, tzinfo=sao_paulo))

    stored = reload(app, RefreshToken, row.id)
    assert stored.expires_at == datetime(2030, 1, 2, 0, 0, tzinfo=UTC)
    assert stored.expires_at.tzinfo is UTC
    raw = session.execute(
        text("SELECT expires_at FROM refresh_tokens WHERE id = :id"), {"id": row.id}
    ).scalar_one()
    assert raw.startswith("2030-01-02 00:00:00")


def test_naive_datetimes_are_rejected(session: Session) -> None:
    user = make_user(session)
    with pytest.raises(StatementError, match="naive datetimes"):
        make_token(session, user, datetime(2030, 1, 1))


def test_sql_comparisons_use_utc(app: FastAPI, session: Session) -> None:
    user = make_user(session)
    past = make_token(session, user, utc_now() - timedelta(minutes=1))
    future = make_token(session, user, utc_now() + timedelta(minutes=1))
    # An aware non-UTC "now" is converted before comparing in SQL.
    now_in_sao_paulo = utc_now().astimezone(timezone(timedelta(hours=-3)))
    with app.state.session_factory() as fresh:
        expired_ids = fresh.scalars(
            select(RefreshToken.id).where(RefreshToken.expires_at < now_in_sao_paulo)
        ).all()
    assert expired_ids == [past.id]
    assert future.id not in expired_ids


# Foreign keys


def test_foreign_keys_are_enforced(session: Session) -> None:
    assert session.execute(text("PRAGMA foreign_keys")).scalar_one() == 1


def test_deleting_a_user_cascades_to_its_tokens(app: FastAPI, session: Session) -> None:
    user = make_user(session)
    other = make_user(session, "bruno@example.com")
    make_token(session, user, utc_now() + timedelta(days=1))
    kept = make_token(session, other, utc_now() + timedelta(days=1))

    with session.begin():
        session.execute(delete(User).where(User.id == user.id))

    with app.state.session_factory() as fresh:
        assert fresh.scalars(select(RefreshToken.id)).all() == [kept.id]


def test_deleting_the_replacement_nulls_replaced_by_id(
    app: FastAPI, session: Session
) -> None:
    user = make_user(session)
    replacement = make_token(session, user, utc_now() + timedelta(days=1))
    replaced = make_token(
        session, user, utc_now() + timedelta(days=1), replaced_by_id=replacement.id
    )
    with session.begin():
        session.execute(delete(RefreshToken).where(RefreshToken.id == replacement.id))
    assert reload(app, RefreshToken, replaced.id).replaced_by_id is None


def test_unknown_user_id_is_rejected(session: Session) -> None:
    with pytest.raises(StatementError, match="FOREIGN KEY"):
        with session.begin():
            session.add(
                RefreshToken(
                    user_id=uuid.uuid4(),
                    token_hash="0" * 64,
                    expires_at=utc_now() + timedelta(days=1),
                )
            )


# Migrations


def test_migrations_match_the_models(app: FastAPI, session: Session) -> None:
    connection = session.connection()
    context = MigrationContext.configure(connection)
    assert compare_metadata(context, Base.metadata) == []


# Purging expired refresh tokens


def test_purge_deletes_only_expired_tokens(app: FastAPI, session: Session) -> None:
    user = make_user(session)
    expired = make_token(session, user, utc_now() - timedelta(seconds=1))
    expired_revoked = make_token(
        session, user, utc_now() - timedelta(days=1), revoked_at=utc_now()
    )
    valid = make_token(session, user, utc_now() + timedelta(days=1))
    valid_revoked = make_token(
        session, user, utc_now() + timedelta(days=1), revoked_at=utc_now()
    )

    assert service.purge_expired(session) == 2
    with app.state.session_factory() as fresh:
        remaining = set(fresh.scalars(select(RefreshToken.id)))
    assert remaining == {valid.id, valid_revoked.id}
    assert expired.id not in remaining and expired_revoked.id not in remaining


def test_startup_purges_expired_tokens(
    app: FastAPI, settings: Settings, session: Session
) -> None:
    user = make_user(session)
    make_token(session, user, utc_now() - timedelta(seconds=1))
    valid = make_token(session, user, utc_now() + timedelta(days=1))

    with TestClient(app):  # runs the lifespan
        pass

    with app.state.session_factory() as fresh:
        assert fresh.scalars(select(RefreshToken.id)).all() == [valid.id]
