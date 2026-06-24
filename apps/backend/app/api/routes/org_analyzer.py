"""Org Analyzer API routes.

Exposes the consulting-grade org-health analyzer:

- POST  /orgs/{org_id}/org-analyzer/run                 — kick off a run
- GET   /orgs/{org_id}/org-analyzer/latest              — latest snapshot summary
- GET   /orgs/{org_id}/org-analyzer/findings            — paginated findings
- GET   /orgs/{org_id}/org-analyzer/findings/{id}       — single finding
- GET   /orgs/{org_id}/org-analyzer/history             — snapshot trend
- GET   /orgs/{org_id}/org-analyzer/report.pdf          — server-rendered PDF
- GET   /orgs/{org_id}/org-analyzer/price-book          — read price book
- PUT   /orgs/{org_id}/org-analyzer/price-book          — write price book
"""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_current_org
from app.domain.models import (
    FindingCategory,
    FindingSeverity,
    LicensePriceBook,
    OrgAnalysisSnapshot,
    OrgFinding,
    Organization,
)
from app.services.org_analyzer import (
    DEFAULT_PRICE_BOOK_CENTS,
    OrgAnalyzerService,
)


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class FindingResponse(BaseModel):
    id: str
    category: str
    code: str
    severity: str
    title: str
    description: str
    recommended_action: Optional[str]
    affected_count: int
    estimated_annual_savings_cents: Optional[int]
    evidence: Dict[str, Any]
    sf_setup_deeplink: Optional[str]

    @classmethod
    def from_orm(cls, f: OrgFinding) -> "FindingResponse":
        return cls(
            id=f.id,
            category=f.category.value if isinstance(f.category, FindingCategory) else str(f.category),
            code=f.code,
            severity=f.severity.value if isinstance(f.severity, FindingSeverity) else str(f.severity),
            title=f.title,
            description=f.description,
            recommended_action=f.recommended_action,
            affected_count=f.affected_count,
            estimated_annual_savings_cents=f.estimated_annual_savings_cents,
            evidence=f.evidence or {},
            sf_setup_deeplink=f.sf_setup_deeplink,
        )


class SnapshotSummary(BaseModel):
    snapshot_id: Optional[str]
    snapshot_at: Optional[str]
    findings_count: int
    findings_by_severity: Dict[str, int]
    findings_by_category: Dict[str, int]
    total_estimated_annual_savings_cents: int
    metrics: Dict[str, Any]
    org_limits: Dict[str, Any]
    has_data: bool


class FindingsPage(BaseModel):
    total: int
    snapshot_id: Optional[str]
    findings: List[FindingResponse]


class HistoryPoint(BaseModel):
    snapshot_id: str
    snapshot_at: str
    findings_count: int
    total_estimated_annual_savings_cents: int
    findings_by_severity: Dict[str, int]


class PriceBookRow(BaseModel):
    license_name: str
    monthly_cost_cents: int = Field(ge=0)


class PriceBookResponse(BaseModel):
    rows: List[PriceBookRow]


class PriceBookUpdate(BaseModel):
    rows: List[PriceBookRow]


class RunResponse(BaseModel):
    snapshot_id: str
    snapshot_at: str
    findings_count: int
    total_estimated_annual_savings_cents: int


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's analyzer data.",
        )


async def _latest_snapshot(
    db: AsyncSession, org_id: str
) -> Optional[OrgAnalysisSnapshot]:
    result = await db.execute(
        select(OrgAnalysisSnapshot)
        .where(OrgAnalysisSnapshot.organization_id == org_id)
        .order_by(desc(OrgAnalysisSnapshot.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/org-analyzer/run",
    response_model=RunResponse,
)
async def run_org_analyzer(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off an Org Analyzer run synchronously.

    Synchronous in v1 — runs complete in 5-30s for most orgs since the
    heavy data is already in our snapshots. Push to a background job if
    runtime grows beyond ~60s.
    """
    _enforce_same_org(org_id, current_org_id)
    service = OrgAnalyzerService(db, org_id)
    try:
        snapshot = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception("Org analyzer run crashed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Org analyzer run failed: {e}",
        )
    return RunResponse(
        snapshot_id=snapshot.id,
        snapshot_at=snapshot.snapshot_at.isoformat(),
        findings_count=snapshot.findings_count,
        total_estimated_annual_savings_cents=snapshot.total_estimated_annual_savings_cents,
    )


@router.get(
    "/orgs/{org_id}/org-analyzer/latest",
    response_model=SnapshotSummary,
)
async def get_latest_snapshot(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> SnapshotSummary:
    """Headline summary of the most recent analyzer run.

    Returns an empty-but-valid payload if the analyzer has never run for
    this org, so the dashboard renders cleanly on first visit.
    """
    _enforce_same_org(org_id, current_org_id)
    snap = await _latest_snapshot(db, org_id)
    if snap is None:
        return SnapshotSummary(
            snapshot_id=None,
            snapshot_at=None,
            findings_count=0,
            findings_by_severity={},
            findings_by_category={},
            total_estimated_annual_savings_cents=0,
            metrics={},
            org_limits={},
            has_data=False,
        )
    return SnapshotSummary(
        snapshot_id=snap.id,
        snapshot_at=snap.snapshot_at.isoformat(),
        findings_count=snap.findings_count,
        findings_by_severity=snap.findings_by_severity or {},
        findings_by_category=snap.findings_by_category or {},
        total_estimated_annual_savings_cents=snap.total_estimated_annual_savings_cents,
        metrics=snap.metrics or {},
        org_limits=snap.org_limits or {},
        has_data=True,
    )


@router.get(
    "/orgs/{org_id}/org-analyzer/findings",
    response_model=FindingsPage,
)
async def list_findings(
    org_id: str,
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> FindingsPage:
    _enforce_same_org(org_id, current_org_id)
    snap = await _latest_snapshot(db, org_id)
    if snap is None:
        return FindingsPage(total=0, snapshot_id=None, findings=[])

    q = select(OrgFinding).where(
        OrgFinding.organization_id == org_id,
        OrgFinding.snapshot_id == snap.id,
    )
    if category:
        q = q.where(OrgFinding.category == category)
    if severity:
        q = q.where(OrgFinding.severity == severity)

    # Severity-ranked ORDER BY would need a CASE statement; the row count
    # per snapshot is small (typically < 200), so client-side sort is fine.
    all_rows = list((await db.execute(q)).scalars().all())
    sev_rank = {s.value: i for i, s in enumerate([
        FindingSeverity.CRITICAL,
        FindingSeverity.HIGH,
        FindingSeverity.MEDIUM,
        FindingSeverity.LOW,
        FindingSeverity.INFO,
    ])}
    all_rows.sort(
        key=lambda f: (
            sev_rank.get(f.severity.value if isinstance(f.severity, FindingSeverity) else str(f.severity), 99),
            -(f.estimated_annual_savings_cents or 0),
        )
    )
    paged = all_rows[offset : offset + limit]
    return FindingsPage(
        total=len(all_rows),
        snapshot_id=snap.id,
        findings=[FindingResponse.from_orm(f) for f in paged],
    )


@router.get(
    "/orgs/{org_id}/org-analyzer/findings/{finding_id}",
    response_model=FindingResponse,
)
async def get_finding(
    org_id: str,
    finding_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> FindingResponse:
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(OrgFinding).where(
            OrgFinding.organization_id == org_id,
            OrgFinding.id == finding_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Finding not found")
    return FindingResponse.from_orm(row)


@router.get(
    "/orgs/{org_id}/org-analyzer/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = Query(default=30, ge=1, le=200),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(OrgAnalysisSnapshot)
        .where(OrgAnalysisSnapshot.organization_id == org_id)
        .order_by(desc(OrgAnalysisSnapshot.snapshot_at))
        .limit(limit)
    )
    rows = list(result.scalars().all())
    rows.reverse()  # oldest → newest for chart consumption
    return [
        HistoryPoint(
            snapshot_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            findings_count=r.findings_count,
            total_estimated_annual_savings_cents=r.total_estimated_annual_savings_cents,
            findings_by_severity=r.findings_by_severity or {},
        )
        for r in rows
    ]


@router.get(
    "/orgs/{org_id}/org-analyzer/price-book",
    response_model=PriceBookResponse,
)
async def get_price_book(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> PriceBookResponse:
    """Returns the per-org price book merged with defaults.

    On first read for a fresh org we DO NOT auto-insert default rows —
    that's a write side-effect we want gated behind PUT. The response is
    just the merged view so the UI can show defaults until the consultant
    explicitly customises them.
    """
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(LicensePriceBook).where(
            LicensePriceBook.organization_id == org_id
        )
    )
    overrides = {r.license_name: r.monthly_cost_cents for r in result.scalars().all()}
    merged: Dict[str, int] = dict(DEFAULT_PRICE_BOOK_CENTS)
    merged.update(overrides)
    return PriceBookResponse(
        rows=[
            PriceBookRow(license_name=k, monthly_cost_cents=v)
            for k, v in sorted(merged.items())
        ]
    )


@router.put(
    "/orgs/{org_id}/org-analyzer/price-book",
    response_model=PriceBookResponse,
)
async def update_price_book(
    org_id: str,
    payload: PriceBookUpdate,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> PriceBookResponse:
    """Upsert the price book. Each row in the payload becomes an override.

    Sending a row with a license_name not in the defaults adds a new SKU.
    To remove an override, send an empty list (we clear all overrides and
    fall back to defaults).
    """
    _enforce_same_org(org_id, current_org_id)
    existing_result = await db.execute(
        select(LicensePriceBook).where(
            LicensePriceBook.organization_id == org_id
        )
    )
    existing_by_name = {r.license_name: r for r in existing_result.scalars().all()}

    incoming_names = {r.license_name for r in payload.rows}
    # Delete overrides that are no longer in the payload
    for name, row in existing_by_name.items():
        if name not in incoming_names:
            await db.delete(row)

    # Upsert
    for r in payload.rows:
        if r.license_name in existing_by_name:
            existing_by_name[r.license_name].monthly_cost_cents = r.monthly_cost_cents
            existing_by_name[r.license_name].updated_by = actor_email
        else:
            db.add(LicensePriceBook(
                organization_id=org_id,
                license_name=r.license_name,
                monthly_cost_cents=r.monthly_cost_cents,
                updated_by=actor_email,
            ))

    await db.commit()
    return await get_price_book(org_id, current_org_id, db)


@router.get(
    "/orgs/{org_id}/org-analyzer/report.pdf",
)
async def download_report(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> StreamingResponse:
    """Stream a server-rendered PDF of the latest analyzer findings."""
    _enforce_same_org(org_id, current_org_id)
    snap = await _latest_snapshot(db, org_id)
    if snap is None:
        raise HTTPException(
            status_code=404,
            detail="No analyzer run yet. POST /run first.",
        )

    # Fetch findings ordered by severity
    findings_result = await db.execute(
        select(OrgFinding).where(
            OrgFinding.organization_id == org_id,
            OrgFinding.snapshot_id == snap.id,
        )
    )
    findings = list(findings_result.scalars().all())

    # Fetch org name for cover page
    org_row = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = org_row.scalar_one_or_none()
    org_name = org.name if org and org.name else "Salesforce Org"

    try:
        from app.services.org_analyzer_pdf import build_report_pdf
    except Exception as e:
        logger.exception("PDF library not available: %s", e)
        raise HTTPException(
            status_code=503,
            detail="PDF generation unavailable. Check server logs.",
        )

    pdf_bytes = build_report_pdf(
        org_name=org_name,
        snapshot=snap,
        findings=findings,
    )
    filename = (
        f"org-analyzer-report-"
        f"{snap.snapshot_at.strftime('%Y%m%d')}.pdf"
    )
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
