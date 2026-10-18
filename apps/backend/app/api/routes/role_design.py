"""Role design mode v1 (roadmap 35b): drafts, impact preview, export.

  GET    /orgs/{org_id}/role-designs                     list drafts
  POST   /orgs/{org_id}/role-designs                     start a draft from the last sync
  GET    /orgs/{org_id}/role-designs/{draft_id}          the draft, its changes and staleness
  PUT    /orgs/{org_id}/role-designs/{draft_id}          save name / changes (validated)
  DELETE /orgs/{org_id}/role-designs/{draft_id}
  GET    /orgs/{org_id}/role-designs/{draft_id}/impact   Account and Opportunity impact
  POST   /orgs/{org_id}/role-designs/{draft_id}/export   ZIP for the client to apply
  POST   /role-designs/export                            Implementation Advisor: a
                                                         hierarchy designed from scratch

Drafts live in Newton and are never sent to Salesforce.
"""
from __future__ import annotations

import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_principal
from app.domain.models import (
    AccountShareSnapshot,
    GroupMemberSnapshot,
    GroupSnapshot,
    OpportunityShareSnapshot,
    OrganizationWideDefaultSnapshot,
    RoleDesignDraft,
    RoleSnapshot,
    SharingRuleSnapshot,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.services import privacy_mode
from app.services import role_design as rd

router = APIRouter()  # org routes, mounted behind the org guard
public_router = APIRouter()  # needs a signed-in user, no org


class DraftCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)


class DraftSave(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    operations: List[Dict[str, Any]] = Field(default_factory=list)
    position: int = Field(0, ge=0)


class ExportRequest(BaseModel):
    acknowledge_stale: bool = False


class BlankExport(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    operations: List[Dict[str, Any]] = Field(default_factory=list)


async def _current(db: AsyncSession, org_id: str):
    org = await privacy_mode.load_org(db, org_id)
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    roles = (await db.execute(select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id))).scalars().all()
    users = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id))).scalars().all() \
        if users_allowed else []
    synced = (await db.execute(
        select(func.max(SyncJob.completed_at)).where(SyncJob.organization_id == org_id,
                                                     SyncJob.status == SyncStatus.COMPLETED)
    )).scalar()
    return org, users_allowed, roles, users, rd.base_from_snapshot(roles, users, users_allowed, synced)


async def _draft(db: AsyncSession, org_id: str, draft_id: str) -> RoleDesignDraft:
    d = await db.get(RoleDesignDraft, draft_id)
    if d is None or d.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return d


def _state(d: RoleDesignDraft) -> Dict[str, Any]:
    try:
        return rd.apply_operations(d.base, list(d.operations)[: d.position])
    except rd.DesignError as e:  # stored drafts are validated on save; defensive
        raise HTTPException(status_code=409, detail=f"This draft can't be replayed: {e}")


def _names(users) -> Dict[str, str]:
    return {u.salesforce_id: (u.name or u.username or u.salesforce_id) for u in users}


def _summary(d: RoleDesignDraft) -> Dict[str, Any]:
    return {"id": d.id, "name": d.name, "created_by": d.created_by,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "changes": d.position, "started_from": (d.base or {}).get("synced_at")}


@router.get("/orgs/{org_id}/role-designs")
async def list_drafts(org_id: str, db: AsyncSession = Depends(get_database)) -> List[Dict[str, Any]]:
    rows = (await db.execute(select(RoleDesignDraft).where(RoleDesignDraft.organization_id == org_id)
                             .order_by(desc(RoleDesignDraft.updated_at)))).scalars().all()
    return [_summary(d) for d in rows]


@router.post("/orgs/{org_id}/role-designs", status_code=201)
async def create_draft(org_id: str, body: DraftCreate, db: AsyncSession = Depends(get_database),
                       actor: str = Depends(get_current_actor_email)) -> Dict[str, Any]:
    _, _, roles, _, base = await _current(db, org_id)
    if not base["roles"]:
        raise HTTPException(status_code=409, detail="No roles in the last sync. Sync the org first.")
    d = RoleDesignDraft(organization_id=org_id, name=body.name.strip(), created_by=actor, base=base,
                        operations=[], position=0)
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _summary(d)


@router.get("/orgs/{org_id}/role-designs/{draft_id}")
async def get_draft(org_id: str, draft_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    d = await _draft(db, org_id, draft_id)
    _, users_allowed, _, users, current = await _current(db, org_id)
    names = _names(users)
    return {
        **_summary(d),
        "base": d.base,
        "operations": d.operations,
        "position": d.position,
        "users": [{"id": uid, "name": names.get(uid, uid)} for uid in sorted(d.base.get("users", {}),
                                                                              key=lambda u: names.get(u, u).lower())],
        "users_allowed": users_allowed,
        "users_hidden_reason": None if users_allowed else rd_users_hidden(),
        "stale": rd.stale_changes(d.base, current),
    }


def rd_users_hidden() -> str:
    from app.services.role_hierarchy import USERS_HIDDEN
    return USERS_HIDDEN


@router.put("/orgs/{org_id}/role-designs/{draft_id}")
async def save_draft(org_id: str, draft_id: str, body: DraftSave, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    d = await _draft(db, org_id, draft_id)
    if body.position > len(body.operations):
        raise HTTPException(status_code=400, detail="position is past the last change.")
    try:
        # Every stored change must replay, including the ones redo would bring back.
        rd.apply_operations(d.base, body.operations)
        state = rd.apply_operations(d.base, body.operations[: body.position])
    except rd.DesignError as e:
        raise HTTPException(status_code=400, detail={"message": str(e), "index": e.index})
    d.operations = body.operations
    d.position = body.position
    if body.name:
        d.name = body.name.strip()
    await db.commit()
    await db.refresh(d)
    return {**_summary(d), "diff_count": rd.diff(d.base, state)["count"]}


@router.delete("/orgs/{org_id}/role-designs/{draft_id}")
async def delete_draft(org_id: str, draft_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    d = await _draft(db, org_id, draft_id)
    await db.delete(d)
    await db.commit()
    return {"deleted": draft_id}


async def _share_counts(db: AsyncSession, org_id: str) -> Dict[str, Dict[str, int]]:
    """Share rows to individual users (manual, team and rule shares; the
    sync never stores owner rows), per object."""
    out: Dict[str, Dict[str, int]] = {}
    for obj, model in (("Account", AccountShareSnapshot), ("Opportunity", OpportunityShareSnapshot)):
        rows = (await db.execute(
            select(model.user_or_group_id, func.count(model.id))
            .where(model.organization_id == org_id, model.user_or_group_id.like("005%"))
            .group_by(model.user_or_group_id)
        )).all()
        out[obj] = {uid: n for uid, n in rows}
    return out


@router.get("/orgs/{org_id}/role-designs/{draft_id}/impact")
async def draft_impact(org_id: str, draft_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    d = await _draft(db, org_id, draft_id)
    state = _state(d)
    _, users_allowed, _, users, _ = await _current(db, org_id)
    owds = {o.sobject_type: o.internal_sharing_model for o in (await db.execute(
        select(OrganizationWideDefaultSnapshot).where(OrganizationWideDefaultSnapshot.organization_id == org_id)
    )).scalars().all()}
    from app.services.record_coverage import PARTIAL_LABEL, latest_record_coverage
    cov = await latest_record_coverage(db, org_id)
    partial = any((cov.get("objects") or {}).get(o) != "full" for o in rd.OWNED_OBJECTS)
    out = rd.impact(d.base, state, users, owds, await _share_counts(db, org_id) if users_allowed else {},
                    _names(users), PARTIAL_LABEL if partial else None)
    out["users_allowed"] = users_allowed
    if not users_allowed:
        out["users_hidden_reason"] = rd_users_hidden()
    changes = rd.diff(d.base, state)
    changed_roles = {x["id"] for x in changes["reparented"]} | {r["id"] for r in changes["deleted"]} | \
        {m["from"] for m in changes["moved_users"] if m["from"]} | {m["to"] for m in changes["moved_users"] if m["to"]}
    out["references"] = rd.references(
        changed_roles,
        (await db.execute(select(SharingRuleSnapshot).where(SharingRuleSnapshot.organization_id == org_id))).scalars().all(),
        (await db.execute(select(GroupSnapshot).where(GroupSnapshot.organization_id == org_id))).scalars().all(),
        (await db.execute(select(GroupMemberSnapshot).where(GroupMemberSnapshot.organization_id == org_id))).scalars().all(),
    )
    out["changes"] = changes["count"]
    return out


def _zip_response(data: bytes, name: str, is_demo: bool) -> StreamingResponse:
    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "role-design"
    filename = f"{'demo-' if is_demo else ''}role-design-{slug}.zip"
    return StreamingResponse(io.BytesIO(data), media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/orgs/{org_id}/role-designs/{draft_id}/export")
async def export_draft(org_id: str, draft_id: str, body: ExportRequest,
                       db: AsyncSession = Depends(get_database)) -> StreamingResponse:
    d = await _draft(db, org_id, draft_id)
    state = _state(d)
    org, _, _, users, current = await _current(db, org_id)
    stale = rd.stale_changes(d.base, current)
    if stale and not body.acknowledge_stale:
        raise HTTPException(status_code=409, detail={
            "message": "Salesforce has changed since this draft started. Review the changes before exporting.",
            "stale": stale})
    data = rd.build_export(d.name, org.name if org else None, d.base, state, _names(users),
                           bool(org and org.is_demo), stale)
    return _zip_response(data, d.name, bool(org and org.is_demo))


@public_router.post("/role-designs/export")
async def export_blank(body: BlankExport, _principal=Depends(get_principal)) -> StreamingResponse:
    base = rd.empty_base()
    try:
        state = rd.apply_operations(base, body.operations)
    except rd.DesignError as e:
        raise HTTPException(status_code=400, detail={"message": str(e), "index": e.index})
    if any(op.get("op") == "move_user" for op in body.operations):
        raise HTTPException(status_code=400, detail={"message": "A design from scratch has no users.", "index": None})
    return _zip_response(rd.build_export(body.name, None, base, state, {}, False, []), body.name, False)
