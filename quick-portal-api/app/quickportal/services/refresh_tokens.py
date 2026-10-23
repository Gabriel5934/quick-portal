"""Refresh token cookie, rotation and revocation helpers.

The refresh token never appears in a response body. It is set as an HttpOnly
cookie scoped to the token endpoints, rotated on every refresh, and blacklisted
after use. Each blacklist entry records why it was blacklisted
(``BlacklistedTokenReason``). Presenting a token that was blacklisted by
rotation is treated as token theft and revokes every outstanding token of that
user. A token blacklisted by logout or by that revocation is only rejected.

Every path that changes a user's tokens runs inside ``_user_transaction``,
which locks the user row before any token row, so those paths are serialized
per user and always take their locks in the same order.
"""

from contextlib import contextmanager

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework_simplejwt.exceptions import TokenBackendError, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from quickportal.models import BlacklistedTokenReason, BlacklistReason


class InvalidRefreshToken(Exception):
    """The refresh token is missing, malformed, expired or not usable."""


class RefreshTokenReused(InvalidRefreshToken):
    """A blacklisted refresh token was presented again."""


def get_refresh_cookie(request):
    return request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE["name"])


def set_refresh_cookie(response, refresh_token):
    cookie = settings.REFRESH_TOKEN_COOKIE
    response.set_cookie(
        cookie["name"],
        refresh_token,
        max_age=cookie["max_age"],
        path=cookie["path"],
        secure=cookie["secure"],
        httponly=cookie["httponly"],
        samesite=cookie["samesite"],
    )


def clear_refresh_cookie(response):
    cookie = settings.REFRESH_TOKEN_COOKIE
    # Browsers only replace a cookie whose name, path and Secure flag match.
    response.set_cookie(
        cookie["name"],
        "",
        max_age=0,
        expires="Thu, 01 Jan 1970 00:00:00 GMT",
        path=cookie["path"],
        secure=cookie["secure"],
        httponly=cookie["httponly"],
        samesite=cookie["samesite"],
    )


def _record_reason(blacklisted, reason):
    """Store ``reason`` for ``blacklisted`` unless it already has one."""
    BlacklistedTokenReason.objects.get_or_create(
        token=blacklisted, defaults={"reason": reason}
    )


@contextmanager
def _user_transaction(user_id):
    """Open a transaction that holds the row lock of ``user_id``'s user.

    Lock order: the user row first, then ``OutstandingToken`` rows. Locking
    only the presented token is not enough: a rotation inserts its successor
    token before it commits, and a concurrent revocation of the same user would
    not see that row and leave it usable. Holding the user lock serializes
    rotation, logout and revocation per user, so a revocation only reads the
    user's tokens after every in-flight rotation has committed or rolled back.

    ``NO KEY UPDATE`` conflicts with itself but not with the ``KEY SHARE``
    lock that foreign key checks take, so logins that insert tokens for the
    user are not blocked. Nested use inside a transaction that already holds
    the lock is a no-op. With ``user_id`` ``None`` only the transaction opens.
    """
    with transaction.atomic():
        if user_id is not None:
            list(
                get_user_model()
                .objects.select_for_update(no_key=True)
                .filter(pk=user_id)
                .values_list("pk", flat=True)
            )
        yield


def revoke_user_tokens(user_id):
    """Blacklist every outstanding token of ``user_id`` as revoked."""
    with _user_transaction(user_id):
        pending_ids = list(
            OutstandingToken.objects.filter(
                user_id=user_id, blacklistedtoken__isnull=True
            ).values_list("id", flat=True)
        )
        if not pending_ids:
            return
        BlacklistedToken.objects.bulk_create(
            [BlacklistedToken(token_id=token_id) for token_id in pending_ids],
            ignore_conflicts=True,
        )
        # bulk_create with ignore_conflicts does not return primary keys.
        unexplained = BlacklistedToken.objects.filter(
            token_id__in=pending_ids, reason__isnull=True
        )
        BlacklistedTokenReason.objects.bulk_create(
            [
                BlacklistedTokenReason(token=entry, reason=BlacklistReason.REVOKED)
                for entry in unexplained
            ],
            ignore_conflicts=True,
        )


def _blacklist_reason(jti):
    """Return the blacklist reason of ``jti``, ``""`` if unknown, or ``None``.

    ``None`` means the token is not blacklisted. An empty string means it is
    blacklisted without a recorded reason (an entry created before reasons
    existed, or outside these helpers).
    """
    entry = (
        BlacklistedToken.objects.filter(token__jti=jti)
        .select_related("reason")
        .first()
    )
    if entry is None:
        return None
    try:
        return entry.reason.reason
    except BlacklistedTokenReason.DoesNotExist:
        return ""


def _lock_outstanding(jti):
    """Lock the outstanding row of ``jti`` until the transaction ends."""
    list(OutstandingToken.objects.select_for_update().filter(jti=jti))


def _verified_refresh_payload(raw_token):
    """Return the signed, unexpired refresh payload without the blacklist check."""
    try:
        payload = token_backend.decode(raw_token, verify=True)
    except TokenBackendError as exc:
        raise InvalidRefreshToken() from exc
    if payload.get(api_settings.TOKEN_TYPE_CLAIM) != RefreshToken.token_type:
        raise InvalidRefreshToken()
    if not payload.get(api_settings.JTI_CLAIM):
        raise InvalidRefreshToken()
    return payload


def rotate_refresh_token(raw_token):
    """Return ``{"access", "refresh"}`` for a valid refresh token.

    The user row and then the token row are locked while the token is checked
    and blacklisted, so two concurrent requests with the same token cannot both
    rotate it (the second one sees the token blacklisted by rotation and is
    treated as reuse), and a revocation waits for an in-flight rotation of the
    same user to commit, so it also blacklists the successor token.

    Raises ``RefreshTokenReused`` (after revoking every token of the user) when
    the token was already rotated, and ``InvalidRefreshToken`` for any other
    unusable token, including one blacklisted by logout or by a revocation.
    """
    if not raw_token:
        raise InvalidRefreshToken()

    payload = _verified_refresh_payload(raw_token)
    jti = payload[api_settings.JTI_CLAIM]
    user_id = payload.get(api_settings.USER_ID_CLAIM)

    with _user_transaction(user_id):
        _lock_outstanding(jti)
        reason = _blacklist_reason(jti)
        # A missing reason is treated as reuse so that unknown entries fail
        # closed, as every blacklisted token did before reasons were recorded.
        reused = reason in (BlacklistReason.ROTATED, "")
        if reused:
            # Revoke inside the transaction; the error is raised after commit.
            if user_id is not None:
                revoke_user_tokens(user_id)
        elif reason is not None:
            raise InvalidRefreshToken()
        else:
            serializer = TokenRefreshSerializer(data={"refresh": raw_token})
            try:
                serializer.is_valid(raise_exception=True)
            except (
                TokenError,
                AuthenticationFailed,
                ValidationError,
                ObjectDoesNotExist,
            ) as exc:
                raise InvalidRefreshToken() from exc
            # The serializer blacklisted the presented token while rotating.
            _record_reason(
                BlacklistedToken.objects.get(token__jti=jti), BlacklistReason.ROTATED
            )

    if reused:
        raise RefreshTokenReused()
    return serializer.validated_data


def blacklist_refresh_token(raw_token):
    """Blacklist ``raw_token`` as logged out; ignore invalid tokens.

    A token that is already blacklisted keeps its original reason, so logging
    out with a token that was rotated meanwhile does not hide a later reuse.
    """
    if not raw_token:
        return
    try:
        payload = _verified_refresh_payload(raw_token)
    except InvalidRefreshToken:
        return
    jti = payload[api_settings.JTI_CLAIM]

    with _user_transaction(payload.get(api_settings.USER_ID_CLAIM)):
        _lock_outstanding(jti)
        if _blacklist_reason(jti) is not None:
            return
        try:
            blacklisted, _ = RefreshToken(raw_token).blacklist()
        except TokenError:
            return
        _record_reason(blacklisted, BlacklistReason.LOGGED_OUT)
