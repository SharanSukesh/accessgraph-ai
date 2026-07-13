"""Password hashing + verification — direct `bcrypt` binding.

Uses the `bcrypt` library directly rather than passlib. passlib 1.7.4
(pinned in requirements.txt) is not compatible with bcrypt 4.x — it
fails to parse the newer bcrypt.__about__ layout and emits
"error reading bcrypt version" warnings, and hashing/verify calls
crash in Railway with the current versions. `bcrypt` itself is stable,
maintained, and has a tiny stable API — no need for the passlib layer.

Cost factor 12 is bcrypt's default and appropriate for a gated internal
tool: ~250ms per hash on modern hardware, slow enough to blunt online
brute force but fast enough to not brick concurrent logins.
"""
from __future__ import annotations

import bcrypt


BCRYPT_ROUNDS = 12


def hash_password(plaintext: str) -> str:
    """Bcrypt-hash a plaintext password. Never store the plaintext."""
    if not plaintext:
        raise ValueError("password may not be empty")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(plaintext.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plaintext: str, hashed: str) -> bool:
    """Constant-time compare of a plaintext against the stored hash.
    Returns False on empty inputs or on any bcrypt error rather than
    raising, so callers can treat "no password set yet" (activation
    not completed) as a normal failed-login case."""
    if not plaintext or not hashed:
        return False
    try:
        return bcrypt.checkpw(
            plaintext.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except Exception:
        return False
