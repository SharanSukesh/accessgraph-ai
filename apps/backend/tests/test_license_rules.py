from datetime import datetime, timedelta, timezone

from app.domain.models import (
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)
from app.services.org_analyzer import AnalyzerContext, OrgAnalyzerService

NOW = datetime.now(timezone.utc)
LICENCE = {"Id": "100SF", "Name": "Salesforce", "MasterLabel": "Salesforce",
           "TotalLicenses": 10, "UsedLicenses": 10, "Status": "Active"}


def _profile(pid: str, ps_id: str, objects=()):
    profile = ProfileSnapshot(organization_id="o", salesforce_id=pid, name=pid, user_license_id="100SF")
    ps = PermissionSetSnapshot(organization_id="o", salesforce_id=ps_id, name=f"X{pid}", label=pid,
                               is_owned_by_profile=True, profile_id=pid)
    perms = [ObjectPermissionSnapshot(organization_id="o", salesforce_id=f"110{ps_id}{o}", parent_id=ps_id,
                                      sobject_type=o, permissions_read=True) for o in objects]
    return profile, ps, perms


def _user(uid: str, profile_id: str, last_login=NOW, created_days_ago=400):
    return UserSnapshot(organization_id="o", salesforce_id=uid, username=f"{uid}@x", name=uid, is_active=True,
                        profile_id=profile_id, last_login_at=last_login,
                        raw_data={"CreatedDate": (NOW - timedelta(days=created_days_ago)).strftime(
                            "%Y-%m-%dT%H:%M:%S.000+0000")})


def _ctx():
    ctx = AnalyzerContext(org_id="o", actor_email=None)
    ctx.user_licenses = [LICENCE]
    ctx.org_type = "Enterprise Edition"
    ctx.price_book = {"Salesforce": 16500, "Platform": 2500}
    return ctx


def _findings(ctx, code):
    service = OrgAnalyzerService.__new__(OrgAnalyzerService)
    return [f for f in service._analyze_licenses(ctx) if f.code == code]


def _oversized_ids(ctx):
    found = _findings(ctx, "LICENSE_OVERSIZED")
    return {s["id"] for s in found[0].evidence["sample"]} if found else set()


def test_sales_access_from_profile_permission_set_is_counted():
    ctx = _ctx()
    p_sales, ps_sales, perms_sales = _profile("00eSales", "0PSsales", ["Opportunity"])
    p_none, ps_none, _ = _profile("00eNone", "0PSnone")
    ctx.profiles, ctx.permission_sets, ctx.object_perms = [p_sales, p_none], [ps_sales, ps_none], perms_sales
    ctx.users = [_user("005rep", "00eSales"), _user("005idle", "00eNone")]

    assert _oversized_ids(ctx) == {"005idle"}


def test_sales_access_from_expanded_group_is_counted():
    ctx = _ctx()
    p_none, ps_none, _ = _profile("00eNone", "0PSnone")
    component = PermissionSetSnapshot(organization_id="o", salesforce_id="0PSopp", name="Opp", label="Opp")
    ctx.profiles, ctx.permission_sets = [p_none], [ps_none, component]
    ctx.psgs = [PermissionSetGroupSnapshot(organization_id="o", salesforce_id="0PGsales",
                                           developer_name="Sales", master_label="Sales")]
    ctx.psg_components = [PermissionSetGroupComponentSnapshot(
        organization_id="o", salesforce_id="0PC1", permission_set_group_id="0PGsales", permission_set_id="0PSopp")]
    ctx.object_perms = [ObjectPermissionSnapshot(organization_id="o", salesforce_id="110opp", parent_id="0PSopp",
                                                 sobject_type="Opportunity", permissions_read=True)]
    ctx.assignments = [PermissionSetAssignmentSnapshot(organization_id="o", salesforce_id="0Pa1",
                                                       assignee_id="005grp", permission_set_id="0PGsales")]
    ctx.users = [_user("005grp", "00eNone"), _user("005idle", "00eNone")]

    assert _oversized_ids(ctx) == {"005idle"}


def test_case_access_needs_a_full_licence():
    ctx = _ctx()
    p_svc, ps_svc, perms_svc = _profile("00eSvc", "0PSsvc", ["Case"])
    ctx.profiles, ctx.permission_sets, ctx.object_perms = [p_svc], [ps_svc], perms_svc
    ctx.users = [_user("005agent", "00eSvc")]

    assert _oversized_ids(ctx) == set()
