"""The access graph expands permission set groups into their components and
muting set (display only), and object cards show effective access."""
import json
from pathlib import Path

import pytest

from app.domain.models import (
    ObjectPermissionSnapshot,
    Organization,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)
from app.ingestion.snapshot import SnapshotPersister
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"


def _node(graph, node_id):
    return next(n for n in graph["nodes"] if n["id"] == node_id)


def _edge(graph, source, target):
    return next(e for e in graph["edges"] if e["source"] == source and e["target"] == target)


@pytest.mark.asyncio
async def test_sales_manager_bundle_member_shows_components_and_muting_set(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Lumenvale", is_demo=True)
    async_db_session.add(org)
    await async_db_session.commit()
    data = json.loads((FIXTURES / "synthetic_mid_market.json").read_text())
    await SnapshotPersister(async_db_session).persist_all(org.id, data)

    group, muting = "0PG000000000001DMO", "0PS000000000037DMO"
    components = {c["PermissionSetId"] for c in data["permission_set_group_components"]
                  if c["PermissionSetGroupId"] == group}
    held = {}
    for a in data["permission_set_assignments"]:
        held.setdefault(a["AssigneeId"], set()).add(a["PermissionSetId"])
    # A member who holds the components only through the group.
    member = next(u for u, ids in sorted(held.items()) if group in ids and not ids & components)
    graph = (await client.get(f"/orgs/{org.id}/graph/user/{member}", cookies=_cookie(admin))).json()

    assert _node(graph, group)["type"] == "permission_set_group"
    assert _node(graph, group)["label"] == "Sales Manager Bundle"
    assert _node(graph, muting)["type"] == "muting_permission_set"
    assert _edge(graph, group, muting)["type"] == "MUTES"
    includes = [e for e in graph["edges"] if e["source"] == group and e["type"] == "INCLUDES_PERMISSION_SET"]
    assert includes
    # The group's edges carry its net access: the muting set removes Delete.
    muted = {o["SobjectType"] for o in data["object_permissions"]
             if o["ParentId"] == muting and o.get("PermissionsDelete")}
    grants = [e for e in graph["edges"] if e["source"] == group and e["target"] in {f"object_{o}" for o in muted}]
    assert muted and grants
    assert all(e["properties"]["delete"] is False for e in grants)
    # Components are display only: no access edges of their own.
    component_ids = {e["target"] for e in includes} | {muting}
    assert not [e for e in graph["edges"] if e["source"] in component_ids and e["type"] == "GRANTS_ACCESS"]


async def _production_shaped_org(db):
    org = Organization(name="Prod-shaped", is_demo=False)
    db.add(org)
    await db.flush()
    o = org.id
    db.add_all([
        ProfileSnapshot(organization_id=o, salesforce_id="00eP", name="Sales User"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSprof", name="X00eP", label="00eP",
                              is_owned_by_profile=True, profile_id="00eP"),
        # Salesforce's aggregate permission set for the group: already muted.
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSagg", name="Demo_Sales_Group",
                              label="Demo Sales Group", ps_type="Group"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PScomp", name="Account_Editor",
                              label="Account Editor"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSmute", name="Mute_Account_Edit",
                              label="Mute Account Edit", ps_type="Muting"),
        PermissionSetSnapshot(organization_id=o, salesforce_id="0PSopp", name="Opp_Editor", label="Opp Editor"),
        PermissionSetGroupSnapshot(organization_id=o, salesforce_id="0PGsales", developer_name="Demo_Sales_Group",
                                   master_label="Demo Sales Group"),
        PermissionSetGroupComponentSnapshot(organization_id=o, salesforce_id="0PC1",
                                            permission_set_group_id="0PGsales", permission_set_id="0PScomp"),
        PermissionSetGroupComponentSnapshot(organization_id=o, salesforce_id="0PC2",
                                            permission_set_group_id="0PGsales", permission_set_id="0PSmute"),
        UserSnapshot(organization_id=o, salesforce_id="005agent", username="agent@x", name="Sales Agent1",
                     is_active=True, profile_id="00eP"),
        PermissionSetAssignmentSnapshot(organization_id=o, salesforce_id="0Pa1", assignee_id="005agent",
                                        permission_set_id="0PSagg",
                                        raw_data={"PermissionSetGroupId": "0PGsales"}),
        PermissionSetAssignmentSnapshot(organization_id=o, salesforce_id="0Pa2", assignee_id="005agent",
                                        permission_set_id="0PSopp"),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110agg", parent_id="0PSagg",
                                 sobject_type="Account", permissions_read=True),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110comp", parent_id="0PScomp",
                                 sobject_type="Account", permissions_read=True, permissions_edit=True),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110mute", parent_id="0PSmute",
                                 sobject_type="Account", permissions_edit=True),
        # Profile reads Opportunity; a separate permission set edits it.
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110prof", parent_id="0PSprof",
                                 sobject_type="Opportunity", permissions_read=True),
        ObjectPermissionSnapshot(organization_id=o, salesforce_id="110opp", parent_id="0PSopp",
                                 sobject_type="Opportunity", permissions_read=True, permissions_edit=True),
    ])
    await db.commit()
    return o


@pytest.mark.asyncio
async def test_aggregate_group_assignment_expands_and_keeps_salesforce_net_access(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org_id = await _production_shaped_org(async_db_session)

    graph = (await client.get(f"/orgs/{org_id}/graph/user/005agent", cookies=_cookie(admin))).json()

    group = _node(graph, "0PSagg")
    assert group["type"] == "permission_set_group" and group["label"] == "Demo Sales Group"
    assert _edge(graph, "005agent", "0PSagg")["type"] == "ASSIGNED_PERMISSION_SET_GROUP"
    assert _edge(graph, "0PSagg", "0PScomp")["type"] == "INCLUDES_PERMISSION_SET"
    assert _node(graph, "0PSmute")["type"] == "muting_permission_set"
    assert _edge(graph, "0PSagg", "0PSmute")["label"] == "mutes"
    # The group's edge is the aggregate's own row, unchanged: Read only.
    assert _edge(graph, "0PSagg", "object_Account")["label"] == "R"
    assert not [e for e in graph["edges"] if e["source"] in ("0PScomp", "0PSmute") and e["type"] == "GRANTS_ACCESS"]
    assert _node(graph, "object_Account")["properties"]["canEdit"] is False
    # Object cards combine every source: Edit on Opportunity comes from the permission set.
    assert _node(graph, "object_Opportunity")["properties"]["canEdit"] is True


@pytest.mark.asyncio
async def test_explain_labels_an_aggregate_group_assignment_as_the_group(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org_id = await _production_shaped_org(async_db_session)

    r = await client.get(f"/orgs/{org_id}/users/005agent/explain/object/Account", cookies=_cookie(admin))

    path = next(p for p in r.json()["paths"] if p["source_type"] == "permission_set_group")
    assert path["permissions"] == ["Read"]
    assert "Group access as calculated by Salesforce, after any muting" in path["steps"]
    assert r.json()["access"]["edit"] is False
