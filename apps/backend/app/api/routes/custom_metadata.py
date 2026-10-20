"""Custom metadata records, opt-in per type (roadmap item 11 part c2).

  GET /orgs/{org_id}/custom-metadata   the types from the last sync, paged
                                       (page, page_size, q; enabled=true for
                                       the ones turned on), with whether each
                                       is on and how many records were read
  PUT /orgs/{org_id}/custom-metadata   {types: [...], note}: the types whose
                                       records are read from the next sync;
                                       org admins only, audit-logged; types
                                       turned off have their stored records
                                       removed now
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.auth.deps import require_org_admin
from app.domain.models import AuditAction, AuditLog, Organization
from app.services import custom_metadata as cmdt
from app.services.org_docs import latest_org_docs

router = APIRouter()


@router.get("/orgs/{org_id}/custom-metadata")
async def list_types(org_id: str, enabled: Optional[bool] = Query(None), params: PageParams = Depends(page_params),
                     db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    on = cmdt.enabled_types(org)
    docs = await latest_org_docs(db, org_id) or {}
    listed = docs.get("custom_metadata_types")
    stored = docs.get("custom_metadata_records") or {}
    rows: List[Dict[str, Any]] = [
        {"name": t["name"], "label": t.get("label"), "enabled": t["name"] in on,
         "records": len(stored[t["name"]]["records"]) if t["name"] in stored and t["name"] in on else None}
        for t in listed or []]
    # Types turned on that the last sync didn't list (removed, or not synced since).
    rows += [{"name": n, "label": None, "enabled": True, "records": None, "missing": True}
             for n in sorted(on - {r["name"] for r in rows})]
    summary = {"types": len(listed or []), "enabled": len(on), "enabledTypes": sorted(on), "listed": listed is not None,
               **{k: v for k, v in cmdt.record_of(org).items() if k in ("changed_by", "changed_at", "note")}}
    if enabled is not None:
        rows = [r for r in rows if r["enabled"] == enabled]
    if params.page is None:
        params.page = 1
        params.page_size = 100
    # Turned-on types first, then by name.
    sorts = {"name": lambda r: r["name"], "enabled": lambda r: (not r["enabled"], r["name"].lower())}
    return paged(rows, params, text=lambda r: f"{r['name']} {r.get('label') or ''}", sorts=sorts,
                 default_sort="enabled", summary=summary)


class TypesUpdate(BaseModel):
    types: List[str]
    note: Optional[str] = None


@router.put("/orgs/{org_id}/custom-metadata")
async def update_types(org_id: str, body: TypesUpdate, request: Request, _admin: str = Depends(require_org_admin),
                       db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    bad = [t for t in body.types if not cmdt.is_type(t)]
    if bad:
        raise HTTPException(status_code=400, detail=f"Not custom metadata types (they end in __mdt): {', '.join(bad)}")
    before = cmdt.enabled_types(org)
    actor = request.state.principal.email
    record = cmdt.set_enabled(org, body.types, actor, body.note)
    removed = await cmdt.purge(db, org_id, set(record["types"]))
    db.add(AuditLog(
        organization_id=org_id, user_email=actor, action=AuditAction.UPDATE_SETTINGS,
        resource_type="custom_metadata_records", resource_id=org_id,
        ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"),
        request_method="PUT", request_path=str(request.url.path), success=True,
        context_data={**record, "turned_on": sorted(set(record["types"]) - before),
                      "turned_off": sorted(before - set(record["types"]))},
    ))
    await db.commit()
    return {**record, "records_removed_for": removed}
