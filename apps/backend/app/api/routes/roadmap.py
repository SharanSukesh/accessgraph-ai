"""Priced roadmap builder (P1; services/roadmap.py).

Firm data (the signed-in user's firm, never a client's):
  GET  /firm/rate-card                 roles and day rates
  PUT  /firm/rate-card                 admins
  GET  /firm/playbooks                 remediation playbooks (P2)
  PUT  /firm/playbooks                 admins; bumps the version
  POST /firm/playbooks/examples        admins; copies the example set,
                                       marked "example" until reviewed

Per client org:
  GET    /orgs/{org_id}/roadmaps                 the org's roadmaps
  POST   /orgs/{org_id}/roadmaps                 build one from the latest Health Report
  GET    /orgs/{org_id}/roadmaps/{id}            packages, effort, prices, phases, totals;
                                                 ?rates=firm previews a demo org's roadmap
                                                 with the firm's own rate card (on screen only)
  PUT    /orgs/{org_id}/roadmaps/{id}            {name, packages, rate_overrides}
  DELETE /orgs/{org_id}/roadmaps/{id}
  GET    /orgs/{org_id}/roadmaps/{id}/export.xlsx
  GET    /orgs/{org_id}/roadmaps/{id}/slides.pptx    closing slides (image pack renderer)
  GET    /orgs/{org_id}/roadmaps/{id}/sow.pdf        SOW appendix

Admins and analysts edit roadmaps; everyone with access reads them. Demo
orgs use the demo rate card and playbooks and are labelled demo. The firm's
own rates can be previewed on a demo roadmap's screen, but a demo org's
exports and images always use the demo rate card, and demo roadmaps take
no per-engagement rates, so real rates never leave in a demo file.
"""
from __future__ import annotations

import io
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import Principal, get_principal
from app.domain.models import (EngagementRoadmap, FirmSetting, ItemReview, OrgAnalysisSnapshot, OrgFinding, OrgUserRole,
                               Organization)
from app.services import roadmap as rm
from app.services.evidence import review_key

router = APIRouter()
firm_router = APIRouter()


def _can_edit(request: Request) -> None:
    if request.state.principal.role not in (OrgUserRole.ORG_ADMIN, OrgUserRole.ANALYST):
        raise HTTPException(status_code=403, detail="Roadmaps are edited by admins and analysts.")


def _admin(p: Principal) -> None:
    if p.role != OrgUserRole.ORG_ADMIN:
        raise HTTPException(status_code=403, detail="The firm's rate card and playbooks are edited by admins.")


async def _setting(db: AsyncSession, firm_id: str, key: str) -> Optional[FirmSetting]:
    return (await db.execute(select(FirmSetting).where(FirmSetting.firm_id == firm_id, FirmSetting.key == key))).scalar_one_or_none()


async def _put_setting(db: AsyncSession, firm_id: str, key: str, value: Dict[str, Any], who: str) -> FirmSetting:
    row = await _setting(db, firm_id, key)
    if row is None:
        row = FirmSetting(firm_id=firm_id, key=key, value=value, updated_by=who)
        db.add(row)
    else:
        row.value, row.updated_by = value, who
    await db.commit()
    await db.refresh(row)
    return row


def _meta(row: Optional[FirmSetting]) -> Dict[str, Any]:
    return {"updatedBy": row.updated_by if row else None,
            "updatedAt": row.updated_at.isoformat() if row and row.updated_at else None}


# ---------------------------------------------------------------- firm data

class RateCard(BaseModel):
    currency: str = "USD"
    roles: List[Dict[str, Any]]


@firm_router.get("/firm/rate-card")
async def get_rate_card(p: Principal = Depends(get_principal), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    row = await _setting(db, p.home_org_id, "rate_card")
    return {"currency": "USD", "roles": [], **(row.value if row else {}), **_meta(row)}


@firm_router.put("/firm/rate-card")
async def put_rate_card(body: RateCard, p: Principal = Depends(get_principal),
                        db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _admin(p)
    card = {"currency": body.currency.upper()[:3], "roles": [{"role": str(r.get("role") or "").strip(),
                                                              "dayRate": r.get("dayRate")} for r in body.roles]}
    err = rm.validate_rate_card(card)
    if err:
        raise HTTPException(status_code=400, detail=err)
    row = await _put_setting(db, p.home_org_id, "rate_card", card, p.email)
    return {**card, **_meta(row)}


class Playbooks(BaseModel):
    playbooks: List[Dict[str, Any]]


@firm_router.get("/firm/playbooks")
async def get_playbooks(p: Principal = Depends(get_principal), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    row = await _setting(db, p.home_org_id, "playbooks")
    return {"playbooks": [], "version": 0, **(row.value if row else {}), **_meta(row)}


@firm_router.put("/firm/playbooks")
async def put_playbooks(body: Playbooks, p: Principal = Depends(get_principal),
                        db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _admin(p)
    keys = [str(pb.get("key") or "") for pb in body.playbooks]
    if len(set(keys)) != len(keys):
        raise HTTPException(status_code=400, detail="Playbook keys must be unique.")
    for pb in body.playbooks:
        err = rm.validate_playbook(pb)
        if err:
            raise HTTPException(status_code=400, detail=err)
    row = await _setting(db, p.home_org_id, "playbooks")
    version = int((row.value if row else {}).get("version") or 0) + 1
    value = {"playbooks": [{**pb, "version": f"{rm.PLAYBOOK_VERSION}.{version}"} for pb in body.playbooks],
             "version": version}
    row = await _put_setting(db, p.home_org_id, "playbooks", value, p.email)
    return {**value, **_meta(row)}


@firm_router.post("/firm/playbooks/examples")
async def copy_examples(p: Principal = Depends(get_principal), db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _admin(p)
    row = await _setting(db, p.home_org_id, "playbooks")
    if row is not None and (row.value or {}).get("playbooks"):
        raise HTTPException(status_code=409, detail="The firm already has playbooks; edit them instead.")
    value = {"playbooks": rm.example_playbooks(), "version": 1}
    row = await _put_setting(db, p.home_org_id, "playbooks", value, p.email)
    return {**value, **_meta(row)}


# ---------------------------------------------------------------- roadmaps

async def _firm_card(db: AsyncSession, firm_id: str) -> Dict[str, Any]:
    card = await _setting(db, firm_id, "rate_card")
    return (card.value or {}) if card else {"roles": []}


async def _inputs(db: AsyncSession, org: Organization, firm_id: str,
                  firm_rates: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Playbooks and rate card: the demo set for demo orgs (the firm's rate
    card only when previewing on screen), else the firm's."""
    if org.is_demo:
        return rm.demo_playbooks(), (await _firm_card(db, firm_id) if firm_rates else dict(rm.DEMO_RATE_CARD))
    pbs = await _setting(db, firm_id, "playbooks")
    return ((pbs.value or {}).get("playbooks") or [] if pbs else []), await _firm_card(db, firm_id)


async def _findings(db: AsyncSession, org_id: str) -> Tuple[Optional[OrgAnalysisSnapshot], Dict[str, Dict[str, Any]]]:
    snap = (await db.execute(select(OrgAnalysisSnapshot).where(OrgAnalysisSnapshot.organization_id == org_id)
                             .order_by(desc(OrgAnalysisSnapshot.snapshot_at)).limit(1))).scalar_one_or_none()
    if snap is None:
        return None, {}
    out: Dict[str, Dict[str, Any]] = {}
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    for f in rows:
        if f.is_ignored or f.is_resolved:
            continue
        key = review_key("finding", f)
        out[key] = {"key": key, "code": f.code, "title": f.title, "severity": getattr(f.severity, "value", f.severity),
                    "category": getattr(f.category, "value", f.category), "affected": f.affected_count,
                    "savingsCents": f.estimated_annual_savings_cents}
    return snap, out


async def _reviews(db: AsyncSession, org_id: str) -> Dict[str, str]:
    rows = (await db.execute(select(ItemReview.item_key, ItemReview.status).where(
        ItemReview.organization_id == org_id, ItemReview.item_type == "finding"))).all()
    return {k: s for k, s in rows}


async def _roadmap(db: AsyncSession, org_id: str, rid: str) -> EngagementRoadmap:
    r = await db.get(EngagementRoadmap, rid)
    if r is None or r.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return r


def _summary(r: EngagementRoadmap) -> Dict[str, Any]:
    return {"id": r.id, "name": r.name, "createdBy": r.created_by, "packages": len(r.packages or []),
            "updatedAt": (r.updated_at or r.created_at).isoformat() if (r.updated_at or r.created_at) else None}


async def _full(db: AsyncSession, org: Organization, r: EngagementRoadmap, firm_id: str,
                firm_rates: bool = False) -> Dict[str, Any]:
    """The computed roadmap. `firm_rates` previews a demo org with the firm's
    rate card; exports never pass it."""
    preview = bool(org.is_demo and firm_rates)
    pbs, card = await _inputs(db, org, firm_id, preview)
    snap, findings = await _findings(db, org.id)
    overrides = {} if org.is_demo else (r.rate_overrides or {})
    result = rm.compute(r.packages or [], findings, pbs, card, overrides, await _reviews(db, org.id))
    demo_label = None
    if org.is_demo:
        demo_label = ("Demo roadmap previewed with your firm's rate card, on this screen only. Exports and images of a "
                      "demo org always use the demo rate card." if preview else
                      "Demo roadmap: synthetic org, demo rate card and example playbooks.")
    return {**_summary(r), **result, "isDemo": bool(org.is_demo), "rateOverrides": overrides,
            "rateSource": "firm-preview" if preview else ("demo" if org.is_demo else "firm"),
            "firmRatesAvailable": bool((await _firm_card(db, firm_id)).get("roles")) if org.is_demo else None,
            "healthReport": {"id": snap.id, "at": snap.snapshot_at.isoformat()} if snap else None,
            "playbooks": [{"key": p["key"], "title": p["title"], "example": bool(p.get("example"))} for p in pbs],
            "rateCardSet": bool(card.get("roles")),
            "labels": {"effort": "Effort is a range in days. Inferred effort comes from the playbook and the findings' size; "
                                 "confirmed effort was entered by a consultant.",
                       "savings": "Savings are estimated from the Health Report's findings (Salesforce list prices "
                                  "unless negotiated rates were entered).",
                       "demo": demo_label}}


@router.get("/orgs/{org_id}/roadmaps")
async def list_roadmaps(org_id: str, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    rows = (await db.execute(select(EngagementRoadmap).where(EngagementRoadmap.organization_id == org_id)
                             .order_by(desc(EngagementRoadmap.updated_at)))).scalars().all()
    return {"roadmaps": [_summary(r) for r in rows]}


class NewRoadmap(BaseModel):
    name: Optional[str] = None


@router.post("/orgs/{org_id}/roadmaps")
async def create_roadmap(org_id: str, body: NewRoadmap, request: Request,
                         db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    principal = request.state.principal
    snap, findings = await _findings(db, org_id)
    if snap is None:
        raise HTTPException(status_code=409, detail="Run the Health Report first: the roadmap is built from its findings.")
    pbs, _ = await _inputs(db, org, principal.home_org_id)
    packages = rm.build_packages(list(findings.values()), pbs, await _reviews(db, org_id))
    r = EngagementRoadmap(organization_id=org_id, name=(body.name or f"{org.name} roadmap")[:120],
                          created_by=principal.email, packages=packages, rate_overrides={})
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return await _full(db, org, r, principal.home_org_id)


@router.get("/orgs/{org_id}/roadmaps/{rid}")
async def get_roadmap(org_id: str, rid: str, request: Request, rates: Optional[str] = None,
                      db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    r = await _roadmap(db, org_id, rid)
    org = await db.get(Organization, org_id)
    assert org is not None
    return await _full(db, org, r, request.state.principal.home_org_id, firm_rates=rates == "firm")


class RoadmapUpdate(BaseModel):
    name: Optional[str] = None
    packages: Optional[List[Dict[str, Any]]] = None
    rate_overrides: Optional[Dict[str, Any]] = None


@router.put("/orgs/{org_id}/roadmaps/{rid}")
async def update_roadmap(org_id: str, rid: str, body: RoadmapUpdate, request: Request,
                         db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    r = await _roadmap(db, org_id, rid)
    principal = request.state.principal
    if body.name is not None:
        r.name = body.name.strip()[:120] or r.name
    if body.packages is not None:
        packages, err = rm.clean_packages(body.packages, r.packages or [], principal.email)
        if err:
            raise HTTPException(status_code=400, detail=err)
        r.packages = packages
    if body.rate_overrides is not None:
        org = await db.get(Organization, org_id)
        if org is not None and org.is_demo and body.rate_overrides:
            raise HTTPException(status_code=400, detail="A demo org's roadmap uses the demo rate card; it takes no "
                                                        "per-engagement rates.")
        if any(not isinstance(v, (int, float)) or v <= 0 for v in body.rate_overrides.values()):
            raise HTTPException(status_code=400, detail="Day rates must be positive numbers.")
        r.rate_overrides = {str(k): float(v) for k, v in body.rate_overrides.items()}
    await db.commit()
    await db.refresh(r)
    org = await db.get(Organization, org_id)
    assert org is not None
    return await _full(db, org, r, principal.home_org_id)


@router.delete("/orgs/{org_id}/roadmaps/{rid}")
async def delete_roadmap(org_id: str, rid: str, request: Request, db: AsyncSession = Depends(get_database)) -> Dict[str, Any]:
    _can_edit(request)
    r = await _roadmap(db, org_id, rid)
    await db.delete(r)
    await db.commit()
    return {"deleted": rid}


@router.get("/orgs/{org_id}/roadmaps/{rid}/export.xlsx")
async def export_roadmap(org_id: str, rid: str, request: Request, db: AsyncSession = Depends(get_database)) -> StreamingResponse:
    from app.services.report.roadmap_workbook import build_roadmap_workbook

    r = await _roadmap(db, org_id, rid)
    org = await db.get(Organization, org_id)
    assert org is not None
    data = await _full(db, org, r, request.state.principal.home_org_id)
    pbs, _ = await _inputs(db, org, request.state.principal.home_org_id)
    body = build_roadmap_workbook(org, data, pbs)
    return StreamingResponse(io.BytesIO(body), headers={
        "Content-Disposition": f'attachment; filename="{_file_name(r, bool(org.is_demo), "xlsx")}"'},
                             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _file_name(r: EngagementRoadmap, is_demo: bool, ext: str, suffix: str = "") -> str:
    import re
    base = re.sub(r"-+", "-", "".join(c if c.isalnum() else "-" for c in r.name)).strip("-").lower() or "roadmap"
    return f"{'demo-' if is_demo and 'demo' not in base else ''}{base}{'-' + suffix if suffix else ''}.{ext}"


async def _deliverable_inputs(db: AsyncSession, org_id: str, rid: str, request: Request) -> Tuple[EngagementRoadmap, Organization, Dict[str, Any], Any]:
    from app.api.routes.org_analyzer import _report_brand

    r = await _roadmap(db, org_id, rid)
    org = await db.get(Organization, org_id)
    assert org is not None
    data = await _full(db, org, r, request.state.principal.home_org_id)
    return r, org, data, await _report_brand(db, org_id, request)


def _unavailable(e: OSError) -> HTTPException:
    import logging
    logging.getLogger(__name__).exception("Rendering libraries missing: %s", e)
    return HTTPException(status_code=503, detail="Rendering unavailable. Check server logs.")


@router.get("/orgs/{org_id}/roadmaps/{rid}/slides.pptx")
async def roadmap_slides(org_id: str, rid: str, request: Request, db: AsyncSession = Depends(get_database)) -> StreamingResponse:
    from app.services.report.roadmap_deliverables import build_slides_pptx

    r, org, data, brand = await _deliverable_inputs(db, org_id, rid, request)
    try:
        body = build_slides_pptx(data, brand.accent_hex, org.name, bool(org.is_demo))
    except OSError as e:
        raise _unavailable(e) from None
    return StreamingResponse(io.BytesIO(body), headers={
        "Content-Disposition": f'attachment; filename="{_file_name(r, bool(org.is_demo), "pptx", "slides")}"'},
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")


@router.get("/orgs/{org_id}/roadmaps/{rid}/sow.pdf")
async def roadmap_sow(org_id: str, rid: str, request: Request, db: AsyncSession = Depends(get_database)) -> StreamingResponse:
    from app.services.report.roadmap_deliverables import build_sow_pdf

    r, org, data, brand = await _deliverable_inputs(db, org_id, rid, request)
    try:
        body = build_sow_pdf(data, org.name, brand.firm_name, brand.accent_hex)
    except OSError as e:
        raise _unavailable(e) from None
    return StreamingResponse(io.BytesIO(body), headers={
        "Content-Disposition": f'attachment; filename="{_file_name(r, bool(org.is_demo), "pdf", "sow-appendix")}"'},
        media_type="application/pdf")
