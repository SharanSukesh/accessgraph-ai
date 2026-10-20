"""Versioned snapshots (roadmap item 21): the org as it was at each sync.

Every sync ends by taking a snapshot of the configuration it pulled (after
the privacy level was applied). Each configuration row becomes a
SnapshotItem: entity ("assignment", "object_permission"...), a stable key,
its fields, and the range of the org's snapshots it was valid in. A row
that doesn't change is one item whose range grows (copy-on-change), so
storage follows change, not syncs.

Existing modules keep reading the live snapshot tables, which hold the
latest sync; comparison (9), drift (17) and simulation (15) read any
snapshot through load_state() and diff().

What's versioned: users (identity and assignment fields, not last login),
roles, profiles, permission sets (with their system permissions),
assignments, permission set groups and their components, object and field
permissions, public groups and members, sharing rules, org-wide defaults,
and the configuration blobs (field metadata per object; layouts, pages,
flows and the rest per section). Record-level shares and team members
aren't: they're data, large and change daily.

Retention prunes snapshots past the window, never the latest one or a
baseline; erasure deletes them with the org; tightening the privacy level
rewrites them (services/privacy_purge.py).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import delete, select

from app.domain.models import OrgSnapshot, SnapshotItem

USER_FIELDS = ("Name", "Username", "ProfileId", "UserRoleId", "ManagerId", "DelegatedApproverId", "IsActive", "UserType",
               "Department", "Title")
OBJECT_FLAGS = ("PermissionsRead", "PermissionsCreate", "PermissionsEdit", "PermissionsDelete",
                "PermissionsViewAllRecords", "PermissionsModifyAllRecords")
ENTITY_LABELS = {
    "user": "Users", "role": "Roles", "profile": "Profiles", "permission_set": "Permission sets",
    "assignment": "Permission set assignments", "permission_set_group": "Permission set groups",
    "group_component": "Group components", "object_permission": "Object permissions",
    "field_permission": "Field permissions", "public_group": "Public groups", "group_member": "Group members",
    "sharing_rule": "Sharing rules", "org_wide_default": "Org-wide defaults", "schema_object": "Field metadata",
    "ui_access": "Layouts, pages and automation", "org_docs": "Documented configuration",
}
# Entities that hold people; at Metadata only they're removed from every snapshot.
USER_ENTITIES = {"user", "assignment", "group_member"}


def _pick(row: Dict[str, Any], keys: Iterable[str]) -> Dict[str, Any]:
    return {k: row.get(k) for k in keys if row.get(k) is not None}


def _canonical(data: Any) -> str:
    return json.dumps(data, sort_keys=True, default=str, separators=(",", ":"))


def digest(data: Any) -> str:
    return hashlib.sha256(_canonical(data).encode()).hexdigest()


def normalize(data: Dict[str, Any]) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """(entity, key) -> fields, from a sync's extracted data."""
    out: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def add(entity: str, key: Optional[str], fields: Dict[str, Any]) -> None:
        if key:
            out[(entity, str(key)[:255])] = fields

    for u in data.get("users") or []:
        add("user", u.get("Id"), _pick(u, USER_FIELDS))
    for r in data.get("roles") or []:
        add("role", r.get("Id"), _pick(r, ("Name", "DeveloperName", "ParentRoleId", "PortalType")))
    for p in data.get("profiles") or []:
        add("profile", p.get("Id"), _pick(p, ("Name", "UserLicenseId", "UserType")))
    for ps in data.get("permission_sets") or []:
        system = sorted(k for k, v in ps.items() if k.startswith("Permissions") and v is True)
        add("permission_set", ps.get("Id"), {**_pick(ps, ("Name", "Label", "IsOwnedByProfile", "ProfileId", "Type",
                                                           "PermissionSetGroupId", "LicenseId")),
                                             "systemPermissions": system})
    for a in data.get("permission_set_assignments") or []:
        add("assignment", f"{a.get('AssigneeId')}:{a.get('PermissionSetId')}",
            _pick(a, ("AssigneeId", "PermissionSetId", "PermissionSetGroupId")))
    for g in data.get("permission_set_groups") or []:
        add("permission_set_group", g.get("Id"), _pick(g, ("DeveloperName", "MasterLabel", "Status")))
    for c in data.get("permission_set_group_components") or []:
        add("group_component", f"{c.get('PermissionSetGroupId')}:{c.get('PermissionSetId')}",
            _pick(c, ("PermissionSetGroupId", "PermissionSetId")))
    for p in data.get("object_permissions") or []:
        add("object_permission", f"{p.get('ParentId')}:{p.get('SobjectType')}",
            {"ParentId": p.get("ParentId"), "SobjectType": p.get("SobjectType"),
             **{f: bool(p.get(f)) for f in OBJECT_FLAGS}})
    for p in data.get("field_permissions") or []:
        add("field_permission", f"{p.get('ParentId')}:{p.get('Field')}",
            {"ParentId": p.get("ParentId"), "Field": p.get("Field"), "PermissionsRead": bool(p.get("PermissionsRead")),
             "PermissionsEdit": bool(p.get("PermissionsEdit"))})
    for g in data.get("groups") or []:
        add("public_group", g.get("Id"), _pick(g, ("Name", "DeveloperName", "Type", "RelatedId")))
    for m in data.get("group_members") or []:
        add("group_member", f"{m.get('GroupId')}:{m.get('UserOrGroupId')}", _pick(m, ("GroupId", "UserOrGroupId")))
    for r in data.get("sharing_rules") or []:
        key = r.get("Id") or r.get("id") or r.get("developer_name") or r.get("DeveloperName")
        add("sharing_rule", key, {k: v for k, v in r.items() if k not in ("attributes",)})
    for o in data.get("organization_wide_defaults") or []:
        add("org_wide_default", o.get("sobject_type") or o.get("SobjectType"),
            {k: v for k, v in o.items() if k not in ("attributes",)})
    for name, obj in ((data.get("schema") or {}).get("objects") or {}).items():
        add("schema_object", name, obj)
    for section in ("ui_access", "org_docs"):
        for key, value in (data.get(section) or {}).items():
            if key in ("collected_at", "notes"):
                continue
            add(section, key, {"value": value})
    return out


async def latest(db: Any, org_id: str) -> Optional[OrgSnapshot]:
    return (await db.execute(select(OrgSnapshot).where(OrgSnapshot.organization_id == org_id)
                             .order_by(OrgSnapshot.seq.desc()).limit(1))).scalar_one_or_none()


async def take_snapshot(db: Any, org_id: str, data: Dict[str, Any], *, source: str, sync_job_id: Optional[str] = None,
                        taken_at: Optional[datetime] = None, label: Optional[str] = None,
                        privacy_mode: Optional[str] = None) -> OrgSnapshot:
    """Record the configuration in `data` as the org's next snapshot."""
    prev = await latest(db, org_id)
    seq = (prev.seq + 1) if prev else 1
    state = normalize(data)
    current: Dict[Tuple[str, str], SnapshotItem] = {}
    if prev is not None:
        for item in (await db.execute(select(SnapshotItem).where(
                SnapshotItem.organization_id == org_id, SnapshotItem.last_seq == prev.seq))).scalars():
            current[(item.entity, item.key)] = item
    changes: Dict[str, Dict[str, int]] = {}
    counts: Dict[str, int] = {}

    def bump(entity: str, kind: str) -> None:
        changes.setdefault(entity, {"added": 0, "removed": 0, "changed": 0})[kind] += 1

    for (entity, key), fields in state.items():
        counts[entity] = counts.get(entity, 0) + 1
        h = digest(fields)
        item = current.pop((entity, key), None)
        if item is not None and item.hash == h:
            item.last_seq = seq
            continue
        if prev is not None:
            bump(entity, "changed" if item is not None else "added")
        db.add(SnapshotItem(organization_id=org_id, entity=entity, key=key, hash=h, data=fields,
                            first_seq=seq, last_seq=seq))
    if prev is not None:
        for (entity, _key) in current:
            bump(entity, "removed")
    snap = OrgSnapshot(organization_id=org_id, seq=seq, taken_at=taken_at or datetime.now(timezone.utc),
                       source=source, label=label, sync_job_id=sync_job_id, privacy_mode=privacy_mode,
                       counts=counts, changes=changes,
                       coverage={"record_coverage": data.get("record_coverage")} if data.get("record_coverage") else {})
    db.add(snap)
    await db.flush()
    return snap


async def get(db: Any, org_id: str, snapshot_id: str) -> Optional[OrgSnapshot]:
    snap = await db.get(OrgSnapshot, snapshot_id)
    return snap if snap is not None and snap.organization_id == org_id else None


async def load_state(db: Any, org_id: str, snap: OrgSnapshot,
                     entities: Optional[Iterable[str]] = None) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """entity -> key -> fields, as the org was at `snap`."""
    stmt = select(SnapshotItem).where(SnapshotItem.organization_id == org_id, SnapshotItem.first_seq <= snap.seq,
                                      SnapshotItem.last_seq >= snap.seq)
    if entities is not None:
        stmt = stmt.where(SnapshotItem.entity.in_(list(entities)))
    out: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for item in (await db.execute(stmt)).scalars():
        out.setdefault(item.entity, {})[item.key] = item.data
    return out


def _changed_fields(before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
    return sorted(k for k in set(before) | set(after) if _canonical(before.get(k)) != _canonical(after.get(k)))


async def diff(db: Any, org_id: str, a: OrgSnapshot, b: OrgSnapshot) -> List[Dict[str, Any]]:
    """What changed from snapshot a to snapshot b, one row per changed item."""
    sa_, sb = await load_state(db, org_id, a), await load_state(db, org_id, b)
    rows = []
    for entity in sorted(set(sa_) | set(sb)):
        before, after = sa_.get(entity, {}), sb.get(entity, {})
        for key in sorted(set(before) | set(after)):
            x, y = before.get(key), after.get(key)
            if x == y:
                continue
            kind = "added" if x is None else "removed" if y is None else "changed"
            rows.append({"entity": entity, "entityLabel": ENTITY_LABELS.get(entity, entity), "key": key,
                         "change": kind, "before": x, "after": y,
                         "fields": _changed_fields(x or {}, y or {}) if kind == "changed" else []})
    return rows


async def prune(db: Any, org_id: str, cutoff: datetime) -> Dict[str, int]:
    """Drop snapshots taken before `cutoff`, except the latest one,
    baselines and any a what-if draft starts from, and the item versions no
    kept snapshot still needs."""
    snaps = (await db.execute(select(OrgSnapshot).where(OrgSnapshot.organization_id == org_id)
                              .order_by(OrgSnapshot.seq))).scalars().all()
    if not snaps:
        return {}
    newest = snaps[-1].seq
    from app.domain.models import AccessDraft
    in_drafts = set((await db.execute(select(AccessDraft.base_snapshot_id).where(
        AccessDraft.organization_id == org_id))).scalars())  # a what-if draft's starting state (item 15)
    drop = [s for s in snaps if s.taken_at.replace(tzinfo=s.taken_at.tzinfo or timezone.utc) < cutoff
            and not s.is_baseline and s.seq != newest and s.id not in in_drafts]
    if not drop:
        return {}
    kept = sorted(s.seq for s in snaps if s not in drop)
    items = (await db.execute(select(SnapshotItem.id, SnapshotItem.first_seq, SnapshotItem.last_seq).where(
        SnapshotItem.organization_id == org_id))).all()
    dead = [i for i, f, last in items if not any(f <= k <= last for k in kept)]
    for chunk in range(0, len(dead), 500):
        await db.execute(delete(SnapshotItem).where(SnapshotItem.id.in_(dead[chunk:chunk + 500])))
    await db.execute(delete(OrgSnapshot).where(OrgSnapshot.id.in_([s.id for s in drop])))
    return {"org_snapshots": len(drop), "snapshot_items": len(dead)}


def apply_kickoff(data: Dict[str, Any], kickoff: Dict[str, Any]) -> Dict[str, Any]:
    """The demo fixture's earlier state: today's data with the kickoff patch
    applied (each change says how kickoff differed from today). A change
    whose row isn't in the data (e.g. users at Metadata only) is skipped."""
    import copy

    out = dict(data)
    copied: set = set()
    for change in kickoff.get("changes") or []:
        name = change["list"]
        if name not in copied:  # never touch today's rows
            out[name] = copy.deepcopy(out.get(name) or [])
            copied.add(name)
        match = change.get("match") or {}

        def hit(r: Dict[str, Any]) -> bool:
            return all(r.get(k) == v for k, v in match.items())

        if change["op"] == "remove":
            out[name] = [r for r in out[name] if not hit(r)]
        elif change["op"] == "add":
            if not any(r.get("Id") == change["row"].get("Id") for r in out[name]):
                out[name].append(dict(change["row"]))
        elif change["op"] == "set":
            for r in out[name]:
                if hit(r):
                    r.update(change["fields"])
    return out
