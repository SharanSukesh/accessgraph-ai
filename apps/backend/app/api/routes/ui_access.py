"""Page layouts, Lightning record pages, Apex classes and flows for one user
(roadmap item 1, phase 1). Read-only; from the last sync.

  GET /orgs/{org_id}/users/{user_sf_id}/pages-and-automation
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
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


@router.get("/orgs/{org_id}/users/{user_sf_id}/pages-and-automation")
async def pages_and_automation(org_id: str, user_sf_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    await privacy_mode.require_feature(db, org_id, "users")
    ui = await latest_ui_access(db, org_id)
    user, profiles, ps_rows, assignments, components, groups = await user_context(db, org_id, user_sf_id)
    out = ui_access.for_user(ui, user, profiles, ps_rows, assignments, components, groups)
    out["apex_sharing"] = await apex_sharing(db, org_id, user_sf_id, (ui or {}).get("share_reasons") or {})
    return out


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
