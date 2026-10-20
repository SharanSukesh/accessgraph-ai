"""One-screen views (Config Workbook parity rows #26-28; services/org_overview.py).

  GET /orgs/{org_id}/org-limits                 every limit with used, % used and
                                                status (paged; q, status)
  GET /orgs/{org_id}/security-summary           the security summary tiles
  GET /orgs/{org_id}/security-summary/admins    users holding one powerful system
                                                permission (paged; q; permission=)
  GET /orgs/{org_id}/org-overview               component counts and the first
                                                logins-by-profile rows
  GET /orgs/{org_id}/logins-by-profile          logins by profile (paged; q, sort)

Without `page`, the list endpoints return every row (for exports).
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.domain.models import OrgAnalysisSnapshot, Organization, ProfileSnapshot, UserSnapshot
from app.services import org_overview as ov
from app.services import privacy_mode

router = APIRouter()
PREVIEW = 10


@router.get("/orgs/{org_id}/org-limits")
async def org_limits(org_id: str, status: Optional[str] = Query(None, pattern="^(healthy|warning|critical)$"),
                     params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    snap = (await db.execute(select(OrgAnalysisSnapshot).where(OrgAnalysisSnapshot.organization_id == org_id)
                             .order_by(desc(OrgAnalysisSnapshot.snapshot_at)).limit(1))).scalar_one_or_none()
    rows = ov.limits_rows(snap.org_limits if snap is not None else None)
    summary = {s: sum(r["status"] == s for r in rows) for s in ("healthy", "warning", "critical")}
    extra = {"summary": summary, "readAt": snap.snapshot_at.isoformat() if snap is not None else None,
             "thresholds": {"warning": ov.WARNING_PCT, "critical": ov.CRITICAL_PCT}}
    if status:
        rows = [r for r in rows if r["status"] == status]
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    sorts = {"pct": lambda r: r["pct"], "name": lambda r: r["label"], "used": lambda r: r["used"], "max": lambda r: r["max"]}
    if params.sort is None:
        params.sort, params.dir = "pct", "desc"
    return paged(rows, params, text=lambda r: f"{r['label']} {r['name']}", sorts=sorts, default_sort="pct", **extra)


@router.get("/orgs/{org_id}/security-summary")
async def security_summary(org_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    return await ov.security_summary(db, org_id)


@router.get("/orgs/{org_id}/security-summary/admins")
async def admins(org_id: str, permission: str = Query("ModifyAllData"), params: PageParams = Depends(page_params),
                 db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    if permission not in dict(ov.ADMIN_PERMISSIONS):
        raise HTTPException(status_code=400, detail=f"permission must be one of {', '.join(dict(ov.ADMIN_PERMISSIONS))}")
    org = await db.get(Organization, org_id)
    if org is None or not privacy_mode.allows(org, privacy_mode.USER_RECORDS):
        raise HTTPException(status_code=409, detail="Users aren't available at this org's privacy level (metadata only).")
    rows = (await ov.admin_holders(db, org_id))[permission]
    label = dict(ov.ADMIN_PERMISSIONS)[permission]
    if not params.paged:
        return {"items": sorted(rows, key=lambda r: (r["name"] or "").lower()), "total": len(rows), "label": label}
    sorts = {"name": lambda r: r["name"], "profile": lambda r: r["profile"]}
    return paged(rows, params, text=lambda r: f"{r['name']} {r['profile'] or ''} {' '.join(r['via'])}", sorts=sorts,
                 default_sort="name", label=label, permission=permission)


async def _logins(db: AsyncSession, org_id: str) -> Optional[list]:
    org = await db.get(Organization, org_id)
    if org is None or not privacy_mode.allows(org, privacy_mode.USER_RECORDS):
        return None
    users = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id))).scalars().all()
    profiles = {p.salesforce_id: p.name for p in (await db.execute(
        select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id))).scalars().all()}
    return ov.logins_by_profile(list(users), profiles)


@router.get("/orgs/{org_id}/org-overview")
async def org_overview(org_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    inputs = await ov.load_overview_inputs(db, org_id)
    logins = await _logins(db, org_id)
    return {
        "components": ov.component_counts(inputs["schema"], inputs["ui"], inputs["docs"], inputs["db_counts"]),
        "logins": None if logins is None else {
            "count": len(logins), "preview": logins[:PREVIEW],
            "totals": {k: sum(r[k] for r in logins) for k in ("active", "last30", "last90", "never", "notIn90")}},
    }


@router.get("/orgs/{org_id}/logins-by-profile")
async def logins_by_profile(org_id: str, params: PageParams = Depends(page_params),
                            db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    rows = await _logins(db, org_id)
    if rows is None:
        raise HTTPException(status_code=409, detail="Users aren't available at this org's privacy level (metadata only).")
    if not params.paged:
        return {"items": rows, "total": len(rows)}
    sorts = {k: (lambda key: lambda r: r[key])(k) for k in ("active", "last30", "last90", "never", "notIn90")}
    sorts["profile"] = lambda r: r["profile"]
    if params.sort is None:
        params.sort, params.dir = "active", "desc"
    return paged(rows, params, text=lambda r: r["profile"], sorts=sorts, default_sort="active")
