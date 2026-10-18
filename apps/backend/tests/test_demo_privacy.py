"""A demo org's sync applies its privacy level like a live pull, so Masked
and Metadata only can be shown on Lumenvale."""
import re

import pytest
from sqlalchemy import func, select

from app.domain.models import (
    AccessAnomaly, Organization, RoleSnapshot, SyncJob, SyncStatus, UserSnapshot,
)
from app.ingestion.orchestrator import SyncOrchestrator
from app.services import privacy_mode

ALIAS = re.compile(r"^User [0-9A-F]{6}$")


async def _sync_demo(db, mode, aggregates=False):
    org = Organization(name="Lumenvale Systems (Demo)", is_demo=True,
                       settings={"demo_fixture": "synthetic_mid_market",
                                 "privacy": {"mode": mode, "allow_record_aggregates": aggregates}})
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    await SyncOrchestrator(db).run_sync(org.id, job.id)
    return org


async def _count(db, model, org_id):
    return (await db.execute(select(func.count()).select_from(model).where(model.organization_id == org_id))).scalar()


@pytest.mark.asyncio
async def test_masked_demo_sync_stores_aliases_only(async_db_session):
    db = async_db_session
    org = await _sync_demo(db, privacy_mode.MASKED)
    users = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org.id))).scalars().all()
    assert len(users) == 400
    assert all(ALIAS.match(u.name) for u in users) and all(u.email is None for u in users)
    mina = next(u for u in users if u.salesforce_id == "005000000000001DMO")
    assert mina.name == privacy_mode.user_alias(org.id, "005000000000001DMO")
    assert "Mina Tanaka" not in repr([(u.name, u.username, u.raw_data) for u in users])
    # The analysis still runs on aliased users.
    assert await _count(db, AccessAnomaly, org.id) > 0


@pytest.mark.asyncio
async def test_metadata_only_demo_sync_keeps_no_users(async_db_session):
    db = async_db_session
    org = await _sync_demo(db, privacy_mode.METADATA_ONLY)
    assert await _count(db, UserSnapshot, org.id) == 0
    assert await _count(db, RoleSnapshot, org.id) == 33  # configuration still loads


def test_full_level_leaves_demo_data_alone():
    from types import SimpleNamespace as NS
    from app.ingestion.orchestrator import apply_privacy_to_demo_data
    data = {"users": [{"Id": "005A", "Name": "Jo"}], "account_shares": [{"Id": "x"}], "record_owner_counts": {"Account": {}}}
    org = NS(id="o", settings={"privacy": {"mode": "full"}})
    assert apply_privacy_to_demo_data(org, data) == data
    org.settings = {"privacy": {"mode": "masked"}}
    out = apply_privacy_to_demo_data(org, data)
    assert out["users"][0]["Name"] == privacy_mode.user_alias("o", "005A") and out["account_shares"] == [{"Id": "x"}]
