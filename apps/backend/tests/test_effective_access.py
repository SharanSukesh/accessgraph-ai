"""
Test Effective Access Engine
"""
import pytest
from sqlalchemy import select

from app.domain.models import Organization, UserSnapshot
from app.ingestion.fixture_loader import FixtureLoader
from app.ingestion.snapshot import SnapshotPersister
from app.services.effective_access import EffectiveAccessService


@pytest.mark.asyncio
async def test_effective_access_computation(async_db_session):
    """Test computing effective access from fixtures"""
    db = async_db_session

    # Create org
    org = Organization(name="Test Org", is_demo=True)
    db.add(org)
    await db.commit()
    await db.refresh(org)

    # Load fixture data
    loader = FixtureLoader()
    data = loader.load()

    # Persist snapshots
    persister = SnapshotPersister(db)
    await persister.persist_all(org.id, data)

    # Get a user (Alice)
    result = await db.execute(
        select(UserSnapshot).where(
            UserSnapshot.organization_id == org.id,
            UserSnapshot.name == "Alice Johnson"
        )
    )
    alice = result.scalar_one()

    # Test object access
    service = EffectiveAccessService(db)
    obj_access = await service.get_user_object_access(org.id, alice.salesforce_id)

    assert obj_access["user_id"] == alice.salesforce_id
    assert len(obj_access["objects"]) > 0

    # Alice should have access to Opportunity (via PSG)
    opp_access = next(
        (obj for obj in obj_access["objects"] if obj["object"] == "Opportunity"),
        None
    )
    assert opp_access is not None
    assert opp_access["access"]["read"] == True

    # Test explanation
    explanation = await service.explain_user_object_access(
        org.id, alice.salesforce_id, "Opportunity"
    )

    assert explanation["user_id"] == alice.salesforce_id
    assert explanation["object"] == "Opportunity"
    assert len(explanation["paths"]) > 0

    # Should have path through PSG
    psg_path = next(
        (p for p in explanation["paths"] if "PSG" in p.get("source_name", "")),
        None
    )
    assert psg_path is not None


@pytest.mark.asyncio
async def test_field_access(async_db_session):
    """Test field-level access"""
    db = async_db_session

    # Create org and load data
    org = Organization(name="Test Org 2", is_demo=True)
    db.add(org)
    await db.commit()
    await db.refresh(org)

    loader = FixtureLoader()
    data = loader.load()

    persister = SnapshotPersister(db)
    await persister.persist_all(org.id, data)

    # Get Alice
    result = await db.execute(
        select(UserSnapshot).where(
            UserSnapshot.organization_id == org.id,
            UserSnapshot.name == "Alice Johnson"
        )
    )
    alice = result.scalar_one()

    # Test field access
    service = EffectiveAccessService(db)
    field_access = await service.get_user_field_access(org.id, alice.salesforce_id)

    assert field_access["user_id"] == alice.salesforce_id
    assert len(field_access["fields"]) > 0

    # Alice should have access to sensitive fields (part of anomaly)
    sensitive_fields = [
        f for f in field_access["fields"]
        if "SSN" in f["field"] or "AnnualRevenue" in f["field"]
    ]
    assert len(sensitive_fields) > 0
