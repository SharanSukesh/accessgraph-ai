"""Versioned snapshots (roadmap item 21; services/snapshots.py).

  GET /orgs/{org_id}/snapshots                     newest first, paged
  GET /orgs/{org_id}/snapshots/{id}/changes        what changed against another
                                                   snapshot (`against`, default
                                                   the previous one), one row per
                                                   item with readable names;
                                                   paged, filters entity and
                                                   change, q; without `page`,
                                                   every row (for the CSV)
  PUT /orgs/{org_id}/snapshots/{id}                label, baseline (org admins;
                                                   audit-logged)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.auth.deps import require_org_admin
from app.domain.models import AuditAction, AuditLog, OrgSnapshot
from app.services import snapshots as snaps

router = APIRouter()


def _row(s: OrgSnapshot) -> Dict[str, Any]:
    changed = {k: sum(v.values()) for k, v in (s.changes or {}).items()}
    return {"id": s.id, "seq": s.seq, "takenAt": s.taken_at.isoformat(), "source": s.source, "label": s.label,
            "items": sum((s.counts or {}).values()), "changes": sum(changed.values()), "changesByEntity": s.changes or {},
            "isBaseline": s.is_baseline, "baselineNote": s.baseline_note, "baselineBy": s.baseline_by,
            "privacyMode": s.privacy_mode}


@router.get("/orgs/{org_id}/snapshots")
async def list_snapshots(org_id: str, params: PageParams = Depends(page_params),
                         db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    rows = [_row(s) for s in (await db.execute(select(OrgSnapshot).where(OrgSnapshot.organization_id == org_id)
                                                .order_by(OrgSnapshot.seq.desc()))).scalars()]
    if params.page is None:
        params.page, params.page_size = 1, 100
    return paged(rows, params, text=lambda r: f"{r['label'] or ''} {r['source']}", sorts={"seq": lambda r: r["seq"]},
                 default_sort=None)


def _names(*states: Dict[str, Dict[str, Dict[str, Any]]]) -> Dict[str, str]:
    """Id -> readable name, from users, sets, groups, profiles and roles in either snapshot."""
    out: Dict[str, str] = {}
    for st in states:
        for entity, field in (("user", "Name"), ("permission_set", "Label"), ("permission_set_group", "MasterLabel"),
                              ("profile", "Name"), ("role", "Name"), ("public_group", "Name")):
            for key, data in (st.get(entity) or {}).items():
                name = data.get(field) or data.get("Name")
                if name:
                    out[key] = name
    # A profile's own permission set reads as the profile.
    for st in states:
        for key, data in (st.get("permission_set") or {}).items():
            if data.get("IsOwnedByProfile") and data.get("ProfileId") in out:
                out[key] = f"{out[data['ProfileId']]} (profile)"
    return out


def _describe(row: Dict[str, Any], names: Dict[str, str]) -> str:
    key = row["key"]
    n = lambda i: names.get(i, i)  # noqa: E731
    if row["entity"] in ("assignment", "group_component", "group_member") and ":" in key:
        a, b = key.split(":", 1)
        return f"{n(a)} → {n(b)}"
    if row["entity"] in ("object_permission", "field_permission") and ":" in key:
        a, b = key.split(":", 1)
        return f"{n(a)}: {b}"
    return n(key)


@router.get("/orgs/{org_id}/snapshots/{snapshot_id}/changes")
async def snapshot_changes(org_id: str, snapshot_id: str, against: Optional[str] = Query(None),
                           entity: Optional[str] = Query(None), change: Optional[str] = Query(None, pattern="^(added|removed|changed)$"),
                           params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    b = await snaps.get(db, org_id, snapshot_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    if against:
        a = await snaps.get(db, org_id, against)
        if a is None:
            raise HTTPException(status_code=404, detail="Snapshot to compare against not found")
    else:
        a = (await db.execute(select(OrgSnapshot).where(OrgSnapshot.organization_id == org_id, OrgSnapshot.seq < b.seq)
                              .order_by(OrgSnapshot.seq.desc()).limit(1))).scalar_one_or_none()
    extra: Dict[str, Any] = {"snapshot": _row(b), "against": _row(a) if a else None}
    if a is None:
        rows: list = []
    else:
        rows = await snaps.diff(db, org_id, a, b)
        names = _names(await snaps.load_state(db, org_id, a, ["user", "permission_set", "permission_set_group", "profile", "role", "public_group"]),
                       await snaps.load_state(db, org_id, b, ["user", "permission_set", "permission_set_group", "profile", "role", "public_group"]))
        for r in rows:
            r["name"] = _describe(r, names)
    summary: Dict[str, Dict[str, int]] = {}
    for r in rows:
        summary.setdefault(r["entity"], {"added": 0, "removed": 0, "changed": 0})[r["change"]] += 1
    extra["summary"] = summary
    extra["labels"] = {e: snaps.ENTITY_LABELS.get(e, e) for e in summary}
    rows = [r for r in rows if (not entity or r["entity"] == entity) and (not change or r["change"] == change)]
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    sorts = {"entity": lambda r: (r["entityLabel"], r["name"]), "name": lambda r: r["name"], "change": lambda r: r["change"]}
    return paged(rows, params, text=lambda r: f"{r['entityLabel']} {r['name']} {r['key']} {' '.join(r['fields'])}",
                 sorts=sorts, default_sort="entity", **extra)


class SnapshotUpdate(BaseModel):
    label: Optional[str] = None
    is_baseline: Optional[bool] = None
    baseline_note: Optional[str] = None


@router.put("/orgs/{org_id}/snapshots/{snapshot_id}")
async def update_snapshot(org_id: str, snapshot_id: str, body: SnapshotUpdate, request: Request,
                          _admin: str = Depends(require_org_admin), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    s = await snaps.get(db, org_id, snapshot_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    actor = request.state.principal.email
    if body.label is not None:
        s.label = body.label.strip()[:120] or None
    if body.is_baseline is not None:
        s.is_baseline = body.is_baseline
        s.baseline_by = actor if body.is_baseline else None
        s.baseline_note = (body.baseline_note or "")[:500] or None if body.is_baseline else None
    db.add(AuditLog(organization_id=org_id, user_email=actor, action=AuditAction.UPDATE_SETTINGS,
                    resource_type="org_snapshot", resource_id=snapshot_id,
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"), request_method="PUT",
                    request_path=str(request.url.path), success=True,
                    context_data=body.model_dump(exclude_none=True)))
    await db.commit()
    return _row(s)
