"""Password hashing + verification.

Thin wrapper around passlib's bcrypt so callers don't need to think
about scheme selection or configure their own context. Backed by the
`passlib[bcrypt]` dep already pinned in requirements.txt.

Bcrypt cost factor 12 is the passlib default and appropriate for a
gated internal tool — ~250ms per hash on modern hardware, which is
slow enough to blunt online brute force but fast enough to not brick
concurrent login attempts.
"""
from __future__ import annotations

from passlib.context import CryptContext


# Single shared context. bcrypt is the only scheme; older schemes are
# not accepted for verification because there's no legacy data.
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plaintext: str) -> str:
    """Bcrypt-hash a plaintext password. Never store the plaintext."""
    if not plaintext:
        raise ValueError("password may not be empty")
    return _pwd_ctx.hash(plaintext)


def verify_password(plaintext: str, hashed: str) -> bool:
    """Constant-time compare of a plaintext against the stored hash.
    Returns False on empty inputs rather than raising, so callers can
    treat "no password set yet" (activation not completed) as a normal
    failed-login case."""
    if not plaintext or not hashed:
        return False
    try:
        return _pwd_ctx.verify(plaintext, hashed)
    except Exception:
        return False
