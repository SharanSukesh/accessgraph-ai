"""Serialise "replace all of an org's rows" writes.

Anomaly detection, risk scoring and recommendations each replace the org's
previous results. Their runs take minutes, so two can overlap (the sync's
own analysis and an "Analyze" click, say). Each run therefore deletes the
old rows and inserts its own in one transaction at the end, holding a
per-org, per-table lock: an overlapping run waits, then replaces the first
run's rows instead of adding to them.
"""
import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_for_replace(db: AsyncSession, org_id: str, table: str) -> None:
    """Postgres transaction-scoped advisory lock, released on commit or
    rollback. No-op on other databases (SQLite in tests is single-writer)."""
    conn = await db.connection()
    if conn.dialect.name != "postgresql":
        return
    key = int.from_bytes(hashlib.sha256(f"{table}:{org_id}".encode()).digest()[:8], "big", signed=True)
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
