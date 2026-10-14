import pytest

from app.domain.models import (
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    Organization,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)
from app.services.effective_access import EffectiveAccessService


async def _org_with_muted_group(db, *, profile_grants_edit: bool):
    org = Organization(name="Muting", is_demo=True)
    db.add(org)
    await db.flush()
    o = org.id
    db.add_all([
        ProfileSnapshot(organization_id=o, salesforce_id="00eP", name="Sales User"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSprof", name="X00eP", label="00eP",
                              is_owned_by_profile=True, profile_id="00eP"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSacct", name="Account_Manager", label="Account Manager"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSmute", name="Mute_Account_Edit",
                              label="Mute Account Edit", ps_type="Muting"),
        PermissionSetGroupSnapshot(organization_id=o, salesforce_id="0PGsales", developer_name="Sales_PSG",
                                   master_label="Sales PSG"),
        PermissionSetGroupComponentSnapshot(organization_id=o, salesforce_id="0PC1",
                                            permission_set_group_id="0PGsales", permission_set_id="0PSacct"),
        PermissionSetGroupComponentSnapshot(organization_id=o, salesforce_id="0PC2",
                                            permission_set_group_id="0PGsales", permission_set_id="0PSmute"),
        UserSnapshot(organization_id=o, salesforce_id="005rep", username="rep@x", name="Rep",
                     is_active=True, profile_id="00eP"),
        PermissionSetAssignmentSnapshot(organization_id=o, salesforce_id="0Pa1", assignee_id="005rep",
                                        permission_set_id="0PGsales"),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110a", parent_id="0PSacct", sobject_type="Account",
                                 permissions_read=True, permissions_edit=True),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110m", parent_id="0PSmute", sobject_type="Account",
                                 permissions_edit=True),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110p", parent_id="0PSprof", sobject_type="Account",
                                 permissions_read=True, permissions_edit=profile_grants_edit),
        FieldPermissionSnapshot(organization_id=o, salesforce_id="01ka", parent_id="0PSacct",
                                sobject_type="Account", field="Account.AnnualRevenue",
                                permissions_read=True, permissions_edit=False),
        FieldPermissionSnapshot(organization_id=o, salesforce_id="01km", parent_id="0PSmute",
                                sobject_type="Account", field="Account.AnnualRevenue",
                                permissions_read=True, permissions_edit=False),
    ])
    await db.commit()
    return o


def _account(result):
    return next(obj for obj in result["objects"] if obj["object"] == "Account")["access"]


@pytest.mark.asyncio
async def test_group_muting_removes_edit_granted_only_by_the_group(async_db_session):
    org_id = await _org_with_muted_group(async_db_session, profile_grants_edit=False)
    access = _account(await EffectiveAccessService(async_db_session).get_user_object_access(org_id, "005rep"))
    assert access["read"] is True
    assert access["edit"] is False


@pytest.mark.asyncio
async def test_muting_does_not_remove_the_same_permission_from_the_profile(async_db_session):
    org_id = await _org_with_muted_group(async_db_session, profile_grants_edit=True)
    access = _account(await EffectiveAccessService(async_db_session).get_user_object_access(org_id, "005rep"))
    assert access["edit"] is True


@pytest.mark.asyncio
async def test_field_read_muting(async_db_session):
    org_id = await _org_with_muted_group(async_db_session, profile_grants_edit=False)
    fields = (await EffectiveAccessService(async_db_session).get_user_field_access(org_id, "005rep"))["fields"]
    assert not any(f["fieldName"] == "AnnualRevenue" for f in fields)


@pytest.mark.asyncio
async def test_explain_reports_muting_and_never_lists_the_muting_set_as_a_grant(async_db_session):
    org_id = await _org_with_muted_group(async_db_session, profile_grants_edit=False)
    explanation = await EffectiveAccessService(async_db_session).explain_user_object_access(
        org_id, "005rep", "Account"
    )
    group_path = next(p for p in explanation["paths"] if p["source_type"] == "permission_set_group")
    assert group_path["permissions"] == ["Read"]
    assert group_path["granted_via"] == ["Account Manager"]
    assert group_path["muted"] == [{"permission": "Edit", "muted_by": "Mute Account Edit"}]
    assert any("Muted: Edit by muting permission set Mute Account Edit" in s for s in group_path["steps"])
    assert all("Mute Account Edit" not in p["granted_via"] for p in explanation["paths"])
    assert explanation["access"]["edit"] is False
