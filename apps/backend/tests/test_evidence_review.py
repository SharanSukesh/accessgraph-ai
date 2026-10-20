"""Evidence on every item (20), reviews and the validation report (10)."""
import pytest
from sqlalchemy import select

from app.domain.models import (AccessAnomaly, ItemReview, Organization, OrgAccessGrant, OrgFinding, OrgUser, OrgUserRole,
                               Recommendation)
from app.services import privacy_mode
from app.services.org_analyzer import OrgAnalyzerService
from app.services.privacy_purge import enforce_privacy_mode
from tests.test_demo_orgs import _cookie, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


async def _first(db, model, org_id, *where):
    return (await db.execute(select(model).where(model.organization_id == org_id, *where).limit(1))).scalars().first()


@pytest.mark.asyncio
async def test_evidence_blocks(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    seats = await _first(db, OrgFinding, org_id, OrgFinding.code == "LICENSE_SEATS_UNUSED")
    ev = (await client.get(f"/orgs/{org_id}/evidence/finding/{seats.id}", cookies=cookie)).json()["evidence"]
    assert ev["source"].startswith("UserLicense") and ev["confidence"] == "confirmed"
    assert ev["snapshot"]["label"] == "Today" and ev["methodology"].startswith("Health Report rules")
    assert ev["permission"] == {"needed": "View Setup and Configuration (read)", "had": True}
    dormant = await _first(db, OrgFinding, org_id, OrgFinding.category == "license_waste")
    dev = (await client.get(f"/orgs/{org_id}/evidence/finding/{dormant.id}", cookies=cookie)).json()["evidence"]
    assert any(c.endswith("active users scored") for c in dev["coverage"])

    anomaly = await _first(db, AccessAnomaly, org_id)
    aev = (await client.get(f"/orgs/{org_id}/evidence/anomaly/{anomaly.id}", cookies=cookie)).json()["evidence"]
    assert aev["confidence"] == "inferred" and "peers" in aev["source"] and "not a probability" in aev["methodology"]
    rec = await _first(db, Recommendation, org_id)
    rev = (await client.get(f"/orgs/{org_id}/evidence/recommendation/{rec.id}", cookies=cookie)).json()
    assert rev["evidence"]["methodology"].startswith("Priority Actions") and rev["review"] is None
    assert (await client.get(f"/orgs/{org_id}/evidence/nope/{rec.id}", cookies=cookie)).status_code == 400


@pytest.mark.asyncio
async def test_reviews_survive_a_rerun_and_follow_privacy(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    finding = await _first(db, OrgFinding, org_id, OrgFinding.code == "LICENSE_SEATS_UNUSED")
    r = await client.put(f"/orgs/{org_id}/reviews", json={"kind": "finding", "item_id": finding.id, "status": "useful",
                                                          "reason": "Client confirmed the seats are spare"}, cookies=cookie)
    assert r.status_code == 200 and r.json()["review"]["isDemo"] is True
    assert (await client.put(f"/orgs/{org_id}/reviews", json={"kind": "finding", "item_id": finding.id, "status": "great"},
                             cookies=cookie)).status_code == 400
    viewer = OrgUser(organization_id="system-org", email="viewer@firm.test", role=OrgUserRole.VIEWER, password_hash="x",
                     is_active=True, is_email_verified=True)
    db.add(viewer)
    await db.flush()
    db.add(OrgAccessGrant(org_user_id=viewer.id, organization_id=org_id))
    await db.commit()
    assert (await client.put(f"/orgs/{org_id}/reviews", json={"kind": "finding", "item_id": finding.id, "status": "useful"},
                             cookies=_cookie(viewer))).status_code == 403

    # The Health Report runs again: new finding rows, the same review.
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    again = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id,
                                                       OrgFinding.code == "LICENSE_SEATS_UNUSED"))).scalars().first()
    assert again.id != finding.id
    review = (await client.get(f"/orgs/{org_id}/evidence/finding/{again.id}", cookies=cookie)).json()["review"]
    assert review["status"] == "useful" and review["reviewer"] == "admin@firm.test"

    # A reviewer's note that names someone is masked with the people; anomaly reviews go at Metadata only.
    anomaly = await _first(db, AccessAnomaly, org_id)
    from app.domain.models import UserSnapshot
    person = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id,
                                                          UserSnapshot.salesforce_id == anomaly.user_id))).scalar_one()
    real_name = person.name  # the purge aliases the row in this session
    await client.put(f"/orgs/{org_id}/reviews", json={"kind": "anomaly", "item_id": anomaly.id, "status": "not_useful",
                                                      "reason": f"Spoke to {real_name}: expected for the role"}, cookies=cookie)
    org = await db.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.MASKED, False, "test")
    await enforce_privacy_mode(db, org)
    await db.commit()
    row = (await db.execute(select(ItemReview).where(ItemReview.item_type == "anomaly"))).scalar_one()
    assert real_name not in row.reason and "User " in row.reason
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await enforce_privacy_mode(db, org)
    await db.commit()
    kinds = set((await db.execute(select(ItemReview.item_type).where(ItemReview.organization_id == org_id))).scalars())
    assert kinds == {"finding"}


@pytest.mark.asyncio
async def test_validation_counts_never_one_score(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    demo = (await client.get(f"/orgs/{org_id}/validation", cookies=cookie)).json()
    assert demo["isDemo"] is True and demo["overall"]["reviewed"] == 0

    org = Organization(name="Client Co", is_demo=False)
    db.add(org)
    await db.flush()
    admin = (await db.execute(select(OrgUser).where(OrgUser.email == "admin@firm.test"))).scalar_one()
    rows = [("Health Report", "license_waste", "useful"), ("Health Report", "license_waste", "useful"),
            ("Health Report", "config_bloat", "not_useful"), ("Access anomalies", "permission_accumulation", "useful"),
            ("Access anomalies", "permission_accumulation", "expected"), ("Priority Actions", "psg_migration", "not_useful")]
    for i, (module, group, status) in enumerate(rows):
        db.add(ItemReview(organization_id=org.id, item_type="finding", item_key=f"k{i}", module=module, group=group,
                          status=status, reviewer="admin@firm.test", title=f"Item {i}"))
    await db.commit()
    v = (await client.get(f"/orgs/{org.id}/validation", cookies=_cookie(admin))).json()
    assert v["title"].startswith("Validation: Client Co, ") and v["isDemo"] is False
    assert v["overall"] == {"reviewed": 6, "useful": 3, "notUseful": 2, "expected": 1, "precision": 0.6}
    by = {m["module"]: m for m in v["byModule"]}
    assert by["Health Report"]["precision"] == round(2 / 3, 3) and by["Priority Actions"]["precision"] == 0.0
    assert by["Access anomalies"] == {"module": "Access anomalies", "reviewed": 2, "useful": 1, "notUseful": 0,
                                      "expected": 1, "precision": 1.0}
    assert {t["type"] for t in v["byType"]} >= {"Health Report · license_waste", "Access anomalies · permission_accumulation"}
