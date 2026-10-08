"""Keyed hashing for business-record ids.

Newton reads share and team rows to understand record-level access, but
promises not to keep identifiers of customer records. Account and
Opportunity ids are replaced with an HMAC before they are stored: still
stable across syncs (so joins and distinct counts work), but not
reversible to a Salesforce record without the server key.
"""
import hashlib
import hmac

from app.core.config import settings

PREFIX = "r_"
_LENGTH = 18


def _key() -> bytes:
    secret = (settings.JWT_SECRET_KEY or "local-dev-only-jwt-secret").encode()
    return hashlib.sha256(b"newton-record-id:" + secret).digest()


def pseudonymize_record_id(record_id: str) -> str:
    if not record_id or record_id.startswith(PREFIX):
        return record_id
    digest = hmac.new(_key(), record_id[:15].encode(), hashlib.sha256).hexdigest()
    return PREFIX + digest[: _LENGTH - len(PREFIX)]
