"""Replaying a rotated-out refresh token revokes all of the user's tokens."""

from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth import service
from app.auth.models import RefreshToken, RevokedReason, User
from app.config import Settings
from app.db import utc_now
from tests.conftest import (
    CSRF,
    bearer,
    login,
    refresh,
    register,
    set_refresh_cookie,
)

EMAIL = "ana@example.com"
OTHER_EMAIL = "bruno@example.com"


def user_state(app: FastAPI, email: str) -> tuple[int, list[RefreshToken]]:
    """token_version and refresh rows, read from a fresh session."""
    with app.state.session_factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        rows = list(
            session.scalars(
                select(RefreshToken)
                .where(RefreshToken.user_id == user.id)
                .order_by(RefreshToken.id)
            )
        )
        return user.token_version, rows


def test_replaying_a_rotated_token_revokes_everything(
    app: FastAPI, client: TestClient, new_client: Callable[[], TestClient]
) -> None:
    register(client, EMAIL)
    register(client, OTHER_EMAIL)
    access_a = login(client, EMAIL)
    token_a = client.cookies["refresh_token"]

    # A second browser of the same user, and another user.
    same_user = new_client()
    login(same_user, EMAIL)
    other_user = new_client()
    other_access = login(other_user, OTHER_EMAIL)

    response = refresh(client)  # A -> B
    assert response.status_code == 200
    access_b = response.json()["access_token"]
    token_b = client.cookies["refresh_token"]

    set_refresh_cookie(client, token_a)  # replay A
    replay = refresh(client)
    assert replay.status_code == 401
    assert replay.json() == {"detail": "Refresh token was already used."}
    assert "Max-Age=0" in replay.headers["set-cookie"]

    token_version, rows = user_state(app, EMAIL)
    assert token_version == 1
    assert all(row.revoked_at is not None for row in rows)
    reasons = [row.revoked_reason for row in rows]
    # A keeps "rotated"; B and the other browser's token were revoked for reuse.
    assert reasons == [
        RevokedReason.ROTATED,
        RevokedReason.REUSE_DETECTED,
        RevokedReason.REUSE_DETECTED,
    ]

    # B and the other browser can no longer refresh.
    set_refresh_cookie(client, token_b)
    assert refresh(client).status_code == 401
    assert refresh(same_user).status_code == 401
    # Access tokens issued before the reuse are dead immediately (tv check).
    assert client.get("/auth/me", headers=bearer(access_a)).status_code == 401
    assert client.get("/auth/me", headers=bearer(access_b)).status_code == 401

    # The other user is untouched.
    other_version, other_rows = user_state(app, OTHER_EMAIL)
    assert other_version == 0
    assert [row.revoked_at for row in other_rows] == [None]
    assert other_user.get("/auth/me", headers=bearer(other_access)).status_code == 200
    assert refresh(other_user).status_code == 200

    # Logging in again starts a working session with the new token_version.
    fresh_access = login(client, EMAIL)
    assert client.get("/auth/me", headers=bearer(fresh_access)).status_code == 200
    assert refresh(client).status_code == 200


def test_replaying_a_reuse_revoked_token_does_not_bump_again(
    app: FastAPI, client: TestClient
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    token_a = client.cookies["refresh_token"]
    refresh(client)
    token_b = client.cookies["refresh_token"]
    set_refresh_cookie(client, token_a)
    assert refresh(client).status_code == 401  # reuse: tv 0 -> 1

    set_refresh_cookie(client, token_b)  # revoked as reuse_detected
    assert refresh(client).status_code == 401
    token_version, _ = user_state(app, EMAIL)
    assert token_version == 1


def test_reuse_revocation_is_committed_before_the_401(
    app: FastAPI, settings: Settings, client: TestClient
) -> None:
    """Service level: the revocation survives the caller rolling back."""
    register(client, EMAIL)
    login(client, EMAIL)
    token_a = client.cookies["refresh_token"]
    assert refresh(client).status_code == 200

    session: Session = app.state.session_factory()
    try:
        with pytest.raises(service.RefreshTokenReused):
            service.rotate_refresh(session, token_a, settings)
        session.rollback()  # what a failing request handler would do
    finally:
        session.close()

    token_version, rows = user_state(app, EMAIL)  # fresh session
    assert token_version == 1
    assert all(row.revoked_at is not None for row in rows)


def test_logout_and_refresh_do_not_revoke_as_reuse(
    app: FastAPI, client: TestClient
) -> None:
    register(client, EMAIL)
    login(client, EMAIL)
    refresh(client)
    assert client.post("/auth/logout", headers=CSRF).status_code == 204
    token_version, rows = user_state(app, EMAIL)
    assert token_version == 0
    assert [row.revoked_reason for row in rows] == [
        RevokedReason.ROTATED,
        RevokedReason.LOGOUT,
    ]


# Atomic rotation: the conditional UPDATE, not the earlier read, decides.


def concurrently_revoke(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch, reason: RevokedReason
) -> None:
    """Makes the next lookup return a stale, unrevoked snapshot.

    After reading the row, another session revokes it with ``reason`` and
    commits, as a concurrent refresh or logout would between the read and the
    UPDATE.
    """
    original = service._find_refresh_token

    def stale_lookup(session: Session, token_hash: str) -> RefreshToken | None:
        row = original(session, token_hash)
        assert row is not None and row.revoked_at is None
        with app.state.session_factory() as other, other.begin():
            other.execute(
                update(RefreshToken)
                .where(RefreshToken.id == row.id)
                .values(revoked_at=utc_now(), revoked_reason=reason)
            )
        return row

    monkeypatch.setattr(service, "_find_refresh_token", stale_lookup)


def test_losing_a_rotation_race_takes_the_reuse_path(
    app: FastAPI, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register(client, EMAIL)
    access = login(client, EMAIL)
    concurrently_revoke(app, monkeypatch, RevokedReason.ROTATED)

    response = refresh(client)
    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token was already used."}

    token_version, rows = user_state(app, EMAIL)
    # No second token was issued, and the reuse path ran.
    assert len(rows) == 1
    assert rows[0].revoked_reason is RevokedReason.ROTATED
    assert rows[0].replaced_by_id is None
    assert token_version == 1
    assert client.get("/auth/me", headers=bearer(access)).status_code == 401


def test_losing_a_race_against_logout_is_a_plain_401(
    app: FastAPI,
    client: TestClient,
    new_client: Callable[[], TestClient],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    register(client, EMAIL)
    access = login(client, EMAIL)
    other = new_client()
    login(other, EMAIL)
    concurrently_revoke(app, monkeypatch, RevokedReason.LOGOUT)

    response = refresh(client)
    assert response.status_code == 401
    assert response.json() == {"detail": "Refresh token is invalid or expired."}

    monkeypatch.undo()
    token_version, rows = user_state(app, EMAIL)
    assert token_version == 0
    assert [row.revoked_reason for row in rows] == [RevokedReason.LOGOUT, None]
    assert client.get("/auth/me", headers=bearer(access)).status_code == 200
    assert refresh(other).status_code == 200
