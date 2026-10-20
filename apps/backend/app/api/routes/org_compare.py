"""Org comparison (roadmap item 9 v1; services/org_compare.py).

  GET /orgs/{org_id}/compare/targets       what this org can be compared with:
                                           its own snapshots and the other orgs
                                           the caller can open (with snapshots)
  GET /orgs/{org_id}/compare               differences, paged (category, status,
                                           unexpected, q); without `page`, all
  GET /orgs/{org_id}/compare/access        users who gain or lose access, paged
  GET /orgs/{org_id}/compare/dependencies  what references changed fields, paged
  PUT /orgs/{org_id}/compare/mapping       a namespace or a rename, per org pair
  PUT /orgs/{org_id}/compare/approval      approve (or un-approve) a difference

The left side is this org's snapshot `left` (default: its latest); the right
side is `right_org` (default: this org) at snapshot `right` (default: its
latest, or the one before the left one when comparing an org with itself).
Mappings and approvals are org admin actions, audit-logged.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.auth.deps import require_org_admin, user_can_access_org
from app.domain.models import AuditAction, AuditLog, Organization, OrgSnapshot
from app.services import org_compare as oc
from app.services import snapshots as snaps

router = APIRouter()


def _snap(s: Optional[OrgSnapshot]) -> Optional[Dict[str, Any]]:
    return None if s is None else {"id": s.id, "seq": s.seq, "takenAt": s.taken_at.isoformat(), "label": s.label,
                                   "isBaseline": s.is_baseline}


def _pair(org: Organization, right_org_id: str) -> Dict[str, Any]:
    key = "self" if right_org_id == org.id else right_org_id
    return ((org.settings or {}).get("comparisons") or {}).get(key) or {}


async def _sides(request: Request, db: AsyncSession, org_id: str, right_org: Optional[str], left: Optional[str],
                 right: Optional[str]) -> Tuple[Organization, Organization, OrgSnapshot, OrgSnapshot]:
    lorg = await db.get(Organization, org_id)
    if lorg is None:
        raise HTTPException(status_code=404, detail="Org not found")
    rid = right_org or org_id
    if rid != org_id and not await user_can_access_org(db, request.state.principal, rid):
        raise HTTPException(status_code=404, detail="Org to compare with not found")
    rorg = await db.get(Organization, rid)
    if rorg is None:
        raise HTTPException(status_code=404, detail="Org to compare with not found")
    ls = await snaps.get(db, org_id, left) if left else await snaps.latest(db, org_id)
    if ls is None:
        raise HTTPException(status_code=409, detail="No snapshot yet: sync the org first.")
    if right:
        rs = await snaps.get(db, rid, right)
    elif rid == org_id:
        rs = (await db.execute(select(OrgSnapshot).where(OrgSnapshot.organization_id == rid, OrgSnapshot.seq < ls.seq)
                               .order_by(OrgSnapshot.seq.desc()).limit(1))).scalar_one_or_none()
    else:
        rs = await snaps.latest(db, rid)
    if rs is None:
        raise HTTPException(status_code=409, detail="The other side has no snapshot to compare with.")
    return lorg, rorg, ls, rs


async def _compute(request: Request, db: AsyncSession, org_id: str, right_org: Optional[str], left: Optional[str],
                   right: Optional[str]) -> Dict[str, Any]:
    lorg, rorg, ls, rs = await _sides(request, db, org_id, right_org, left, right)
    pair = _pair(lorg, rorg.id)
    ns_map: Dict[str, str] = pair.get("namespaces") or {}
    renames: Dict[str, Dict[str, str]] = pair.get("renames") or {}
    sa, sb = await snaps.load_state(db, lorg.id, ls), await snaps.load_state(db, rorg.id, rs)
    ua = [str(u.get("Username") or "") for u in (sa.get("user") or {}).values()]
    ub = [str(u.get("Username") or "") for u in (sb.get("user") or {}).values()]
    sfa, sfb = oc.sandbox_suffix(ua, ub), oc.sandbox_suffix(ub, ua)
    skip, users_ok, note = oc.privacy_skip(lorg, rorg)
    left_f = oc.facets(sa, sfa)
    right_f = oc.apply_renames(oc.facets(sb, sfb, ns_map), renames)
    rows = oc.compare(left_f, right_f, pair.get("approved") or {}, skip)
    return {"lorg": lorg, "rorg": rorg, "ls": ls, "rs": rs, "rows": rows, "sa": sa, "sb": sb, "sfa": sfa, "sfb": sfb,
            "ns_map": ns_map, "renames": renames, "users_ok": users_ok, "note": note, "pair": pair}


def _header(c: Dict[str, Any]) -> Dict[str, Any]:
    return {"left": {"org": {"id": c["lorg"].id, "name": c["lorg"].name}, "snapshot": _snap(c["ls"])},
            "right": {"org": {"id": c["rorg"].id, "name": c["rorg"].name}, "snapshot": _snap(c["rs"])},
            "sameOrg": c["lorg"].id == c["rorg"].id, "note": c["note"],
            "mapping": {"namespaces": c["ns_map"], "renames": c["renames"]},
            "usernameSuffix": {"left": c["sfa"], "right": c["sfb"]}}


@router.get("/orgs/{org_id}/compare/targets")
async def targets(org_id: str, request: Request, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    rows = (await db.execute(select(OrgSnapshot).order_by(OrgSnapshot.seq.desc()))).scalars().all()
    by_org: Dict[str, list] = {}
    for s in rows:
        by_org.setdefault(s.organization_id, []).append(_snap(s))
    orgs = []
    for oid, items in by_org.items():
        if oid != org_id and not await user_can_access_org(db, request.state.principal, oid):
            continue
        o = await db.get(Organization, oid)
        if o is not None:
            orgs.append({"id": o.id, "name": o.name, "isDemo": o.is_demo, "self": oid == org_id, "snapshots": items})
    orgs.sort(key=lambda o: (not o["self"], str(o["name"] or "").lower()))
    return {"orgs": orgs}


@router.get("/orgs/{org_id}/compare")
async def compare(org_id: str, request: Request, right_org: Optional[str] = None, left: Optional[str] = None,
                  right: Optional[str] = None, category: Optional[str] = None,
                  status: Optional[str] = Query(None, pattern="^(only_left|only_right|different)$"),
                  unexpected: bool = False, params: PageParams = Depends(page_params),
                  db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    c = await _compute(request, db, org_id, right_org, left, right)
    rows = c["rows"]
    summary: Dict[str, Dict[str, int]] = {}
    for r in rows:
        s = summary.setdefault(r["category"], {"only_left": 0, "only_right": 0, "different": 0, "approved": 0})
        s[r["status"]] += 1
        s["approved"] += int(r["approved"])
    extra = {**_header(c), "summary": summary, "totals": {
        "differences": len(rows), "approved": sum(r["approved"] for r in rows),
        "unexpected": sum(not r["approved"] for r in rows)}}
    rows = [r for r in rows if (not category or r["category"] == category) and (not status or r["status"] == status)
            and (not unexpected or not r["approved"])]
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    order = {cat: i for i, cat in enumerate(oc.CATEGORIES)}
    sorts = {"category": lambda r: (order[r["category"]], r["key"].lower()), "item": lambda r: r["key"],
             "status": lambda r: r["status"]}
    return paged(rows, params, text=lambda r: f"{r['category']} {r['key']} {r['label']} {' '.join(r['fields'])}",
                 sorts=sorts, default_sort="category", **extra)


@router.get("/orgs/{org_id}/compare/access")
async def access(org_id: str, request: Request, right_org: Optional[str] = None, left: Optional[str] = None,
                 right: Optional[str] = None, kind: Optional[str] = Query(None, pattern="^(Object|Field)$"),
                 params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    c = await _compute(request, db, org_id, right_org, left, right)
    if not c["users_ok"]:
        raise HTTPException(status_code=409, detail=c["note"])
    field_renames = (c["renames"].get("Fields") or {})
    rows = oc.access_changes(c["sa"], c["sb"], c["sfa"], c["sfb"], c["ns_map"], field_renames)
    extra = {**_header(c), "summary": {"users": len({r["user"] for r in rows}),
                                        "gains": sum(1 for r in rows if r["gains"]), "losses": sum(1 for r in rows if r["loses"])}}
    if kind:
        rows = [r for r in rows if r["kind"] == kind]
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    sorts = {"name": lambda r: r["name"], "item": lambda r: r["item"]}
    return paged(rows, params, text=lambda r: f"{r['name']} {r['item']} {' '.join(r['gains'] + r['loses'])}",
                 sorts=sorts, default_sort="name", **extra)


@router.get("/orgs/{org_id}/compare/dependencies")
async def dependencies(org_id: str, request: Request, right_org: Optional[str] = None, left: Optional[str] = None,
                       right: Optional[str] = None, params: PageParams = Depends(page_params),
                       db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    from app.services.cleanup_impact import load_index
    c = await _compute(request, db, org_id, right_org, left, right)
    rows = oc.dependency_rows(await load_index(db, org_id), c["rows"])
    extra = {**_header(c), "basis": "References come from this org's latest sync (cleanup impact)."}
    if not params.paged:
        return {"items": rows, "total": len(rows), **extra}
    return paged(rows, params, text=lambda r: f"{r['field']} {' '.join(r['where'])}",
                 sorts={"field": lambda r: r["field"], "references": lambda r: r["references"]}, default_sort="field", **extra)


class MappingUpdate(BaseModel):
    right_org: Optional[str] = None
    namespace_right: Optional[str] = None
    namespace_left: Optional[str] = None
    category: Optional[str] = None
    left_key: Optional[str] = None
    right_key: Optional[str] = None
    remove: bool = False


class ApprovalUpdate(BaseModel):
    right_org: Optional[str] = None
    id: str
    approved: bool = True
    note: Optional[str] = None


def _save_pair(org: Organization, right_org_id: str, pair: Dict[str, Any]) -> None:
    key = "self" if right_org_id == org.id else right_org_id
    settings = dict(org.settings or {})
    comps = dict(settings.get("comparisons") or {})
    comps[key] = pair
    settings["comparisons"] = comps
    org.settings = settings
    flag_modified(org, "settings")


def _audit(db: AsyncSession, request: Request, org_id: str, what: str, data: Dict[str, Any]) -> None:
    db.add(AuditLog(organization_id=org_id, user_email=request.state.principal.email, action=AuditAction.UPDATE_SETTINGS,
                    resource_type=what, resource_id=org_id, ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"), request_method="PUT",
                    request_path=str(request.url.path), success=True, context_data=data))


@router.put("/orgs/{org_id}/compare/mapping")
async def update_mapping(org_id: str, body: MappingUpdate, request: Request, _admin: str = Depends(require_org_admin),
                         db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    rid = body.right_org or org_id
    pair = dict(_pair(org, rid))
    if body.namespace_right:
        ns = dict(pair.get("namespaces") or {})
        if body.remove:
            ns.pop(body.namespace_right, None)
        else:
            if not body.namespace_left:
                raise HTTPException(status_code=400, detail="Give the namespace on both sides.")
            ns[body.namespace_right] = body.namespace_left
        pair["namespaces"] = ns
    elif body.category and body.left_key:
        if body.category not in oc.CATEGORIES:
            raise HTTPException(status_code=400, detail="Unknown category.")
        renames = {k: dict(v) for k, v in (pair.get("renames") or {}).items()}
        cat = renames.setdefault(body.category, {})
        if body.remove:
            cat.pop(body.left_key, None)
        else:
            if not body.right_key:
                raise HTTPException(status_code=400, detail="Give the item on both sides.")
            cat[body.left_key] = body.right_key
        pair["renames"] = {k: v for k, v in renames.items() if v}
    else:
        raise HTTPException(status_code=400, detail="Give a namespace or a renamed item.")
    _save_pair(org, rid, pair)
    _audit(db, request, org_id, "comparison_mapping", {**body.model_dump(exclude_none=True)})
    await db.commit()
    return {"namespaces": pair.get("namespaces") or {}, "renames": pair.get("renames") or {}}


@router.put("/orgs/{org_id}/compare/approval")
async def update_approval(org_id: str, body: ApprovalUpdate, request: Request, _admin: str = Depends(require_org_admin),
                          db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    rid = body.right_org or org_id
    pair = dict(_pair(org, rid))
    approved = dict(pair.get("approved") or {})
    if body.approved:
        approved[body.id] = {"note": (body.note or "")[:500], "by": request.state.principal.email,
                             "at": datetime.now(timezone.utc).isoformat()}
    else:
        approved.pop(body.id, None)
    pair["approved"] = approved
    _save_pair(org, rid, pair)
    _audit(db, request, org_id, "comparison_approval", body.model_dump(exclude_none=True))
    await db.commit()
    return {"approved": len(approved)}
