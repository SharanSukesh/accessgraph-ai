"""Large synthetic permission data for the pagination work (standing rule,
20 Oct): added on top of tests/people_scale.py's 600-user org. Deterministic.

  - a profile-owned permission set for each of people_scale's 5 profiles;
  - 300 regular permission sets and 12 permission set groups (4 components
    each, one with a muting set);
  - about 10 assignments per user (about 6,000 in all), plus group
    assignments;
  - 60 objects with object permissions from profiles and sets;
  - 2,400 fields (40 per object) with field permissions (about 12,000 rows).

Used by the pagination tests and, locally, to seed an org for the browser
check. Not a demo fixture: nothing here is shown in the product.
"""
from __future__ import annotations

import random
from typing import Any, Dict, List

from tests import people_scale

N_SETS = 300
N_GROUPS = 12
N_OBJECTS = 60
FIELDS_PER_OBJECT = 40
ASSIGNMENTS_PER_USER = 10


def _id(prefix: str, n: int) -> str:
    return f"{prefix}{n:012d}LST"[:18]


def build(seed: int = 2026) -> Dict[str, List[Dict[str, Any]]]:
    rng = random.Random(seed)
    users = people_scale.build()["users"]
    profiles = people_scale.PROFILES
    sets: List[Dict[str, Any]] = []
    for i, (pid, name) in enumerate(profiles, start=1):
        sets.append({"salesforce_id": _id("0PS", i), "name": f"X{pid}", "label": pid, "is_owned_by_profile": True,
                     "profile_id": pid, "ps_type": "Profile"})
    for i in range(1, N_SETS + 1):
        sets.append({"salesforce_id": _id("0PS", 100 + i), "name": f"Scale_Set_{i:03d}", "label": f"Scale Set {i:03d}",
                     "is_owned_by_profile": False, "profile_id": None, "ps_type": "Regular"})
    muting = {"salesforce_id": _id("0PS", 99), "name": "Scale_Muting", "label": "Scale Muting",
              "is_owned_by_profile": False, "profile_id": None, "ps_type": "Muting"}
    sets.append(muting)
    regular = [s for s in sets if s["ps_type"] == "Regular"]
    groups, components = [], []
    for g in range(1, N_GROUPS + 1):
        gid = _id("0PG", g)
        groups.append({"salesforce_id": gid, "developer_name": f"Scale_Group_{g:02d}", "master_label": f"Scale Group {g:02d}"})
        for k, s in enumerate(rng.sample(regular, 4)):
            components.append({"salesforce_id": _id("0PC", g * 10 + k), "permission_set_group_id": gid,
                               "permission_set_id": s["salesforce_id"]})
    components.append({"salesforce_id": _id("0PC", 999), "permission_set_group_id": groups[0]["salesforce_id"],
                       "permission_set_id": muting["salesforce_id"]})
    assignments = []
    n = 0
    for u in users:
        chosen = rng.sample(regular, ASSIGNMENTS_PER_USER)
        if rng.random() < 0.3:
            chosen = chosen[:-1] + [{"salesforce_id": rng.choice(groups)["salesforce_id"]}]
        for s in chosen:
            n += 1
            assignments.append({"salesforce_id": _id("0Pa", n), "assignee_id": u["salesforce_id"],
                                "permission_set_id": s["salesforce_id"]})
    objects = [f"Scale_Object_{i:02d}__c" for i in range(1, N_OBJECTS + 1)]
    object_perms, field_perms = [], []
    for o_i, obj in enumerate(objects):
        holders = [s for s in sets if s["ps_type"] == "Profile"] + rng.sample(regular, 25)
        for s in holders:
            edit = rng.random() < 0.5
            object_perms.append({"salesforce_id": _id("110", len(object_perms) + 1), "parent_id": s["salesforce_id"],
                                 "sobject_type": obj, "permissions_read": True, "permissions_create": edit,
                                 "permissions_edit": edit, "permissions_delete": edit and rng.random() < 0.3,
                                 "permissions_view_all_records": False, "permissions_modify_all_records": False})
        for f in range(1, FIELDS_PER_OBJECT + 1):
            for s in rng.sample(holders, 5):
                field_perms.append({"salesforce_id": _id("01k", len(field_perms) + 1), "parent_id": s["salesforce_id"],
                                    "sobject_type": obj, "field": f"{obj}.Field_{f:02d}__c",
                                    "permissions_read": True, "permissions_edit": rng.random() < 0.4})
    return {"permission_sets": sets, "groups": groups, "components": components, "assignments": assignments,
            "object_permissions": object_perms, "field_permissions": field_perms}


async def seed(db: Any, org_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """people_scale's users plus this permission data, with a completed sync."""
    from datetime import datetime, timezone
    from app.domain.models import (
        FieldPermissionSnapshot, ObjectPermissionSnapshot, PermissionSetAssignmentSnapshot,
        PermissionSetGroupComponentSnapshot, PermissionSetGroupSnapshot, PermissionSetSnapshot, SyncJob, SyncStatus,
    )
    await people_scale.seed(db, org_id)
    data = build()
    for s in data["permission_sets"]:
        db.add(PermissionSetSnapshot(organization_id=org_id, **s))
    for g in data["groups"]:
        db.add(PermissionSetGroupSnapshot(organization_id=org_id, **g))
    for c in data["components"]:
        db.add(PermissionSetGroupComponentSnapshot(organization_id=org_id, **c))
    for a in data["assignments"]:
        db.add(PermissionSetAssignmentSnapshot(organization_id=org_id, **a))
    for p in data["object_permissions"]:
        db.add(ObjectPermissionSnapshot(organization_id=org_id, **p))
    for p in data["field_permissions"]:
        db.add(FieldPermissionSnapshot(organization_id=org_id, **p))
    db.add(SyncJob(organization_id=org_id, status=SyncStatus.COMPLETED, completed_at=datetime.now(timezone.utc),
                   sync_metadata={}))
    await db.flush()
    return data
