"""Who can access an object or a field, paged (the standing pagination rule).

  GET /orgs/{org_id}/objects/{object_name}/access?kind=profiles|permission_sets|groups|users
  GET /orgs/{org_id}/fields/{field_id}/access?kind=...

with page, page_size, sort, dir and q (app/api/pagination.py). Without
`page` every row comes back, for exports. The detail pages show
`access_summary(...)`: a count per kind and its first rows.

Users are active users, by the same rules as the user pages (access_index):
profile, assigned permission sets, and permission set groups with muting
applied. Profiles and permission sets show their own grants; a group shows
what it grants after its muting set. At Metadata only there are no users.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.domain.models import FieldPermissionSnapshot, ObjectPermissionSnapshot, Organization
from app.services import privacy_mode
from app.services.access_index import AccessIndex, access_index
from app.services.effective_access import _evaluate

router = APIRouter()

KINDS = ("profiles", "permission_sets", "groups", "users")
SOURCE_KIND = {"profiles": "profile", "permission_sets": "permission_set", "groups": "permission_set_group"}
PREVIEW = 10
OBJECT_FLAGS6 = ("read", "create", "edit", "delete", "view_all", "modify_all")
CAMEL = {"view_all": "viewAll", "modify_all": "modifyAll"}


class Target:
    """An object, or a field (Object.Field) whose access may follow its object."""

    def __init__(self, kind: str, key: str, follows_object: bool = False):
        self.kind, self.key, self.follows_object = kind, key, follows_object

    @property
    def index_kind(self) -> str:
        return "objects" if self.kind == "objects" or self.follows_object else "fields"

    @property
    def index_key(self) -> str:
        return self.key.split(".")[0] if self.kind == "fields" and self.follows_object else self.key

    @property
    def flags(self) -> Tuple[str, ...]:
        return OBJECT_FLAGS6 if self.kind == "objects" else ("read", "edit")


async def _raw_flags(db: AsyncSession, org_id: str, t: Target) -> Dict[str, Dict[str, bool]]:
    """Permission set id -> its own flags on the target (profiles and sets)."""
    out: Dict[str, Dict[str, bool]] = {}
    if t.index_kind == "objects":
        rows = (await db.execute(select(ObjectPermissionSnapshot).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.sobject_type == t.index_key))).scalars().all()
        for p in rows:
            out[p.parent_id] = {"read": bool(p.permissions_read), "create": bool(p.permissions_create),
                                "edit": bool(p.permissions_edit), "delete": bool(p.permissions_delete),
                                "view_all": bool(p.permissions_view_all_records),
                                "modify_all": bool(p.permissions_modify_all_records)}
    else:
        obj, _, fld = t.key.partition(".")
        field_rows = (await db.execute(select(FieldPermissionSnapshot).where(
            FieldPermissionSnapshot.organization_id == org_id, FieldPermissionSnapshot.sobject_type == obj,
            FieldPermissionSnapshot.field.in_({t.key, fld})))).scalars().all()
        for fp in field_rows:
            cur = out.get(fp.parent_id, {"read": False, "edit": False})
            out[fp.parent_id] = {"read": cur["read"] or bool(fp.permissions_read), "edit": cur["edit"] or bool(fp.permissions_edit)}
    if t.kind == "fields" and t.follows_object:
        out = {k: {"read": v["read"], "edit": v["edit"]} for k, v in out.items()}
    return out


def _flags_out(flags: Dict[str, bool], wanted: Tuple[str, ...]) -> Dict[str, bool]:
    return {CAMEL.get(f, f): bool(flags.get(f)) for f in wanted}


async def _rows(db: AsyncSession, org_id: str, index: AccessIndex, t: Target, kind: str,
                profile_of: Dict[str, str]) -> List[Dict[str, Any]]:
    if kind == "users":
        return _user_rows(index, t)
    raw = await _raw_flags(db, org_id, t)
    wanted = t.flags
    from app.domain.models import PermissionSetGroupSnapshot
    group_ids = {g.master_label or g.developer_name: g.salesforce_id for g in (await db.execute(
        select(PermissionSetGroupSnapshot).where(PermissionSetGroupSnapshot.organization_id == org_id))).scalars().all()}
    by_ident: Dict[str, Dict[str, Any]] = {}
    for key, src in index.sources.items():
        if src.kind != SOURCE_KIND[kind]:
            continue
        if kind == "groups":
            perms = {c.ps_id: {t.index_key: {f: raw.get(c.ps_id, {}).get(f, False) for f in wanted}} for c in src.components}
            flags = _evaluate(src, perms, wanted).granted.get(t.index_key, {})
            # A group assigned directly and through its aggregate permission set is one group.
            ident = src.name
            row_id = group_ids.get(src.name) or src.group_id
        else:
            flags = raw.get(src.components[0].ps_id, {})
            ident = row_id = src.components[0].ps_id
        if not any(flags.get(f) for f in wanted):
            continue
        row = by_ident.setdefault(ident, {"id": row_id, "name": src.name, "label": src.name, "kind": src.kind,
                                          **_flags_out({}, wanted), "_users": set()})
        for f, v in _flags_out(flags, wanted).items():
            row[f] = row[f] or v
        row["_users"] |= index.users_by_source.get(key, set())
    rows = []
    for row in by_ident.values():
        users = row.pop("_users")
        rows.append({**row, "users": len(users)})
    if kind == "profiles":
        # Profile pages are keyed by profile id; map the profile's own set back.
        for r in rows:
            r["id"] = profile_of.get(r["id"], r["id"])
    return rows


def _user_rows(index: AccessIndex, t: Target) -> List[Dict[str, Any]]:
    grants = index.objects if t.index_kind == "objects" else index.fields
    wanted = ("read", "create", "edit", "delete") if t.kind == "objects" else ("read", "edit")
    per_user: Dict[str, Dict[str, Any]] = {}
    for key, granted in grants.items():
        perm = granted.get(t.index_key)
        if not perm or not perm.get("read"):
            continue
        src = index.sources[key]
        for uid in index.users_by_source.get(key, ()):
            row = per_user.setdefault(uid, {"flags": dict.fromkeys(wanted, False), "via": []})
            for f in wanted:
                row["flags"][f] = row["flags"][f] or bool(perm.get(f))
            label = {"profile": "Profile", "permission_set": "Permission set",
                     "permission_set_group": "Permission set group"}[src.kind] + f": {src.name}"
            if label not in row["via"]:
                row["via"].append(label)
    out = []
    for uid, row in per_user.items():
        u = index.users.get(uid)
        if u is None:
            continue
        out.append({"salesforceUserId": uid, "name": u.name, "username": u.username, **row["flags"],
                    "accessVia": sorted(row["via"])})
    return out


SORTS = {
    "name": lambda r: r.get("name"),
    "users": lambda r: r.get("users"),
    "read": lambda r: r.get("read"),
    "edit": lambda r: r.get("edit"),
    "via": lambda r: len(r.get("accessVia") or []),
}


def _text(r: Dict[str, Any]) -> str:
    return " ".join(str(x) for x in (r.get("name"), r.get("username"), " ".join(r.get("accessVia") or [])) if x)


async def _target_for_field(db: AsyncSession, org_id: str, field_id: str) -> Target:
    if "." not in field_id:
        raise HTTPException(status_code=400, detail="Expected 'Object.Field'.")
    obj, _, name = field_id.partition(".")
    bare = name.split(".")[-1]
    full = f"{obj}.{bare}"
    has_fls = (await db.execute(select(FieldPermissionSnapshot.id).where(
        FieldPermissionSnapshot.organization_id == org_id, FieldPermissionSnapshot.sobject_type == obj,
        FieldPermissionSnapshot.field.in_({full, bare})).limit(1))).first() is not None
    return Target("fields", full, follows_object=not has_fls)


async def _users_allowed(db: AsyncSession, org_id: str) -> bool:
    org = await db.get(Organization, org_id)
    return org is not None and privacy_mode.allows(org, privacy_mode.USER_RECORDS)


async def _profile_map(db: AsyncSession, org_id: str) -> Dict[str, str]:
    """Profile-owned permission set id -> profile id."""
    from app.domain.models import PermissionSetSnapshot
    rows = (await db.execute(select(PermissionSetSnapshot.salesforce_id, PermissionSetSnapshot.profile_id).where(
        PermissionSetSnapshot.organization_id == org_id, PermissionSetSnapshot.is_owned_by_profile.is_(True)))).all()
    return {ps: pid for ps, pid in rows if pid}


async def access_summary(db: AsyncSession, org_id: str, t: Target) -> Dict[str, Any]:
    """Counts per kind and the first rows of each, for a detail page."""
    index = await access_index(db, org_id)
    profile_of = await _profile_map(db, org_id)
    users_ok = await _users_allowed(db, org_id)
    out: Dict[str, Any] = {"followsObject": t.follows_object, "kinds": {}}
    for kind in KINDS:
        if kind == "users" and not users_ok:
            out["kinds"][kind] = {"count": None, "preview": [], "unavailable": privacy_mode.METADATA_ONLY}
            continue
        rows = await _rows(db, org_id, index, t, kind, profile_of)
        rows = sorted(rows, key=lambda r: (-(r.get("users") or 0), (r.get("name") or "").lower())) if kind != "users" \
            else sorted(rows, key=lambda r: (r.get("name") or "").lower())
        out["kinds"][kind] = {"count": len(rows), "preview": rows[:PREVIEW]}
    return out


async def _paged(db: AsyncSession, org_id: str, t: Target, kind: str, params: PageParams) -> Dict[str, Any]:
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {', '.join(KINDS)}")
    if kind == "users" and not await _users_allowed(db, org_id):
        raise HTTPException(status_code=409, detail="Users aren't available at this org's privacy level (metadata only).")
    index = await access_index(db, org_id)
    rows = await _rows(db, org_id, index, t, kind, await _profile_map(db, org_id))
    if not params.paged:
        return {"items": sorted(rows, key=lambda r: (r.get("name") or "").lower()), "total": len(rows)}
    return paged(rows, params, text=_text, sorts=SORTS, default_sort="name", kind=kind,
                 followsObject=t.follows_object)


@router.get("/orgs/{org_id}/objects/{object_name}/access")
async def object_access(org_id: str, object_name: str, kind: str = Query("users"),
                        params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)):
    return await _paged(db, org_id, Target("objects", object_name), kind, params)


@router.get("/orgs/{org_id}/fields/{field_id}/access")
async def field_access(org_id: str, field_id: str, kind: str = Query("users"),
                       params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)):
    return await _paged(db, org_id, await _target_for_field(db, org_id, field_id), kind, params)


def target_for_object(name: str) -> Target:
    return Target("objects", name)


async def target_for_field(db: AsyncSession, org_id: str, field_id: str) -> Target:
    return await _target_for_field(db, org_id, field_id)


