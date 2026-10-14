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
from dataclasses import dataclass
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Organization
from app.ingestion.fixture_loader import FIXTURES_DIR
from app.salesforce.demo_client import DemoSalesforceClient


@dataclass(frozen=True)
class DemoFixture:
    file: str
    org_name: str
    description: str


DEMO_FIXTURES: Dict[str, DemoFixture] = {
    "synthetic_mid_market": DemoFixture(
        file="synthetic_mid_market.json",
        org_name="Lumenvale Systems (Demo)",
        description="Synthetic mid-market org: 400 users, planted access risks, licence data.",
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


def load_fixture(key: str) -> Dict[str, Any]:
    with open(FIXTURES_DIR / DEMO_FIXTURES[key].file) as f:
        return json.load(f)


async def demo_client_for(db: AsyncSession, org_id: str) -> Optional[DemoSalesforceClient]:
    """The fixture-backed client for a demo org; None for a real org."""
    org = await db.get(Organization, org_id)
    if org is None or not org.is_demo:
        return None
    return DemoSalesforceClient(load_fixture(fixture_key(org)).get("demo_live", {}))


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
