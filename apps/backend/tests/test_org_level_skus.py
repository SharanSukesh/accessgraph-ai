"""Marketing Cloud and Account Engagement (Pardot) are org-level
subscriptions: never priced per seat, and an unused one is a finding only
when the consultant has entered its price."""
import pytest
from sqlalchemy import select

from app.domain.models import LicensePriceBook, OrgFinding
from app.services.org_analyzer import (
    OrgAnalyzerService,
    _is_org_level_sku,
    _lookup_default_price,
)
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

LABEL = "Marketing Cloud Account Engagement"


def test_org_level_skus_have_no_per_seat_price():
    for label in ("Pardot", "Pardot Growth", LABEL, "Marketing Cloud", "marketing cloud engagement"):
        assert _is_org_level_sku(label)
        assert _lookup_default_price(label) is None
        assert OrgAnalyzerService._price_for_label(label, {label: 125000}) == 0
    assert not _is_org_level_sku("Sales Cloud")
    assert _lookup_default_price("Sales Cloud") == 19500


async def _findings(db, org_id):
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    return snap, rows


@pytest.mark.asyncio
async def test_unpriced_subscription_adds_no_finding_and_keeps_lumenvale_numbers(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    snap, rows = await _findings(db, org_id)

    assert not [f for f in rows if LABEL in (f.title or "")]
    # The runbook's Health Report numbers are unchanged by the new licence row.
    assert len(rows) == 12
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000


@pytest.mark.asyncio
async def test_unused_subscription_is_priced_once_per_org_from_the_price_book(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    db.add(LicensePriceBook(organization_id=org_id, license_name=LABEL, monthly_cost_cents=125000, is_billed=True))
    await db.commit()

    _, rows = await _findings(db, org_id)
    sub = [f for f in rows if f.code == "ORG_SUBSCRIPTION_UNUSED"]
    assert len(sub) == 1
    # $1,250 a month for the org, not x 10 licences.
    assert sub[0].estimated_annual_savings_cents == 125000 * 12
    assert sub[0].evidence["pricing"] == "per org"
    assert not [f for f in rows if f.code in ("PSL_SEATS_UNUSED", "LICENSE_SEATS_UNUSED") and LABEL in f.title]
