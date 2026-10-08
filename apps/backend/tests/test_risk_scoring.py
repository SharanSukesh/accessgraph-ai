"""Tests for the noisy-OR per-user risk model in app/services/risk_scoring.py."""
from __future__ import annotations

import itertools
import random
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

import pytest
from sqlalchemy import event

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    Organization,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    RiskLevel,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.services.risk_scoring import (
    FACTOR_WEIGHTS,
    PRIVILEGED_PERMISSIONS,
    RiskScoringService,
    classify_sensitive_field,
    classify_sensitive_object,
    combine_factors,
    determine_risk_level,
    tokenize_api_name,
)

_ids = itertools.count(1)


def _sfid(prefix: str) -> str:
    return f"{prefix}{next(_ids):015d}"[:18]


class OrgBuilder:
    """Small helper for writing snapshot rows the way the sync persister does."""

    def __init__(self, db, org_id: str, sync_job_id: Optional[str] = None):
        self.db = db
        self.org_id = org_id
        self.sync_job_id = sync_job_id

    def _common(self) -> Dict:
        return {"organization_id": self.org_id, "sync_job_id": self.sync_job_id}

    def profile(self, name: str, perms: Iterable[str] = ()) -> str:
        profile_id = _sfid("00e")
        self.db.add(ProfileSnapshot(salesforce_id=profile_id, name=name, **self._common()))
        self.db.add(PermissionSetSnapshot(
            salesforce_id=self.profile_ps_id(profile_id),
            name=f"X{profile_id}",
            label=f"X{profile_id}",
            is_owned_by_profile=True,
            profile_id=profile_id,
            raw_data={f"Permissions{p}": True for p in perms},
            **self._common(),
        ))
        return profile_id

    @staticmethod
    def profile_ps_id(profile_id: str) -> str:
        return "0PS" + profile_id[3:]

    def permission_set(self, label: str, perms: Iterable[str] = (), ps_type: Optional[str] = None) -> str:
        ps_id = _sfid("0PS")
        self.db.add(PermissionSetSnapshot(
            salesforce_id=ps_id,
            name=label.replace(" ", "_"),
            label=label,
            is_owned_by_profile=False,
            ps_type=ps_type,
            raw_data={f"Permissions{p}": True for p in perms},
            **self._common(),
        ))
        return ps_id

    def psg(self, label: str, components: List[str]) -> str:
        psg_id = _sfid("0PG")
        self.db.add(PermissionSetGroupSnapshot(
            salesforce_id=psg_id, developer_name=label.replace(" ", "_"), master_label=label, **self._common(),
        ))
        for comp in components:
            self.db.add(PermissionSetGroupComponentSnapshot(
                salesforce_id=_sfid("0PC"), permission_set_group_id=psg_id, permission_set_id=comp,
                **self._common(),
            ))
        return psg_id

    def obj(self, parent_id: str, sobject: str, access: str) -> None:
        """access: letters from 'rcedVM' (read, create, edit, delete, View All, Modify All)."""
        self.db.add(ObjectPermissionSnapshot(
            salesforce_id=_sfid("110"),
            parent_id=parent_id,
            sobject_type=sobject,
            permissions_read="r" in access,
            permissions_create="c" in access,
            permissions_edit="e" in access,
            permissions_delete="d" in access,
            permissions_view_all_records="V" in access,
            permissions_modify_all_records="M" in access,
            **self._common(),
        ))

    def fld(self, parent_id: str, field_name: str, edit: bool = False) -> None:
        self.db.add(FieldPermissionSnapshot(
            salesforce_id=_sfid("01k"),
            parent_id=parent_id,
            sobject_type=field_name.split(".")[0],
            field=field_name,
            permissions_read=True,
            permissions_edit=edit,
            **self._common(),
        ))

    def user(self, name: str, profile_id: str, last_login_days: Optional[int] = 3,
             is_active: bool = True) -> str:
        user_id = _sfid("005")
        last_login = (
            datetime.now(timezone.utc) - timedelta(days=last_login_days)
            if last_login_days is not None else None
        )
        self.db.add(UserSnapshot(
            salesforce_id=user_id,
            username=f"{user_id}@example.com",
            name=name,
            is_active=is_active,
            profile_id=profile_id,
            last_login_at=last_login,
            **self._common(),
        ))
        return user_id

    def assign(self, user_id: str, ps_id: str) -> None:
        self.db.add(PermissionSetAssignmentSnapshot(
            salesforce_id=_sfid("0Pa"), assignee_id=user_id, permission_set_id=ps_id, **self._common(),
        ))


async def _new_org(db) -> str:
    org = Organization(name="Risk Test Org", is_demo=True)
    db.add(org)
    await db.flush()
    return org.id


async def _sales_org(db, n_reps: int = 6):
    """Standard-User sales team: the baseline every scenario builds on."""
    org_id = await _new_org(db)
    b = OrgBuilder(db, org_id)
    std = b.profile("Standard User", perms=["ApiEnabled", "ExportReport", "RunReports"])
    std_ps = b.profile_ps_id(std)
    for sobject in ("Account", "Contact", "Lead", "Opportunity"):
        b.obj(std_ps, sobject, "rce")
    b.obj(std_ps, "Case", "r")
    b.obj(std_ps, "Task", "rced")
    b.fld(std_ps, "Contact.Birthdate")
    b.fld(std_ps, "Contact.Email", edit=True)
    reps = [b.user(f"Rep {i}", std) for i in range(n_reps)]
    return b, std, reps


async def _score(db, org_id: str) -> Dict[str, object]:
    await db.commit()
    scores = await RiskScoringService(db).score_all_users(org_id)
    return {s.entity_id: s for s in scores}


def _factor(score, key: str) -> Dict:
    return next(f for f in score.factors if f["factor"] == key)


# --------------------------------------------------------------------------- scenarios


@pytest.mark.asyncio
async def test_normal_sales_rep_is_low(async_db_session):
    db = async_db_session
    b, _, reps = await _sales_org(db)
    scores = await _score(db, b.org_id)

    rep = scores[reps[0]]
    assert rep.risk_level == RiskLevel.LOW
    assert rep.risk_score < 25
    assert {f["factor"] for f in rep.factors} == set(FACTOR_WEIGHTS)
    for f in rep.factors:
        assert 0.0 <= f["score"] <= 1.0
        assert f["description"]
        assert isinstance(f["evidence"], list)
    assert _factor(rep, "dormancy_exposure")["score"] == 0
    assert _factor(rep, "unique_access")["score"] == 0
    assert rep.reason_text


@pytest.mark.asyncio
async def test_modify_all_data_via_profile_is_high_with_profile_evidence(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    ops = b.profile("Operations Lead", perms=["ModifyAllData"])
    ops_user = b.user("Olivia Ops", ops, last_login_days=2)
    scores = await _score(db, b.org_id)

    s = scores[ops_user]
    assert s.risk_level == RiskLevel.HIGH, s.risk_score
    priv = _factor(s, "privileged_permissions")
    top = priv["evidence"][0]
    assert top["permission"] == "ModifyAllData"
    assert top["severity"] == "critical"
    assert top["granted_by"] == [{"type": "profile", "name": "Operations Lead"}]
    assert top["expected_for_role"] is False
    assert "Modify All Data" in s.reason_text and "Operations Lead" in s.reason_text


@pytest.mark.asyncio
async def test_modify_all_data_plus_dormancy_is_critical(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    ops = b.profile("Operations Lead", perms=["ModifyAllData"])
    dormant = b.user("Dormant Dan", ops, last_login_days=120)
    scores = await _score(db, b.org_id)

    s = scores[dormant]
    assert s.risk_level == RiskLevel.CRITICAL, s.risk_score
    dorm = _factor(s, "dormancy_exposure")
    assert dorm["score"] > 0.4
    assert dorm["days_since_login"] == 120
    assert "120 days" in s.reason_text


@pytest.mark.asyncio
async def test_dormant_read_only_user_stays_low(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    ro = b.profile("Read Only")
    b.obj(b.profile_ps_id(ro), "Account", "r")
    dormant = b.user("Quiet Quinn", ro, last_login_days=200)
    scores = await _score(db, b.org_id)
    assert scores[dormant].risk_level == RiskLevel.LOW


@pytest.mark.asyncio
async def test_dormancy_skipped_when_org_has_no_login_data(async_db_session):
    db = async_db_session
    org_id = await _new_org(db)
    b = OrgBuilder(db, org_id)
    ops = b.profile("Operations Lead", perms=["ModifyAllData"])
    users = [b.user(f"U{i}", ops, last_login_days=None) for i in range(3)]
    scores = await _score(db, org_id)
    dorm = _factor(scores[users[0]], "dormancy_exposure")
    assert dorm["score"] == 0
    assert "not available" in dorm["description"]


@pytest.mark.asyncio
async def test_system_administrator_profile_flags_expected_for_role(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    admin = b.profile("System Administrator", perms=["ModifyAllData", "ViewAllData", "CustomizeApplication"])
    b.user("Second Admin", admin)
    admin_user = b.user("Ada Admin", admin)
    scores = await _score(db, b.org_id)

    priv = _factor(scores[admin_user], "privileged_permissions")
    assert priv["expected_for_role"] is True
    assert all(e["expected_for_role"] for e in priv["evidence"])
    assert scores[admin_user].risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL)
    assert "administrator" in scores[admin_user].reason_text


@pytest.mark.asyncio
async def test_permission_set_grant_is_named_in_evidence(async_db_session):
    db = async_db_session
    b, std, _ = await _sales_org(db)
    apex = b.permission_set("Apex Developers", perms=["AuthorApex"])
    dev = b.user("Dev Dee", std)
    b.assign(dev, apex)
    scores = await _score(db, b.org_id)

    ev = _factor(scores[dev], "privileged_permissions")["evidence"][0]
    assert ev["permission"] == "AuthorApex"
    assert ev["granted_by"] == [{"type": "permission_set", "name": "Apex Developers"}]


@pytest.mark.asyncio
async def test_psg_grant_respects_muting(async_db_session):
    db = async_db_session
    b, std, _ = await _sales_org(db)
    user_admin = b.permission_set("User Admin", perms=["ManageUsers", "ResetPasswords"])
    mute = b.permission_set("Mute Manage Users", perms=["ManageUsers"], ps_type="Muting")
    group = b.psg("Helpdesk", [user_admin, mute])
    agent = b.user("Helpdesk Hal", std)
    b.assign(agent, group)
    scores = await _score(db, b.org_id)

    ev = {e["permission"]: e for e in _factor(scores[agent], "privileged_permissions")["evidence"]}
    assert "ManageUsers" not in ev
    assert ev["ResetPasswords"]["granted_by"] == [{"type": "permission_set_group", "name": "Helpdesk"}]


# --------------------------------------------------------------------------- sensitive data


def test_tokenize_api_name():
    assert tokenize_api_name("Contact.SocialSecurityNumber__c") == ["social", "security", "number"]
    assert tokenize_api_name("ns__TaxID__c") == ["tax", "id"]
    assert tokenize_api_name("Account.SSNLast4__c") == ["ssn", "last4"]


@pytest.mark.parametrize("field_name,category", [
    ("Contact.SSN__c", "government ID"),
    ("Contact.Social_Security_Number__c", "government ID"),
    ("Contact.ns__TaxID__c", "government ID"),
    ("Contact.Passport_Number__c", "government ID"),
    ("Contact.Birthdate", "demographic"),
    ("Contact.DOB__c", "demographic"),
    ("Contact.Gender__c", "demographic"),
    ("Employee__c.Annual_Salary__c", "financial"),
    ("Account.Bank_Account__c", "financial"),
    ("Account.IBAN__c", "financial"),
    ("Contact.Credit_Card_Number__c", "financial"),
    ("Contact.Medical_History__c", "health"),
    ("Case.Diagnosis_Code__c", "health"),
    ("Integration__c.API_Key__c", "credential"),
    ("Integration__c.Client_Secret__c", "credential"),
])
def test_sensitive_field_patterns_detect(field_name, category):
    match = classify_sensitive_field(field_name)
    assert match is not None, field_name
    assert match[0] == category


@pytest.mark.parametrize("field_name", [
    "Contact.Email",
    "Account.Name",
    "Account.Health_Score__c",
    "Case.Routing_Queue__c",
    "Account.Scorecard__c",
    "Opportunity.Disabled_Flag__c",
    "Lead.Trace_Id__c",
])
def test_sensitive_field_patterns_ignore_benign_names(field_name):
    assert classify_sensitive_field(field_name) is None


def test_sensitive_objects_default_and_custom():
    assert classify_sensitive_object("Contact") is not None
    assert classify_sensitive_object("Payroll_Run__c") is not None
    assert classify_sensitive_object("Patient__c") is not None
    assert classify_sensitive_object("Task") is None
    assert classify_sensitive_object("Project__c") is None


@pytest.mark.asyncio
async def test_sensitive_field_access_names_field_and_grant(async_db_session):
    db = async_db_session
    b, std, reps = await _sales_org(db)
    hr = b.permission_set("HR Data")
    b.fld(hr, "Contact.SSN__c", edit=True)
    b.obj(hr, "Contact", "rV")
    hr_user = b.user("Hana HR", std)
    b.assign(hr_user, hr)
    scores = await _score(db, b.org_id)

    sens = _factor(scores[hr_user], "sensitive_data_access")
    labels = {e["label"]: e for e in sens["evidence"]}
    ssn = labels["Edit Contact.SSN__c"]
    assert ssn["category"] == "government ID"
    assert ssn["granted_by"] == [{"type": "permission_set", "name": "HR Data"}]
    view_all = labels["View All on Contact"]
    assert view_all["granted_by"] == [{"type": "permission_set", "name": "HR Data"}]
    assert sens["score"] > _factor(scores[reps[0]], "sensitive_data_access")["score"]


@pytest.mark.asyncio
async def test_object_access_implied_by_modify_all_data_is_not_double_counted(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    ops = b.profile("Operations Lead", perms=["ModifyAllData"])
    for sobject in ("Account", "Contact", "Invoice__c"):
        b.obj(b.profile_ps_id(ops), sobject, "rcedVM")
    ops_user = b.user("Olivia Ops", ops)
    scores = await _score(db, b.org_id)

    s = scores[ops_user]
    assert not [e for e in _factor(s, "sensitive_data_access")["evidence"] if e["kind"] == "object"]
    assert _factor(s, "edit_delete_breadth")["score"] == 0
    assert s.risk_level == RiskLevel.HIGH


# --------------------------------------------------------------------------- org-relative factors


@pytest.mark.asyncio
async def test_sole_access_detection(async_db_session):
    db = async_db_session
    b, std, reps = await _sales_org(db)
    finance = b.permission_set("Invoice Admin")
    b.obj(finance, "Invoice__c", "rced")
    b.assign(reps[0], finance)
    scores = await _score(db, b.org_id)

    unique = _factor(scores[reps[0]], "unique_access")
    assert unique["score"] > 0
    ev = unique["evidence"][0]
    assert ev["label"] == "Only user with Delete on Invoice__c"
    assert ev["holders"] == 1
    assert ev["granted_by"] == [{"type": "permission_set", "name": "Invoice Admin"}]
    # Task delete is held by every rep, so it is not sole access.
    assert all(e["target"] != "Task" for e in unique["evidence"])
    assert _factor(scores[reps[1]], "unique_access")["score"] == 0


@pytest.mark.asyncio
async def test_modify_all_data_holder_removes_sole_object_access(async_db_session):
    db = async_db_session
    b, std, reps = await _sales_org(db)
    finance = b.permission_set("Invoice Admin")
    b.obj(finance, "Invoice__c", "rced")
    b.assign(reps[0], finance)
    admin = b.profile("System Administrator", perms=["ModifyAllData"])
    b.user("Ada Admin", admin)
    scores = await _score(db, b.org_id)

    assert _factor(scores[reps[0]], "unique_access")["score"] == 0


@pytest.mark.asyncio
async def test_edit_delete_breadth_is_percentile_based(async_db_session):
    db = async_db_session
    b, std, reps = await _sales_org(db)
    wide = b.permission_set("Everything Editor")
    for i in range(30):
        b.obj(wide, f"Custom{i}__c", "rce")
    b.assign(reps[0], wide)
    scores = await _score(db, b.org_id)

    assert _factor(scores[reps[0]], "edit_delete_breadth")["score"] > 0.8
    assert _factor(scores[reps[1]], "edit_delete_breadth")["score"] == 0


@pytest.mark.asyncio
async def test_peer_deviation_uses_latest_access_anomaly(async_db_session):
    db = async_db_session
    b, _, reps = await _sales_org(db)
    now = datetime.now(timezone.utc)
    db.add(AccessAnomaly(
        organization_id=b.org_id, user_id=reps[0], anomaly_score=0.2, severity=AnomalySeverity.LOW,
        reasons=["old"], detected_at=now - timedelta(days=10), category="access",
    ))
    db.add(AccessAnomaly(
        organization_id=b.org_id, user_id=reps[0], anomaly_score=0.8, severity=AnomalySeverity.HIGH,
        reasons=["Edits 3x more objects than peers"], detected_at=now, category="access",
    ))
    db.add(AccessAnomaly(
        organization_id=b.org_id, user_id=reps[1], anomaly_score=0.95, severity=AnomalySeverity.CRITICAL,
        reasons=["impossible travel"], detected_at=now, category="session",
    ))
    scores = await _score(db, b.org_id)

    peer = _factor(scores[reps[0]], "peer_deviation")
    assert peer["score"] == pytest.approx(0.5 * 0.75 + 0.5 * 0.8)
    assert peer["evidence"][0]["label"] == "Edits 3x more objects than peers"
    assert _factor(scores[reps[1]], "peer_deviation")["score"] == 0


@pytest.mark.asyncio
async def test_stale_rows_from_older_sync_are_ignored(async_db_session):
    db = async_db_session
    org_id = await _new_org(db)
    old = SyncJob(organization_id=org_id, status=SyncStatus.COMPLETED,
                  completed_at=datetime.now(timezone.utc) - timedelta(days=7))
    new = SyncJob(organization_id=org_id, status=SyncStatus.COMPLETED,
                  completed_at=datetime.now(timezone.utc))
    db.add_all([old, new])
    await db.flush()

    b = OrgBuilder(db, org_id, sync_job_id=new.id)
    std = b.profile("Standard User", perms=["ApiEnabled"])
    reps = [b.user(f"Rep {i}", std) for i in range(4)]
    god = b.permission_set("Break Glass", perms=["ModifyAllData"])
    reports = b.permission_set("Report Builder", perms=["ExportReport"])
    b.assign(reps[1], reports)
    # Assignment removed in Salesforce since the old sync: the upsert never
    # deletes it, but it no longer carries the latest sync id.
    OrgBuilder(db, org_id, sync_job_id=old.id).assign(reps[0], god)
    scores = await _score(db, org_id)

    assert _factor(scores[reps[0]], "privileged_permissions")["score"] < 0.1
    assert scores[reps[0]].risk_level == RiskLevel.LOW


# --------------------------------------------------------------------------- combination


def test_levels_thresholds():
    assert determine_risk_level(24.9) == RiskLevel.LOW
    assert determine_risk_level(25) == RiskLevel.MEDIUM
    assert determine_risk_level(50) == RiskLevel.HIGH
    assert determine_risk_level(75) == RiskLevel.CRITICAL


def test_noisy_or_is_monotone():
    rng = random.Random(7)
    weights = list(FACTOR_WEIGHTS.values())
    for _ in range(2000):
        scores = [rng.random() if rng.random() < 0.6 else 0.0 for _ in weights]
        base = combine_factors(zip(weights, scores))
        assert 0.0 <= base <= 100.0
        i = rng.randrange(len(weights))
        raised = list(scores)
        raised[i] = min(1.0, scores[i] + rng.random())
        assert combine_factors(zip(weights, raised)) >= base - 1e-9
        # An extra factor never lowers the score.
        assert combine_factors(list(zip(weights, scores)) + [(rng.random(), rng.random())]) >= base - 1e-9
    # A single factor is never diluted by the others being zero.
    assert combine_factors([(0.65, 0.9), (0.35, 0.0), (0.2, 0.0)]) == pytest.approx(58.5)


@pytest.mark.asyncio
async def test_adding_dormancy_never_lowers_score(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    ops = b.profile("Operations Lead", perms=["ModifyAllData", "AuthorApex"])
    active = b.user("Active Ops", ops, last_login_days=1)
    dormant = b.user("Dormant Ops", ops, last_login_days=150)
    never = b.user("Never Ops", ops, last_login_days=None)
    scores = await _score(db, b.org_id)
    assert scores[active].risk_score <= scores[dormant].risk_score <= scores[never].risk_score


def test_max_score_is_reachable_by_combination():
    assert combine_factors((w, 1.0) for w in FACTOR_WEIGHTS.values()) == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_max_score_is_reachable_end_to_end(async_db_session):
    db = async_db_session
    b, _, _ = await _sales_org(db)
    god = b.profile("Integration God Mode", perms=list(PRIVILEGED_PERMISSIONS))
    orphan = b.user("Orphaned Integration", god, last_login_days=None)
    scores = await _score(db, b.org_id)
    assert scores[orphan].risk_score == 100.0
    assert scores[orphan].risk_level == RiskLevel.CRITICAL
    assert "never logged in" in scores[orphan].reason_text


@pytest.mark.asyncio
async def test_score_user_risk_single_user(async_db_session):
    db = async_db_session
    b, _, reps = await _sales_org(db)
    await db.commit()
    s = await RiskScoringService(db).score_user_risk(b.org_id, reps[0])
    assert s.entity_id == reps[0]
    assert s.risk_level == RiskLevel.LOW
    with pytest.raises(ValueError):
        await RiskScoringService(db).score_user_risk(b.org_id, "005000000000000BAD")


@pytest.mark.asyncio
async def test_query_count_is_independent_of_user_count(async_db_session):
    db = async_db_session
    engine = db.bind.sync_engine
    counts = []

    def _count(*_args, **_kwargs):
        if counts:
            counts[-1] += 1

    event.listen(engine, "before_cursor_execute", _count)
    try:
        for n in (3, 30):
            counts_snapshot = list(counts)
            counts.clear()
            b, _, _ = await _sales_org(db, n_reps=n)
            await db.commit()
            counts.extend(counts_snapshot + [0])
            await RiskScoringService(db).score_all_users(b.org_id)
    finally:
        event.remove(engine, "before_cursor_execute", _count)
    assert counts[0] == counts[1], counts
