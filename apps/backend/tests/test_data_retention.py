from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    Organization,
    OrgUser,
    OrgUserRole,
    SalesforceConnection,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.services.data_retention import (
    RETENTION_CLASSES,
    DataRetentionService,
    ErasureRefused,
    org_scoped_tables,
)


def test_every_org_scoped_table_has_a_retention_class():
    classified = set().union(*RETENTION_CLASSES.values())
    unclassified = {t.name for t in org_scoped_tables()} - classified
    assert not unclassified, f"Assign a retention class in data_retention.py: {sorted(unclassified)}"


def test_retention_classes_are_disjoint():
    seen = {}
    for name, tables in RETENTION_CLASSES.items():
        for t in tables:
            assert t not in seen, f"{t} is in both {seen[t]} and {name}"
            seen[t] = name


async def _client_org(db):
    org = Organization(name="Client", is_demo=False)
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.COMPLETED)
    db.add(job)
    db.add(SalesforceConnection(
        organization_id=org.id, instance_url="https://x.my.salesforce.com",
        organization_id_sf="00Dxx", access_token=None, refresh_token=None, is_active=True,
    ))
    for i in range(3):
        db.add(UserSnapshot(
            organization_id=org.id, salesforce_id=f"005{i}", username=f"u{i}@x", name=f"U{i}",
            is_active=True,
        ))
    await db.commit()
    return org


@pytest.mark.asyncio
async def test_erasure_leaves_nothing_behind(async_db_session):
    db = async_db_session
    org = await _client_org(db)

    result = await DataRetentionService(db).delete_all_org_data(org.id)

    assert result["deleted_counts"]["users_snapshot"] == 3
    for table in org_scoped_tables():
        remaining = (await db.execute(
            select(func.count()).select_from(table).where(table.c.organization_id == org.id)
        )).scalar_one()
        assert remaining == 0, table.name
    assert await db.get(Organization, org.id) is None


@pytest.mark.asyncio
async def test_erasure_refuses_operator_org(async_db_session):
    db = async_db_session
    home = Organization(id="system-org", name="Firm", is_demo=False)
    db.add(home)
    await db.flush()
    db.add(OrgUser(organization_id=home.id, email="a@firm.test", role=OrgUserRole.ORG_ADMIN))
    await db.commit()

    with pytest.raises(ErasureRefused):
        await DataRetentionService(db).delete_all_org_data(home.id)


@pytest.mark.asyncio
async def test_cleanup_purges_only_stale_rows(async_db_session):
    db = async_db_session
    org = await _client_org(db)
    old = datetime.now(timezone.utc) - timedelta(days=200)
    await db.execute(
        update(UserSnapshot)
        .where(UserSnapshot.salesforce_id == "0050")
        .values(updated_at=old)
    )
    db.add(AccessAnomaly(
        organization_id=org.id, user_id="0051", anomaly_score=0.9,
        severity=AnomalySeverity.HIGH, detected_at=old, created_at=old,
    ))
    await db.commit()

    results = await DataRetentionService(db).cleanup_all_old_data(org.id)

    assert results["salesforce_mirror"] == {"users_snapshot": 1}
    remaining = (await db.execute(
        select(func.count()).select_from(UserSnapshot).where(UserSnapshot.organization_id == org.id)
    )).scalar_one()
    assert remaining == 2
    assert results["sync_jobs"] == 0


@pytest.mark.asyncio
async def test_inventory_reports_every_category(async_db_session):
    db = async_db_session
    org = await _client_org(db)

    inv = await DataRetentionService(db).get_data_inventory(org.id)

    assert "unclassified" not in inv["categories"]
    assert inv["categories"]["salesforce_mirror"]["users_snapshot"] == 3
    assert inv["total_records"] >= 5


def test_record_ids_are_stored_hashed():
    from app.domain.models import AccountShareSnapshot

    row = AccountShareSnapshot(organization_id="o", account_id="001000000000001AAA")
    assert row.account_id.startswith("r_")
    assert len(row.account_id) == 18
    assert "001000000000001" not in row.account_id
    again = AccountShareSnapshot(organization_id="o", account_id="001000000000001")
    assert again.account_id == row.account_id
