"""Page layouts, Lightning record pages, Apex classes and flows for one user
(roadmap item 1, phase 1). Read-only; from the last sync.

  GET /orgs/{org_id}/users/{user_sf_id}/pages-and-automation
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.domain.models import (
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.services import privacy_mode
from app.services import ui_access

router = APIRouter()


async def latest_ui_access(db: AsyncSession, org_id: str) -> Optional[Dict[str, Any]]:
    jobs = (await db.execute(
        select(SyncJob).where(SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED)
        .order_by(desc(SyncJob.completed_at)).limit(5)
    )).scalars().all()
    for j in jobs:
        ui = (j.sync_metadata or {}).get("ui_access")
        if ui:
            return ui
    return None


async def user_context(db: AsyncSession, org_id: str, user_sf_id: str):
    user = (await db.execute(select(UserSnapshot).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.salesforce_id == user_sf_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    profiles = {p.salesforce_id: p.name for p in (await db.execute(
        select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id))).scalars().all()}
    ps_rows = {p.salesforce_id: p for p in (await db.execute(
        select(PermissionSetSnapshot).where(PermissionSetSnapshot.organization_id == org_id))).scalars().all()}
    assignments = (await db.execute(select(PermissionSetAssignmentSnapshot).where(
        PermissionSetAssignmentSnapshot.organization_id == org_id,
        PermissionSetAssignmentSnapshot.assignee_id == user_sf_id))).scalars().all()
    components = (await db.execute(select(PermissionSetGroupComponentSnapshot).where(
        PermissionSetGroupComponentSnapshot.organization_id == org_id))).scalars().all()
    groups = {g.salesforce_id: (g.master_label or g.developer_name or g.salesforce_id) for g in (await db.execute(
        select(PermissionSetGroupSnapshot).where(PermissionSetGroupSnapshot.organization_id == org_id))).scalars().all()}
    return user, profiles, ps_rows, assignments, components, groups


SECTIONS = ("layouts", "pages", "apex", "flows")


def _via_text(r: Dict[str, Any]) -> str:
    return " ".join(" ".join(p) for p in r.get("via") or [])


SECTION_TEXT = {
    "layouts": lambda r: f"{r['object']} {r['record_type']} {r['layout']}",
    "pages": lambda r: f"{r['object']} {r.get('app') or 'Any other app'} {r['record_type']} {r['page']} {r['rule']}",
    "apex": lambda r: f"{r['name']} {r.get('namespace') or ''} {_via_text(r)}",
    "flows": lambda r: f"{r.get('label') or ''} {r.get('api_name') or ''} {r.get('why') or ''} {_via_text(r)}",
}
SECTION_SORTS: Dict[str, Dict[str, Any]] = {
    "layouts": {"object": lambda r: (r["object"], r["record_type"]), "layout": lambda r: r["layout"],
                "record_type": lambda r: r["record_type"]},
    "pages": {"object": lambda r: (r["object"], r.get("app") or "~", r["record_type"]), "page": lambda r: r["page"],
              "rule": lambda r: r["rule"]},
    "apex": {"name": lambda r: r["name"].lower(), "paths": lambda r: len(r.get("via") or [])},
    "flows": {"label": lambda r: (r.get("label") or r.get("api_name") or "").lower(),
              "can_run": lambda r: {True: 0, None: 1, False: 2}[r.get("can_run")],
              "type": lambda r: r.get("trigger_type") or r.get("process_type")},
}
SECTION_DEFAULT = {"layouts": "object", "pages": "object", "apex": "name", "flows": "can_run"}


def _shape(out: Dict[str, Any], section: Optional[str], form_factor: Optional[str], preview: Optional[int],
           params: PageParams) -> Dict[str, Any]:
    """The whole view; or with `preview`, every list cut to its first rows and
    `counts` for each; or with `section` and `page`, one paged list
    (search, sort and the pages' form factor over every row)."""
    if not out.get("available"):
        return out
    if section:
        if section not in SECTIONS:
            raise HTTPException(status_code=400, detail=f"section must be one of {', '.join(SECTIONS)}")
        rows = out.get(section) or []
        if section == "pages":
            rows = [r for r in rows if r.get("form_factor") == (form_factor or "Desktop")]
        if not params.paged:
            return {"items": rows, "total": len(rows)}
        return paged(rows, params, text=SECTION_TEXT[section], sorts=SECTION_SORTS[section],
                     default_sort=SECTION_DEFAULT[section], section=section, profile=out.get("profile"))
    if preview:
        counts = {k: len(out.get(k) or []) for k in ("layouts", "apex", "flows")}
        for ff in ("Desktop", "Phone"):
            counts[f"pages_{ff.lower()}"] = sum(1 for p in out.get("pages") or [] if p.get("form_factor") == ff)
        out = {**out, "counts": counts,
               "layouts": sorted(out.get("layouts") or [], key=SECTION_SORTS["layouts"]["object"])[:preview],
               "pages": [p for ff in ("Desktop", "Phone") for p in sorted(
                   (p for p in out.get("pages") or [] if p.get("form_factor") == ff),
                   key=SECTION_SORTS["pages"]["object"])[:preview]],
               "apex": (out.get("apex") or [])[:preview], "flows": (out.get("flows") or [])[:preview]}
    return out


@router.get("/orgs/{org_id}/users/{user_sf_id}/pages-and-automation")
async def pages_and_automation(org_id: str, user_sf_id: str, section: Optional[str] = None,
                               form_factor: Optional[str] = Query(None, pattern="^(Desktop|Phone)$"),
                               preview: Optional[int] = Query(None, ge=1, le=50),
                               params: PageParams = Depends(page_params),
                               db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    await privacy_mode.require_feature(db, org_id, "users")
    ui = await latest_ui_access(db, org_id)
    user, profiles, ps_rows, assignments, components, groups = await user_context(db, org_id, user_sf_id)
    out = ui_access.for_user(ui, user, profiles, ps_rows, assignments, components, groups)
    if not section:
        out["apex_sharing"] = await apex_sharing(db, org_id, user_sf_id, (ui or {}).get("share_reasons") or {})
    return _shape(out, section, form_factor, preview, params)


async def apex_sharing(db: AsyncSession, org_id: str, user_sf_id: str, labels: Dict[str, Dict[str, str]]) -> Dict[str, Any]:
    """Account and Opportunity shares to this user that Apex granted (an Apex
    sharing reason), and manual shares, which may also come from Apex."""
    from collections import Counter

    from app.domain.models import AccountShareSnapshot, OpportunityShareSnapshot
    from app.services.share_sources import APEX_NOTE, MANUAL_NOTE, describe

    apex: Counter = Counter()
    manual = 0
    for obj, model in (("Account", AccountShareSnapshot), ("Opportunity", OpportunityShareSnapshot)):
        for (rc,) in (await db.execute(select(model.row_cause).where(
                model.organization_id == org_id, model.user_or_group_id == user_sf_id))).all():
            d = describe(rc, labels.get(obj))
            if d["kind"] == "apex":
                apex[f"{obj}: {d['reason']}"] += 1
            elif d["kind"] == "manual_or_apex":
                manual += 1
    parts = [f"{n} by Apex ({reason})" for reason, n in sorted(apex.items())]
    if manual:
        parts.append(f"{manual} manual (by a user or by Apex without a sharing reason)")
    summary = ("Account and Opportunity shares to this user: " + "; ".join(parts) + "."
               if parts else "No Account or Opportunity shares to this user in the last sync.")
    return {"summary": summary, "notes": [
        APEX_NOTE, MANUAL_NOTE,
        "Newton reads Account and Opportunity share rows today; shares on other objects, custom objects included, "
        "come with record-level access (roadmap item 7).",
    ]}



async def _ps_context(db: AsyncSession, org_id: str):
    ps_rows = {p.salesforce_id: p for p in (await db.execute(
        select(PermissionSetSnapshot).where(PermissionSetSnapshot.organization_id == org_id))).scalars().all()}
    components = (await db.execute(select(PermissionSetGroupComponentSnapshot).where(
        PermissionSetGroupComponentSnapshot.organization_id == org_id))).scalars().all()
    groups = {g.salesforce_id: (g.master_label or g.developer_name or g.salesforce_id) for g in (await db.execute(
        select(PermissionSetGroupSnapshot).where(PermissionSetGroupSnapshot.organization_id == org_id))).scalars().all()}
    return ps_rows, components, groups


@router.get("/orgs/{org_id}/profiles")
async def list_profiles(org_id: str, params: PageParams = Depends(page_params),
                        db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    """Profiles with their user counts when user records are allowed. With
    `page`: one page, searched (name or API name) and sorted (name, api_name,
    users) on the server."""
    from collections import Counter
    org = await privacy_mode.load_org(db, org_id)
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    counts: Counter = Counter()
    if users_allowed:
        for (pid,) in (await db.execute(select(UserSnapshot.profile_id).where(
                UserSnapshot.organization_id == org_id, UserSnapshot.is_active.is_(True)))).all():
            counts[pid] += 1
    rows = (await db.execute(select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id))).scalars().all()
    ui = await latest_ui_access(db, org_id)
    api = (ui or {}).get("profile_api_names") or {}
    profiles = sorted(
        ({"id": p.salesforce_id, "name": p.name, "api_name": api.get(p.salesforce_id),
          "active_users": counts.get(p.salesforce_id, 0) if users_allowed else None} for p in rows),
        key=lambda r: str(r["name"]).lower())
    if not params.paged:
        return {"users_allowed": users_allowed, "profiles": profiles}
    return paged(profiles, params, text=lambda r: f"{r['name']} {r.get('api_name') or ''}",
                 sorts={"name": lambda r: r["name"], "api_name": lambda r: r.get("api_name"),
                        "users": lambda r: r.get("active_users")},
                 default_sort="name", users_allowed=users_allowed)


@router.get("/orgs/{org_id}/profiles/{profile_id}/pages-and-automation")
async def profile_pages_and_automation(org_id: str, profile_id: str, section: Optional[str] = None,
                                       form_factor: Optional[str] = Query(None, pattern="^(Desktop|Phone)$"),
                                       preview: Optional[int] = Query(None, ge=1, le=50),
                                       params: PageParams = Depends(page_params),
                                       db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    profile = (await db.execute(select(ProfileSnapshot).where(
        ProfileSnapshot.organization_id == org_id, ProfileSnapshot.salesforce_id == profile_id))).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    ps_rows, _, _ = await _ps_context(db, org_id)
    out = ui_access.for_profile(await latest_ui_access(db, org_id), profile_id, profile.name, ps_rows)
    return _shape(out, section, form_factor, preview, params)


def _set_shape(out: Dict[str, Any], section: Optional[str], preview: Optional[int], params: PageParams) -> Dict[str, Any]:
    """A set's Apex and flows: whole, previewed (first rows and `counts`), or one paged section."""
    if not out.get("available"):
        return out
    if section:
        if section not in ("apex", "flows"):
            raise HTTPException(status_code=400, detail="section must be apex or flows")
        rows = out.get(section) or []
        if not params.paged:
            return {"items": rows, "total": len(rows)}
        return paged(rows, params, text=SECTION_TEXT[section], sorts=SECTION_SORTS[section],
                     default_sort="name" if section == "apex" else "label", section=section)
    if preview:
        return {**out, "counts": {"apex": len(out.get("apex") or []), "flows": len(out.get("flows") or [])},
                "apex": (out.get("apex") or [])[:preview], "flows": (out.get("flows") or [])[:preview]}
    return out


@router.get("/orgs/{org_id}/permission-sets/{ps_id}/automation")
async def set_automation(org_id: str, ps_id: str, section: Optional[str] = None,
                         preview: Optional[int] = Query(None, ge=1, le=50), params: PageParams = Depends(page_params),
                         db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    ps_rows, components, groups = await _ps_context(db, org_id)
    if ps_id not in ps_rows and ps_id not in groups:
        raise HTTPException(status_code=404, detail="Permission set not found")
    out = ui_access.for_set(await latest_ui_access(db, org_id), ps_id, ps_rows, components, groups)
    return _set_shape(out, section, preview, params)


MUTING_NOTE = (
    "Apex class and flow access is listed from the group's permission sets. Whether a muting set can remove Apex "
    "class or flow access isn't covered (UNVERIFIED); the muting set's own permissions are shown on its page."
)


@router.get("/orgs/{org_id}/permission-set-groups/{group_id}")
async def permission_set_group(org_id: str, group_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    """A permission set group: its permission sets, its muting set, how many
    users hold it (when user records are kept), and the Apex classes and
    flows it grants through its sets. Configuration only."""
    group = (await db.execute(select(PermissionSetGroupSnapshot).where(
        PermissionSetGroupSnapshot.organization_id == org_id,
        PermissionSetGroupSnapshot.salesforce_id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="Permission set group not found")
    ps_rows, components, groups = await _ps_context(db, org_id)
    sets, muting = [], []
    for c in components:
        if c.permission_set_group_id != group_id:
            continue
        ps = ps_rows.get(c.permission_set_id)
        is_muting = (ps is not None and (ps.ps_type or "") == "Muting") or c.permission_set_id.startswith("0QM")
        row = {"id": c.permission_set_id,
               "label": (ps.label or ps.name) if ps is not None else None,
               "name": ps.name if ps is not None else None}
        (muting if is_muting else sets).append(row)
    org = await privacy_mode.load_org(db, org_id)
    users = None
    if privacy_mode.allows(org, privacy_mode.USER_RECORDS):
        # Salesforce assigns the group's aggregate set (PermissionSetGroupId on
        # the assignment); the demo fixtures assign the group id itself.
        aggregate = {p.salesforce_id for p in ps_rows.values()
                     if (p.ps_type or "") == "Group" and (p.raw_data or {}).get("PermissionSetGroupId") == group_id}
        rows = (await db.execute(select(PermissionSetAssignmentSnapshot).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id.in_({group_id} | aggregate)))).scalars().all()
        users = len({a.assignee_id for a in rows})
    automation = ui_access.for_set(await latest_ui_access(db, org_id), group_id, ps_rows, components, groups)
    return {
        "id": group.salesforce_id,
        "label": group.master_label or group.developer_name,
        "developer_name": group.developer_name,
        "permission_sets": sorted(sets, key=lambda r: (r["label"] or r["id"]).lower()),
        "muting_sets": muting,
        "users": users,
        # Previewed (first 10 and counts); the full lists are paged at /permission-sets/{id}/automation?section=.
        "automation": {**_set_shape(automation, None, 10, page_params(None, 25, None, "asc", None)),
                       "muting_note": MUTING_NOTE if muting else None},
    }
