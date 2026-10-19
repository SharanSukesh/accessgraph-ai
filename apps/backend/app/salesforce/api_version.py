"""The one Salesforce API version setting.

Newton targets API v68.0 (Winter '27). Each org gets the lower of that and
the newest version it serves, read once from `GET /services/data/`
(Salesforce's list of supported versions) and cached per instance: during
a release weekend an org still on the previous release would reject a v68
call. The REST and Tooling client, the Metadata API client and the role
design export (package.xml) all read the version from here.
"""
from __future__ import annotations

import logging
import time
from typing import Dict, Iterable, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

TARGET = "68.0"
CACHE_SECONDS = 6 * 3600
_cache: Dict[str, Tuple[str, float]] = {}


def _num(v: str) -> float:
    try:
        return float(v.lstrip("v"))
    except ValueError:
        return 0.0


def choose(supported: Iterable[str], target: str = TARGET) -> str:
    """The newest supported version that isn't above the target; the target
    when the list is empty or every version is newer (it's then served)."""
    eligible = [v for v in supported if 0 < _num(v) <= _num(target)]
    return max(eligible, key=_num) if eligible else target


def cached(instance_url: str) -> str:
    hit = _cache.get(instance_url.rstrip("/"))
    return hit[0] if hit and hit[1] > time.monotonic() else TARGET


async def negotiate(instance_url: str, headers: Optional[Dict[str, str]] = None) -> str:
    """The version to use for this org (cached). Falls back to the target
    when the list can't be read."""
    key = instance_url.rstrip("/")
    hit = _cache.get(key)
    if hit and hit[1] > time.monotonic():
        return hit[0]
    version = TARGET
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{key}/services/data/", headers=headers or {})
            resp.raise_for_status()
            version = choose([str(r.get("version", "")) for r in resp.json() if isinstance(r, dict)])
    except Exception as e:  # noqa: BLE001
        logger.info("API version list unavailable for %s (%s); using %s", key, e, TARGET)
    _cache[key] = (version, time.monotonic() + CACHE_SECONDS)
    return version
