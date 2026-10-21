"""Demo orgs: Organization rows with is_demo=True whose data comes from a
committed fixture, never from Salesforce.

A demo org has no Salesforce connection. Sync persists the fixture; the
Health Report and License Fit read their few live facts (licences, edition,
limits, record ownership) from the fixture's "demo_live" section through
DemoSalesforceClient. Modules that need live record data (Data Quality,
the sprawl modules, Change Risk) refuse demo orgs with a plain message,
and so does every Salesforce write.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Organization
from app.ingestion.fixture_loader import FIXTURES_DIR
from app.salesforce.demo_client import DemoSalesforceClient


@dataclass(frozen=True)
class DemoFixture:
    file: str
    org_name: str
    description: str
    # When set, the fixture's dates are as of this moment, and a demo sync
    # moves them so that "now" is that moment: every "days since" (last
    # login, last test run, API usage days, record ages) stays the same, and
    # so do the numbers a runbook quotes. See shift_dates().
    anchor: Optional[str] = None


DEMO_FIXTURES: Dict[str, DemoFixture] = {
    "synthetic_mid_market": DemoFixture(
        file="synthetic_mid_market.json",
        org_name="Lumenvale Systems (Demo)",
        description="Synthetic mid-market org: 400 users, planted access risks, licence data.",
        # Health 41, 18 findings, $183,180; License Fit $116,220 held at this moment.
        anchor="2026-10-19T22:00:00+00:00",
    ),
    "acme": DemoFixture(
        file="demo_org.json",
        org_name="Acme Corp (Demo)",
        description="Small hand-built org: 8 users.",
    ),
}
# Demo orgs created before fixtures were selectable were seeded from demo_org.json.
LEGACY_FIXTURE = "acme"


class DemoOrgUnsupported(PermissionError):
    """Raised when a live-only module or a Salesforce write targets a demo org.
    A PermissionError, so the write-back routes answer 403 with this message."""


def fixture_key(org: Organization) -> str:
    key = (org.settings or {}).get("demo_fixture")
    return key if key in DEMO_FIXTURES else LEGACY_FIXTURE


def merge_fixture_part(base: Dict[str, Any], part: Dict[str, Any]) -> Dict[str, Any]:
    """Deep-merge a fixture part into the base, in place: dicts merge key by
    key, lists are appended to, anything else is replaced. A "_patch" key
    updates existing list rows by Id: {"users": [{"Id": ..., "UserRoleId": ...}]}
    sets those fields on the matching row (an unknown Id is an error)."""
    for list_name, rows in (part.get("_patch") or {}).items():
        by_id = {row.get("Id"): row for row in base.get(list_name, [])}
        for change in rows:
            if change["Id"] not in by_id:
                raise KeyError(f"fixture patch: no {list_name} row with Id {change['Id']}")
            by_id[change["Id"]].update({k: v for k, v in change.items() if k != "Id"})
    for key, value in part.items():
        if key == "_patch":
            continue
        current = base.get(key)
        if isinstance(current, dict) and isinstance(value, dict):
            merge_fixture_part(current, value)
        elif isinstance(current, list) and isinstance(value, list):
            current.extend(value)
        else:
            base[key] = value
    return base


def fixture_part_files(key: str) -> List[Path]:
    """Extra demo data for a fixture, one file per feature, in
    fixtures/<fixture name>.parts/*.json (applied in name order). Keeps each
    feature's demo data out of the large generated fixture file."""
    parts_dir = FIXTURES_DIR / f"{Path(DEMO_FIXTURES[key].file).stem}.parts"
    return sorted(parts_dir.glob("*.json")) if parts_dir.is_dir() else []


_DATETIME = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _shift_value(value: str, delta: timedelta) -> str:
    m = _DATETIME.match(value)
    if m:
        moved = datetime.fromisoformat(m.group(1)) + delta
        return moved.strftime("%Y-%m-%dT%H:%M:%S") + (m.group(2) or "") + (m.group(3) or "")
    if _DATE.match(value):
        return (date.fromisoformat(value) + timedelta(days=round(delta.total_seconds() / 86400))).isoformat()
    return value


def shift_dates(data: Any, delta: timedelta) -> Any:
    """Move every ISO date and timestamp in the data (values, and dict keys
    that are dates) by delta, keeping each one's format and time zone."""
    if isinstance(data, dict):
        return {(_shift_value(k, delta) if isinstance(k, str) else k): shift_dates(v, delta) for k, v in data.items()}
    if isinstance(data, list):
        return [shift_dates(v, delta) for v in data]
    if isinstance(data, str):
        return _shift_value(data, delta)
    return data


def load_demo_data(key: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    """The fixture as a demo sync uses it: with an anchor, its dates are
    moved so that now is the anchor moment (see DemoFixture.anchor)."""
    data = load_fixture(key)
    anchor = DEMO_FIXTURES[key].anchor
    if not anchor:
        return data
    delta = (now or datetime.now(timezone.utc)) - datetime.fromisoformat(anchor)
    return shift_dates(data, delta)


def load_fixture(key: str) -> Dict[str, Any]:
    with open(FIXTURES_DIR / DEMO_FIXTURES[key].file) as f:
        data = json.load(f)
    for path in fixture_part_files(key):
        with open(path) as f:
            part = json.load(f)
        part.pop("_source", None)  # provenance note, not data
        merge_fixture_part(data, part)
    return data


async def demo_client_for(db: AsyncSession, org_id: str) -> Optional[DemoSalesforceClient]:
    """The fixture-backed client for a demo org; None for a real org."""
    org = await db.get(Organization, org_id)
    if org is None or not org.is_demo:
        return None
    return DemoSalesforceClient(load_demo_data(fixture_key(org)).get("demo_live", {}))


async def demo_data_quality_client(db: AsyncSession, org_id: str):
    """For a demo org, a client serving the fixture's Data Quality data
    (demo_live.data_quality); None for a real org."""
    org = await db.get(Organization, org_id)
    if org is None or not org.is_demo:
        return None
    from app.salesforce.demo_client import DemoDataQualityClient
    live = load_demo_data(fixture_key(org)).get("demo_live", {})
    client = DemoDataQualityClient(live.get("data_quality", {}))
    client.record_visibility = live.get("record_coverage", {"checked": False})
    return client


async def ensure_live_org(db: AsyncSession, org_id: str, module: str) -> None:
    """Refuse a demo org for modules that need a live Salesforce connection."""
    org = await db.get(Organization, org_id)
    if org is not None and org.is_demo:
        raise DemoOrgUnsupported(
            f"{module} needs a live Salesforce connection, so it isn't available "
            "for a demo org. This org's data is synthetic."
        )


async def refuse_demo_org(db: AsyncSession, org_id: str, module: str) -> None:
    """Route guard: HTTP 409 with the demo-org message."""
    from fastapi import HTTPException

    try:
        await ensure_live_org(db, org_id, module)
    except DemoOrgUnsupported as exc:
        raise HTTPException(status_code=409, detail=str(exc))
