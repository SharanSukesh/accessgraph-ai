"""What-if simulator (roadmap item 15; services/access_sim.py).

  GET    /orgs/{org_id}/what-if/drafts               the org's scenarios
  POST   /orgs/{org_id}/what-if/drafts               new: {name, preset} or
                                                     {name, restructure_moves:[ids]}
                                                     or empty; starts from the
                                                     latest snapshot
  GET    /orgs/{org_id}/what-if/drafts/{id}          with its staged changes
  PUT    /orgs/{org_id}/what-if/drafts/{id}          {name, operations}
  DELETE /orgs/{org_id}/what-if/drafts/{id}
  GET    /orgs/{org_id}/what-if/drafts/{id}/impact   view=users|changes|items|paths|sources,
                                                     paged; summary and what can't
                                                     be predicted on every page
  POST   /orgs/{org_id}/what-if/preview            {restructure_moves:[ids]}: the summary,
                                                     the top objects and what can't be
                                                     predicted, without saving a scenario
                                                     (Restructure Studio's move drawer)
  GET    /orgs/{org_id}/what-if/catalog              users, sets, groups, roles,
                                                     objects of the starting state,
                                                     paged, for building changes

Admins and analysts edit; everyone with access can read. Nothing is sent to
Salesforce. At Metadata only, per-user views are left out; the per-source
view (profiles, sets, groups) remains.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.domain.models import AccessDraft, OrgSnapshot, OrgUserRole, Organization, RestructureMove
from app.services import access_sim as sim
from app.services import privacy_mode
from app.services import snapshots as snaps

router = APIRouter()
VIEWS = ("users", "changes", "items", "paths", "sources")
USER_VIEWS = {"users", "changes", "paths"}


def _can_edit(request: Request) -> None:
    if request.state.principal.role not in (OrgUserRole.ORG_ADMIN, OrgUserRole.ANALYST):
        raise HTTPException(status_code=403, detail="Scenarios are edited by admins and analysts.")


async def _draft(db: AsyncSession, org_id: str, draft_id: str) -> AccessDraft:
    d = await db.get(AccessDraft, draft_id)
    if d is None or d.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return d


async def _base(db: AsyncSession, d: AccessDraft) -> tuple:
    snap = await db.get(OrgSnapshot, d.base_snapshot_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="The snapshot this scenario starts from is gone.")
    return snap, await snaps.load_state(db, d.organization_id, snap)


def _summary(d: AccessDraft, snap: OrgSnapshot) -> Dict[str, Any]:
    return {"id": d.id, "name": d.name, "source": d.source, "createdBy": d.created_by, "operations": len(d.operations or []),
            "updatedAt": (d.updated_at or d.created_at).isoformat() if (d.updated_at or d.created_at) else None,
            "base": {"id": snap.id, "label": snap.label or f"Snapshot {snap.seq}", "takenAt": snap.taken_at.isoformat()}}


@router.get("/orgs/{org_id}/what-if/drafts")
async def list_drafts(org_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    out = []
    for d in (await db.execute(select(AccessDraft).where(AccessDraft.organization_id == org_id)
                               .order_by(desc(AccessDraft.updated_at)))).scalars():
        snap = await db.get(OrgSnapshot, d.base_snapshot_id)
        if snap is not None:
            out.append(_summary(d, snap))
    return {"drafts": out}


class NewDraft(BaseModel):
    name: Optional[str] = None
    preset: Optional[str] = None
    restructure_moves: Optional[List[str]] = None


def _from_moves(moves: List[RestructureMove]) -> List[Dict[str, Any]]:
    """Restructure Studio's accepted moves as staged changes."""
    ops: List[Dict[str, Any]] = []
    for m in moves:
        kind = m.move_type
        if kind == "MERGE_PERMISSION_SETS" and m.primary_component_id:
            ops += [{"op": "merge_into", "set": sid, "into": m.primary_component_id}
                    for sid in (m.affected_component_ids or []) if sid != m.primary_component_id]
        elif kind == "RETIRE_UNUSED_PS" and m.primary_component_id:
            ops.append({"op": "remove_set", "set": m.primary_component_id})
        else:
            ops.append({"op": "sharing_rule", "description": f"{kind.replace('_', ' ').title()}: {m.primary_component_name or ''}".strip()})
    return ops


@router.post("/orgs/{org_id}/what-if/drafts")
async def create_draft(org_id: str, body: NewDraft, request: Request, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    snap = await snaps.latest(db, org_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="No snapshot yet: sync the org first.")
    name: str = body.name or "New scenario"
    ops: List[Dict[str, Any]] = []
    source: Optional[str] = None
    if body.preset:
        state = await snaps.load_state(db, org_id, snap)
        try:
            name, ops = sim.preset(body.preset, state)
        except KeyError as e:
            raise HTTPException(status_code=400, detail=str(e.args[0])) from None
        source = body.preset
    elif body.restructure_moves:
        moves = (await db.execute(select(RestructureMove).where(RestructureMove.organization_id == org_id,
                                                                RestructureMove.id.in_(body.restructure_moves)))).scalars().all()
        order = {mid: i for i, mid in enumerate(body.restructure_moves)}
        ops, source = _from_moves(sorted(moves, key=lambda m: order[m.id])), "restructure"
        name = body.name or f"Restructure: {len(moves)} moves"
    d = AccessDraft(organization_id=org_id, name=name[:120], created_by=request.state.principal.email,
                    base_snapshot_id=snap.id, operations=ops, source=source)
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _summary(d, snap)


@router.get("/orgs/{org_id}/what-if/drafts/{draft_id}")
async def get_draft(org_id: str, draft_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    d = await _draft(db, org_id, draft_id)
    snap, state = await _base(db, d)
    after = sim.apply(state, d.operations or [])  # names of groups the draft creates
    return {**_summary(d, snap), "changes": [{**op, "index": i, "text": sim.describe(op, state, after)}
                                            for i, op in enumerate(d.operations or [])]}


class DraftUpdate(BaseModel):
    name: Optional[str] = None
    operations: Optional[List[Dict[str, Any]]] = None


@router.put("/orgs/{org_id}/what-if/drafts/{draft_id}")
async def update_draft(org_id: str, draft_id: str, body: DraftUpdate, request: Request,
                       db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    d = await _draft(db, org_id, draft_id)
    if body.name is not None:
        d.name = body.name.strip()[:120] or d.name
    if body.operations is not None:
        bad = [op for op in body.operations if op.get("op") not in sim.OPS]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown change: {bad[0].get('op')}")
        d.operations = [{k: v for k, v in op.items() if k not in ("index", "text")} for op in body.operations]
    await db.commit()
    await db.refresh(d)
    snap = await db.get(OrgSnapshot, d.base_snapshot_id)
    return _summary(d, snap) if snap else {"id": d.id}


@router.delete("/orgs/{org_id}/what-if/drafts/{draft_id}")
async def delete_draft(org_id: str, draft_id: str, request: Request, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    d = await _draft(db, org_id, draft_id)
    await db.delete(d)
    await db.commit()
    return {"deleted": draft_id}


USERS_NOTE = ("User and role counts need a privacy level that keeps users; this org is at Metadata only. "
              "The changes per profile, permission set and group are shown.")


def _privacy_extra(result: Dict[str, Any], users_ok: bool, n_ops: int) -> Dict[str, Any]:
    """The summary and notes every impact response carries. At Metadata only
    there are no user or role counts at all, only the operation count."""
    return {"summary": result["summary"] if users_ok else {"operations": n_ops},
            "unpredictable": result["unpredictable"], "usersAllowed": users_ok,
            "note": None if users_ok else USERS_NOTE}


class Preview(BaseModel):
    restructure_moves: List[str]


@router.post("/orgs/{org_id}/what-if/preview")
async def preview(org_id: str, body: Preview, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    snap = await snaps.latest(db, org_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="No snapshot yet: sync the org first.")
    org = await db.get(Organization, org_id)
    users_ok = org is not None and privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    moves = (await db.execute(select(RestructureMove).where(RestructureMove.organization_id == org_id,
                                                            RestructureMove.id.in_(body.restructure_moves)))).scalars().all()
    order = {mid: i for i, mid in enumerate(body.restructure_moves)}
    ops = _from_moves(sorted(moves, key=lambda m: order[m.id]))
    result = sim.simulate(await snaps.load_state(db, org_id, snap), ops)
    return {**_privacy_extra(result, users_ok, len(ops)), "base": {"label": snap.label or f"Snapshot {snap.seq}"},
            "computed": any(op["op"] != "sharing_rule" for op in ops),
            "items": result["items"][:10] if users_ok else [], "itemsTotal": len(result["items"]) if users_ok else 0,
            "sources": result["sources"][:10], "sourcesTotal": len(result["sources"]),
            # Profiles are configuration; the user count goes with the privacy level.
            "profileMoves": [{**m, "users": m["users"] if users_ok else None} for m in result["profileMoves"]]}


@router.get("/orgs/{org_id}/what-if/drafts/{draft_id}/impact")
async def impact(org_id: str, draft_id: str, view: str = Query("users"), params: PageParams = Depends(page_params),
                 db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    if view not in VIEWS:
        raise HTTPException(status_code=400, detail=f"view must be one of {', '.join(VIEWS)}")
    d = await _draft(db, org_id, draft_id)
    org = await db.get(Organization, org_id)
    users_ok = org is not None and privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    snap, state = await _base(db, d)
    result = sim.simulate(state, d.operations or [])
    extra = {"view": view, **_privacy_extra(result, users_ok, len(d.operations or []))}
    if view in USER_VIEWS and not users_ok:
        raise HTTPException(status_code=409, detail=extra["note"])
    rows = result[view]
    texts = {
        "users": lambda r: f"{r['name']} {r['profile'] or ''} {r['role'] or ''} {' '.join(r['reasons'])}",
        "changes": lambda r: f"{r['name']} {r['kind']} {r['item']}",
        "items": lambda r: f"{r['kind']} {r['item']}",
        "paths": lambda r: f"{r['name']} {r['object']} {' '.join(r['via'])} {r['change']}",
        "sources": lambda r: f"{r['source']} {r['object']}",
    }
    sorts = {
        "users": {"name": lambda r: r["name"], "losses": lambda r: r["losses"], "gains": lambda r: r["gains"]},
        "changes": {"name": lambda r: r["name"], "item": lambda r: r["item"]},
        "items": {"item": lambda r: r["item"], "losing": lambda r: r["usersLosing"], "gaining": lambda r: r["usersGaining"]},
        "paths": {"name": lambda r: r["name"], "object": lambda r: r["object"]},
        "sources": {"source": lambda r: r["source"], "object": lambda r: r["object"]},
    }[view]
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    default = {"users": "losses", "changes": "name", "items": None, "paths": "name", "sources": "source"}[view]
    if params.sort is None and view == "users":
        params.sort, params.dir = "losses", "desc"
    return paged(rows, params, text=texts[view], sorts=sorts, default_sort=default, **extra)


@router.get("/orgs/{org_id}/what-if/catalog")
async def catalog(org_id: str, kind: str = Query("sets", pattern="^(users|sets|groups|roles|objects)$"),
                  params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    snap = await snaps.latest(db, org_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="No snapshot yet: sync the org first.")
    st = await snaps.load_state(db, org_id, snap, ["user", "permission_set", "permission_set_group", "role", "object_permission",
                                                   "profile"])
    profiles: Dict[Any, Any] = {k: v.get("Name") for k, v in (st.get("profile") or {}).items()}
    if kind == "users":
        rows = [{"id": k, "name": v.get("Name") or k, "detail": profiles.get(v.get("ProfileId"))}
                for k, v in (st.get("user") or {}).items() if v.get("IsActive")]
    elif kind == "sets":
        rows = [{"id": k, "name": v.get("Label") or v.get("Name") or k, "detail": v.get("Name")}
                for k, v in (st.get("permission_set") or {}).items()
                if not v.get("IsOwnedByProfile") and v.get("Type") not in ("Muting", "Group")]
    elif kind == "groups":
        rows = [{"id": k, "name": v.get("MasterLabel") or v.get("DeveloperName") or k, "detail": v.get("DeveloperName")}
                for k, v in (st.get("permission_set_group") or {}).items()]
    elif kind == "roles":
        rows = [{"id": k, "name": v.get("Name") or k, "detail": v.get("DeveloperName")} for k, v in (st.get("role") or {}).items()]
    else:
        names = sorted({str(p.get("SobjectType")) for p in (st.get("object_permission") or {}).values() if p.get("SobjectType")})
        rows = [{"id": n, "name": n, "detail": None} for n in names]
    if params.page is None:
        params.page = 1
    return paged(rows, params, text=lambda r: f"{r['name']} {r['detail'] or ''}", sorts={"name": lambda r: r["name"]},
                 default_sort="name", kind=kind)
