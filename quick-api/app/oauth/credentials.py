"""Integration client IDs and secrets.

Secrets are high-entropy random values, so a single SHA-256 is enough to store
them; the password hasher (Argon2) is for low-entropy human passwords. Neither
the secret nor its digest is ever logged.
"""

import hashlib
import hmac
import secrets

CLIENT_ID_PREFIX = "quick_client_"
CLIENT_SECRET_PREFIX = "quick_api_"  # noqa: S105 (prefix, not a secret)
# token_urlsafe(32) is 43 characters; the bound keeps hashing work small.
MAX_CLIENT_ID_LENGTH = 64
MAX_CLIENT_SECRET_LENGTH = 128


def new_client_id() -> str:
    return CLIENT_ID_PREFIX + secrets.token_hex(16)


def new_client_secret() -> str:
    return CLIENT_SECRET_PREFIX + secrets.token_urlsafe(32)


def hash_client_secret(secret: str) -> str:
    """SHA-256 hex digest (64 characters)."""
    return hashlib.sha256(secret.encode()).hexdigest()


def verify_client_secret(secret: str, secret_hash: str | None) -> bool:
    """Constant-time comparison; False when no secret is stored.

    The digest is computed even without a stored hash, so unknown client IDs
    take about as long as wrong secrets.
    """
    digest = hash_client_secret(secret)
    if secret_hash is None:
        hmac.compare_digest(digest, digest)
        return False
    return hmac.compare_digest(digest, secret_hash)
