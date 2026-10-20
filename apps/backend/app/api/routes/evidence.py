"""Evidence, reviews and validation (roadmap items 20 and 10).

  GET /orgs/{org_id}/evidence/{kind}/{item_id}   the evidence block and the
                                                 review of a finding, anomaly
                                                 or recommendation
  PUT /orgs/{org_id}/reviews                      review one (admins and
                                                 analysts): useful, not useful
                                                 or expected, with a reason;
                                                 status null clears it
  GET /orgs/{org_id}/validation                   the validation report: counts
                                                 and precision overall, by
                                                 module and by type, never a
                                                 single score; demo reviews
                                                 are labelled and never count
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.domain.models import (AccessAnomaly, AuditAction, AuditLog, ItemReview, OrgAnalysisSnapshot, OrgFinding,
                               OrgUserRole, Organization, Recommendation)
from app.services import evidence as ev

router = APIRouter()
KINDS: Dict[str, Any] = {"finding": OrgFinding, "anomaly": AccessAnomaly, "recommendation": Recommendation}
STATUSES = ("useful", "not_useful", "expected")


async def _item(db: AsyncSession, org_id: str, kind: str, item_id: str) -> Any:
    model = KINDS.get(kind)
    if model is None:
        raise HTTPException(status_code=400, detail=f"kind must be one of {', '.join(KINDS)}")
    item = await db.get(model, item_id)
    if item is None or item.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Not found")
    return item


def _module_and_group(kind: str, item: Any) -> tuple:
    if kind == "finding":
        return "Health Report", str(getattr(item.category, "value", item.category))
    if kind == "anomaly":
        return ("Session anomalies" if item.category == "session" else "Access anomalies",
                (item.peer_stats or {}).get("anomaly_type") or item.category)
    return "Priority Actions", str(getattr(item.rec_type, "value", item.rec_type))


def _review(r: Optional[ItemReview]) -> Optional[Dict[str, Any]]:
    return None if r is None else {"status": r.status, "reason": r.reason, "reviewer": r.reviewer,
                                   "at": (r.updated_at or r.created_at).isoformat() if (r.updated_at or r.created_at) else None,
                                   "isDemo": r.is_demo}


@router.get("/orgs/{org_id}/evidence/{kind}/{item_id}")
async def get_evidence(org_id: str, kind: str, item_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    item = await _item(db, org_id, kind, item_id)
    ctx = await ev.load_context(db, org_id)
    if kind == "finding":
        snap = await db.get(OrgAnalysisSnapshot, item.snapshot_id)
        block = ev.for_finding(item, ctx, snap.snapshot_at if snap else None)
    elif kind == "anomaly":
        block = ev.for_anomaly(item, ctx)
    else:
        block = ev.for_recommendation(item, ctx)
    key = ev.review_key(kind, item)
    review = (await db.execute(select(ItemReview).where(ItemReview.organization_id == org_id,
                                                        ItemReview.item_key == key))).scalar_one_or_none()
    return {"evidence": block, "review": _review(review), "reviewKey": key}


class ReviewBody(BaseModel):
    kind: str
    item_id: str
    status: Optional[str] = None
    reason: Optional[str] = None


@router.put("/orgs/{org_id}/reviews")
async def put_review(org_id: str, body: ReviewBody, request: Request, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    principal = request.state.principal
    if principal.role not in (OrgUserRole.ORG_ADMIN, OrgUserRole.ANALYST):
        raise HTTPException(status_code=403, detail="Reviews are for admins and analysts.")
    if body.status is not None and body.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {', '.join(STATUSES)}")
    item = await _item(db, org_id, body.kind, body.item_id)
    org = await db.get(Organization, org_id)
    key = ev.review_key(body.kind, item)
    row = (await db.execute(select(ItemReview).where(ItemReview.organization_id == org_id,
                                                     ItemReview.item_key == key))).scalar_one_or_none()
    if body.status is None:
        if row is not None:
            await db.delete(row)
    else:
        module, group = _module_and_group(body.kind, item)
        title = getattr(item, "title", None) or f"{module}: {group}"
        if row is None:
            row = ItemReview(organization_id=org_id, item_type=body.kind, item_key=key, module=module, group=group,
                             status=body.status)
            db.add(row)
        row.status, row.reason = body.status, (body.reason or "").strip()[:2000] or None
        row.reviewer, row.title, row.is_demo = principal.email, (title or "")[:500], bool(org and org.is_demo)
        row.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(organization_id=org_id, user_email=principal.email, action=AuditAction.UPDATE_SETTINGS,
                    resource_type="item_review", resource_id=key, ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"), request_method="PUT", request_path=str(request.url.path),
                    success=True, context_data={"status": body.status}))
    await db.commit()
    return {"reviewKey": key, "review": _review(row) if body.status else None}


def _tally(rows: List[ItemReview]) -> Dict[str, Any]:
    useful = sum(r.status == "useful" for r in rows)
    not_useful = sum(r.status == "not_useful" for r in rows)
    expected = sum(r.status == "expected" for r in rows)
    judged = useful + not_useful
    return {"reviewed": len(rows), "useful": useful, "notUseful": not_useful, "expected": expected,
            "precision": round(useful / judged, 3) if judged else None}


@router.get("/orgs/{org_id}/validation")
async def validation(org_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    rows = list((await db.execute(select(ItemReview).where(ItemReview.organization_id == org_id)
                                  .order_by(desc(ItemReview.updated_at)))).scalars())
    counted = [r for r in rows if not r.is_demo]
    dates = [r.updated_at or r.created_at for r in rows if (r.updated_at or r.created_at)]
    period = (min(dates).date().isoformat(), max(dates).date().isoformat()) if dates else None
    by_module: Dict[str, List[ItemReview]] = {}
    by_group: Dict[str, List[ItemReview]] = {}
    for r in counted:
        by_module.setdefault(r.module, []).append(r)
        by_group.setdefault(f"{r.module} · {r.group or 'other'}", []).append(r)
    title = f"Validation: {org.name}" + (f", {period[0]} to {period[1]}" if period else "")
    return {
        "title": title, "org": org.name, "period": period, "isDemo": org.is_demo,
        "note": ("Reviews on a demo org are labelled demo and never count towards validation." if org.is_demo else
                 "Precision is useful ÷ (useful + not useful); expected items are approved exceptions and don't count either way."),
        "overall": _tally(counted),
        "demoReviews": len(rows) - len(counted),
        "byModule": [{"module": m, **_tally(v)} for m, v in sorted(by_module.items())],
        "byType": [{"type": g, **_tally(v)} for g, v in sorted(by_group.items())],
        "recent": [{"title": r.title, "module": r.module, "status": r.status, "reason": r.reason, "reviewer": r.reviewer,
                    "at": (r.updated_at or r.created_at).isoformat() if (r.updated_at or r.created_at) else None,
                    "isDemo": r.is_demo} for r in rows[:50]],
    }
