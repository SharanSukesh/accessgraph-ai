"""
Custom SQLAlchemy TypeDecorators for the AccessGraph backend.

Provides EncryptedString - an AES-256 encrypted Text column that forces
string-typed binding to avoid the asyncpg/sqlalchemy_utils interaction
that produces bytea-hex corruption.
"""
import logging
from typing import Optional

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

logger = logging.getLogger(__name__)


class EncryptedString(TypeDecorator):
    """
    AES-256 encrypted Text column with explicit string binding.

    Why not use sqlalchemy_utils.StringEncryptedType directly: that class
    has `impl = String` at the class level and tries to override `self.impl
    = Text` in __init__. SQLAlchemy 2.0's TypeDecorator caching uses the
    class-level impl for parameter binding decisions, which causes asyncpg
    to coerce the encrypted output bytes-into-text-column resulting in
    PostgreSQL bytea-hex format storage that won't decrypt back.

    This wrapper has impl = Text at the class level (no override needed),
    explicitly forces str() on the encrypted output, and includes recovery
    logic for previously-corrupted bytea-hex data.
    """

    impl = Text
    cache_ok = True

    def __init__(self, key: str, padding_mechanism: str = "pkcs5", **kwargs):
        super().__init__(**kwargs)
        self._key = key
        self._padding_mechanism = padding_mechanism
        # Engine is created lazily and re-initialized per-call to avoid
        # threading issues across async requests.

    def _new_engine(self) -> AesEngine:
        engine = AesEngine()
        engine._set_padding_mechanism(self._padding_mechanism)
        engine._update_key(self._key)
        return engine

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:
        """Encrypt plaintext string -> base64 ciphertext string for storage."""
        if value is None:
            return None
        if not isinstance(value, str):
            value = str(value)
        engine = self._new_engine()
        encrypted = engine.encrypt(value)
        # Force string output - the key defense against asyncpg bytes coercion
        if isinstance(encrypted, bytes):
            encrypted = encrypted.decode("ascii")
        return str(encrypted)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:
        """Decrypt base64 ciphertext from storage -> plaintext string."""
        if value is None:
            return None

        # Recovery path: handle data corrupted by the old StringEncryptedType
        # bug (stored as PostgreSQL bytea-hex format like '\x666f6f...').
        # Decode hex back to the underlying ASCII base64 string before decrypt.
        if isinstance(value, str) and value.startswith("\\x"):
            try:
                hex_str = value[2:]
                value = bytes.fromhex(hex_str).decode("ascii")
                logger.debug("Recovered bytea-hex stored token via hex decode")
            except Exception as e:
                logger.warning(f"Failed bytea-hex recovery: {e}")

        engine = self._new_engine()
        try:
            decrypted = engine.decrypt(value)
            if isinstance(decrypted, bytes):
                decrypted = decrypted.decode("utf-8")
            return decrypted
        except Exception as e:
            # Don't crash on decrypt failure - log and return None so the
            # caller's "if not access_token" guard kicks in cleanly.
            logger.error(f"Failed to decrypt stored value: {e}")
            return None
