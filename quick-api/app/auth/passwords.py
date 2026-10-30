"""Password hashing (Argon2 via pwdlib)."""

from functools import cache

from pwdlib import PasswordHash

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


@cache
def _dummy_hash() -> str:
    return _password_hash.hash("dummy password for timing")


def verify_dummy(password: str) -> None:
    """Spends the same time as a real verify, for logins with an unknown email."""
    _password_hash.verify(password, _dummy_hash())
