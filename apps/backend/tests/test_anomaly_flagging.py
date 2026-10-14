"""Who the access-anomaly detector flags, and that every flag is explained.

The flagged set is exactly the top k = max(1, int(2% of active users)) by
ensemble score. A top-k user is never dropped for lacking a matching reason
template or for having no role/profile peers.
"""
import json
from pathlib import Path

import numpy as np
import pytest

import app.services.anomaly_detection as ad
from app.domain.models import (
    ObjectPermissionSnapshot,
    Organization,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)
from app.ingestion.snapshot import SnapshotPersister
from app.services.anomaly_detection import DEFAULT_ANOMALY_FRACTION, AnomalyDetectionService

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _k(n_users: int) -> int:
    return max(1, int(n_users * DEFAULT_ANOMALY_FRACTION))


async def _load_fixture(db, name: str) -> tuple:
    data = json.loads((FIXTURES / name).read_text())
    org = Organization(name=name, is_demo=True)
    db.add(org)
    await db.commit()
    await SnapshotPersister(db).persist_all(org.id, data)
    active = sum(1 for u in data["users"] if u.get("IsActive"))
    return org.id, active


@pytest.mark.asyncio
@pytest.mark.parametrize("fixture", ["demo_org.json", "synthetic_mid_market.json"])
async def test_flagged_count_is_exactly_top_k(async_db_session, fixture):
    org_id, active = await _load_fixture(async_db_session, fixture)
    anomalies = await AnomalyDetectionService(async_db_session).detect_anomalies(org_id)

    assert len(anomalies) == _k(active)
    assert all(a.reasons for a in anomalies)
    assert [a.peer_stats["rank"] for a in anomalies] == list(range(1, len(anomalies) + 1))


async def _uniform_org(db, *, admin_profile: bool) -> str:
    """Ten users with identical access. With admin_profile, user 005u0 is
    alone on its profile and role and can also delete three objects."""
    org = Organization(name="uniform", is_demo=True)
    db.add(org)
    await db.flush()
    o = org.id
    rows = []
    for pid, ps_id in (("00eStd", "0PSstd"), ("00eAdm", "0PSadm")):
        rows += [
            ProfileSnapshot(organization_id=o, salesforce_id=pid, name=pid),
            PermissionSetSnapshot(organization_id=o, salesforce_id=ps_id, name=f"X{pid}", label=pid,
                                  is_owned_by_profile=True, profile_id=pid),
            ObjectPermissionSnapshot(organization_id=o, salesforce_id=f"110{ps_id}", parent_id=ps_id,
                                     sobject_type="Account", permissions_read=True),
        ]
    if admin_profile:
        rows += [
            ObjectPermissionSnapshot(organization_id=o, salesforce_id=f"110adm{obj}", parent_id="0PSadm",
                                     sobject_type=obj, permissions_read=True, permissions_delete=True)
            for obj in ("Contact", "Lead", "Opportunity")
        ]
    for i in range(10):
        alone = admin_profile and i == 0
        rows.append(UserSnapshot(organization_id=o, salesforce_id=f"005u{i}", username=f"u{i}@x", name=f"U{i}",
                                 is_active=True, department="Sales",
                                 profile_id="00eAdm" if alone else "00eStd",
                                 user_role_id="00Eadm" if alone else "00Erep"))
    db.add_all(rows)
    await db.commit()
    return o


def _rank_user_first(monkeypatch, sf_id: str):
    """Make the ensemble rank one user first, whatever the features say."""
    original = AnomalyDetectionService._extract_user_features
    order = []

    async def capture(self, org_id, user, **kwargs):
        order.append(user.salesforce_id)
        return await original(self, org_id, user, **kwargs)

    def score(self, X):
        return np.array([1.0 if uid == sf_id else 0.0 for uid in order])

    monkeypatch.setattr(AnomalyDetectionService, "_extract_user_features", capture)
    monkeypatch.setattr(ad._MahalanobisGMMAvgDetector, "fit", lambda self, X: None)
    monkeypatch.setattr(ad._MahalanobisGMMAvgDetector, "score", score)


@pytest.mark.asyncio
async def test_top_k_user_with_no_matching_template_is_still_flagged(async_db_session, monkeypatch):
    org_id = await _uniform_org(async_db_session, admin_profile=False)
    _rank_user_first(monkeypatch, "005u3")

    anomalies = await AnomalyDetectionService(async_db_session).detect_anomalies(org_id)

    assert [a.user_id for a in anomalies] == ["005u3"]
    assert len(anomalies[0].reasons) == 1
    assert anomalies[0].reasons[0].startswith("Ranked #1 of 10 users by the anomaly model")


@pytest.mark.asyncio
async def test_user_with_no_peers_is_flagged_against_the_whole_org(async_db_session, monkeypatch):
    org_id = await _uniform_org(async_db_session, admin_profile=True)
    _rank_user_first(monkeypatch, "005u0")

    anomalies = await AnomalyDetectionService(async_db_session).detect_anomalies(org_id)

    assert [a.user_id for a in anomalies] == ["005u0"]
    assert anomalies[0].peer_stats["peer_group"] == "org"
    assert anomalies[0].peer_stats["peer_count"] == 9
    assert any("compares against all 9 other active users in the org" in r for r in anomalies[0].reasons)


def test_exclusive_access_reason_names_the_grants():
    service = AnomalyDetectionService.__new__(AnomalyDetectionService)
    features = {"unique_access_count": 2, "last_login_days_ago": 3, "cross_department_access_ratio": 0.0,
                "num_objects_delete": 0, "num_sensitive_fields": 0, "num_sensitive_objects": 0}
    peers = {"peer_group": "role", "peer_count": 4, "peer_medians": {"unique_access_count": 0}, "deviations": {}}
    reasons = service._generate_reasons(
        features, peers,
        unique_grants=[("field", "Compensation__c.Salary__c", "edit"), ("obj", "Compensation__c", "delete")],
    )
    assert reasons[0].startswith("Is the only user in the org with 2 permissions, including "
                                 "Edit on field Compensation__c.Salary__c, Delete on Compensation__c")
