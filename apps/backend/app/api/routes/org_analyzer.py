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
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    KNOWN_FREE_SKU_PATTERNS,
    OrgAnalyzerService,
    _is_known_free_sku,
    _is_paying_org,
    _lookup_default_price,
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
    is_ignored: bool
    ignored_at: Optional[str]
    ignored_by: Optional[str]
    ignore_reason: Optional[str]

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
            is_ignored=bool(getattr(f, "is_ignored", False)),
            ignored_at=f.ignored_at.isoformat() if getattr(f, "ignored_at", None) else None,
            ignored_by=getattr(f, "ignored_by", None),
            ignore_reason=getattr(f, "ignore_reason", None),
        )


class IgnoreFindingRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=1000)


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
    # Live counts after applying admin-side ignores. Differ from the
    # snapshot's stored totals (which capture the analyzer-run state)
    # when the user has flagged findings as intentional post-run.
    active_findings_count: int = 0
    active_savings_cents: int = 0
    ignored_findings_count: int = 0
    # Org-edition surfaced as top-level fields so the frontend doesn't
    # have to dig through metrics. None on snapshots from before v1.7.3.
    org_type: Optional[str] = None
    is_sandbox: bool = False
    is_trial: bool = False
    is_paying_org: bool = True


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
    # Per-row "is this actually billed for the customer's contract" flag.
    # When false, the analyzer treats this SKU as bundled and attributes
    # $0 savings regardless of monthly_cost_cents.
    is_billed: bool = True
    # Whether this row's cost was set by the admin (true) or comes from
    # the built-in default catalog of Salesforce list prices (false).
    # The UI uses this to surface a "default" badge so the consultant
    # knows which numbers they still need to verify with the customer.
    is_override: bool = False
    # Whether the SKU was detected in the org's actual UserLicense /
    # PSL inventory (true) or is a catalog-only entry shown for
    # convenience (false). Org-present SKUs render first in the editor.
    in_org: bool = False
    # Human-readable reason for the current is_billed default. The UI
    # surfaces it in a tooltip so the consultant understands why a row
    # is Bundled vs Billed before they flip the toggle.
    billed_reason: Optional[str] = None


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

    # Compute active-only counts + savings on demand so ignores reflect
    # in the headline numbers without rewriting the snapshot row.
    active_rows = (await db.execute(
        select(OrgFinding).where(
            OrgFinding.organization_id == org_id,
            OrgFinding.snapshot_id == snap.id,
            OrgFinding.is_ignored.is_(False),
        )
    )).scalars().all()
    active_savings = sum(
        (f.estimated_annual_savings_cents or 0) for f in active_rows
    )
    ignored_count = snap.findings_count - len(active_rows)

    snap_metrics = snap.metrics or {}
    return SnapshotSummary(
        snapshot_id=snap.id,
        snapshot_at=snap.snapshot_at.isoformat(),
        findings_count=snap.findings_count,
        findings_by_severity=snap.findings_by_severity or {},
        findings_by_category=snap.findings_by_category or {},
        total_estimated_annual_savings_cents=snap.total_estimated_annual_savings_cents,
        metrics=snap_metrics,
        org_limits=snap.org_limits or {},
        has_data=True,
        active_findings_count=len(active_rows),
        active_savings_cents=active_savings,
        ignored_findings_count=max(ignored_count, 0),
        org_type=snap_metrics.get("org_type"),
        is_sandbox=bool(snap_metrics.get("is_sandbox", False)),
        is_trial=bool(snap_metrics.get("is_trial", False)),
        is_paying_org=bool(snap_metrics.get("is_paying_org", True)),
    )


@router.get(
    "/orgs/{org_id}/org-analyzer/findings",
    response_model=FindingsPage,
)
async def list_findings(
    org_id: str,
    category: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    include_ignored: bool = Query(
        default=False,
        description="Include findings the admin has marked as ignored.",
    ),
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
    if not include_ignored:
        q = q.where(OrgFinding.is_ignored.is_(False))
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


@router.post(
    "/orgs/{org_id}/org-analyzer/findings/{finding_id}/ignore",
    response_model=FindingResponse,
)
async def ignore_finding(
    org_id: str,
    finding_id: str,
    payload: IgnoreFindingRequest,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> FindingResponse:
    """Flag a finding as intentional / out-of-scope.

    Ignored findings hide by default in the list view, drop out of the
    headline savings number, and are visually demoted in the report.
    The row stays in the database with an audit trail of who/when/why.
    """
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
    row.is_ignored = True
    row.ignored_at = datetime.now(timezone.utc)
    row.ignored_by = actor_email
    row.ignore_reason = payload.reason
    await db.commit()
    return FindingResponse.from_orm(row)


@router.post(
    "/orgs/{org_id}/org-analyzer/findings/{finding_id}/unignore",
    response_model=FindingResponse,
)
async def unignore_finding(
    org_id: str,
    finding_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> FindingResponse:
    """Restore a previously-ignored finding to the active list."""
    _enforce_same_org(org_id, current_org_id)
    # actor_email dep enforces auth; not logged for unignore.
    del actor_email
    result = await db.execute(
        select(OrgFinding).where(
            OrgFinding.organization_id == org_id,
            OrgFinding.id == finding_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Finding not found")
    row.is_ignored = False
    row.ignored_at = None
    row.ignored_by = None
    row.ignore_reason = None
    await db.commit()
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
    """Returns the price book, prioritised in this order:
      1. Per-org admin overrides (LicensePriceBook table).
      2. Actual SKUs detected in the org's latest analyzer snapshot
         (UserLicense + PermissionSetLicense), with default cost when
         the SKU name matches one we know, else $0 (forcing the admin
         to fill in the customer's negotiated price).
      3. A small fallback list of commonly-licensed SKUs so a brand-new
         org without an analyzer run yet still sees something.

    The response is read-only — no rows are persisted until the admin
    explicitly PUTs the price book.
    """
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(LicensePriceBook).where(
            LicensePriceBook.organization_id == org_id
        )
    )
    override_rows = list(result.scalars().all())
    overrides: Dict[str, int] = {
        r.license_name: r.monthly_cost_cents for r in override_rows
    }
    override_is_billed: Dict[str, bool] = {
        r.license_name: bool(r.is_billed) for r in override_rows
    }

    # Pull SKUs the org actually owns + org-edition state from the latest
    # snapshot so the is_billed resolution ladder can apply.
    snap = await _latest_snapshot(db, org_id)
    org_skus: List[str] = []
    snap_metrics = (snap.metrics if snap else {}) or {}
    snap_is_paying = bool(snap_metrics.get("is_paying_org", True))
    snap_org_type = snap_metrics.get("org_type")
    snap_is_sandbox = bool(snap_metrics.get("is_sandbox", False))
    snap_is_trial = bool(snap_metrics.get("is_trial", False))
    if snap and snap.metrics:
        for row in (snap.metrics.get("license_utilization") or []):
            name = row.get("license_name")
            if name and name not in org_skus:
                org_skus.append(name)

    def _default_for(name: str) -> int:
        """Catalog lookup → 0. Substring match handles SKUs the org
        labels idiosyncratically without us hard-coding every variant."""
        catalog = _lookup_default_price(name)
        if catalog is not None:
            return catalog
        return DEFAULT_PRICE_BOOK_CENTS.get(name, 0)

    def _resolve_billed(name: str) -> tuple:
        """Returns (is_billed, reason) for the row. Mirrors the analyzer's
        _is_billed_for_org ladder so the editor shows the same default
        state that drives savings calculations."""
        if name in override_is_billed:
            is_billed = override_is_billed[name]
            if is_billed:
                return True, "Marked Billed in the Price book by you."
            return False, "Marked Bundled in the Price book by you."
        if not snap_is_paying:
            edition = (
                "Sandbox" if snap_is_sandbox
                else "Trial" if snap_is_trial
                else (snap_org_type or "Non-production")
            )
            return False, f"{edition} org — license seats are bundled at no cost."
        if _is_known_free_sku(name):
            return False, (
                "Matches the documented free-SKU pattern list. "
                "Flip to Billed if your customer's contract bills for it."
            )
        return True, "Default — flip to Bundled if this SKU isn't billed for your customer."

    rows: List[PriceBookRow] = []
    seen: set = set()

    def _build_row(name: str, in_org: bool) -> PriceBookRow:
        is_billed, reason = _resolve_billed(name)
        return PriceBookRow(
            license_name=name,
            monthly_cost_cents=overrides.get(name, _default_for(name)),
            is_billed=is_billed,
            is_override=(name in overrides),
            in_org=in_org,
            billed_reason=reason,
        )

    # Org's actual SKUs first — these are the ones the consultant cares
    # about and should appear at the top of the editor.
    for name in org_skus:
        rows.append(_build_row(name, in_org=True))
        seen.add(name)

    # Then the common-SKU defaults the org doesn't (yet) have, so a fresh
    # install still sees a reasonable starting list.
    for name in DEFAULT_PRICE_BOOK_CENTS:
        if name in seen:
            continue
        rows.append(_build_row(name, in_org=False))
        seen.add(name)

    # Surface any admin overrides for SKUs that aren't in the org or the
    # default list — we shouldn't drop them silently.
    for name in overrides:
        if name in seen:
            continue
        rows.append(_build_row(name, in_org=False))

    # Final ordering: org-present first, then alphabetical within each
    # bucket, so the consultant sees what matters at the top.
    rows.sort(key=lambda r: (not r.in_org, r.license_name.lower()))
    return PriceBookResponse(rows=rows)


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

    # Upsert. `is_billed` defaults to True at the schema level so
    # legacy clients that don't send the field don't accidentally flip
    # rows to bundled.
    for r in payload.rows:
        if r.license_name in existing_by_name:
            existing_by_name[r.license_name].monthly_cost_cents = r.monthly_cost_cents
            existing_by_name[r.license_name].is_billed = r.is_billed
            existing_by_name[r.license_name].updated_by = actor_email
        else:
            db.add(LicensePriceBook(
                organization_id=org_id,
                license_name=r.license_name,
                monthly_cost_cents=r.monthly_cost_cents,
                is_billed=r.is_billed,
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

    # Fetch findings ordered by severity. Ignored findings stay out of
    # the customer-facing PDF — the consultant's report should reflect
    # the active, in-scope work, not items already explained away.
    findings_result = await db.execute(
        select(OrgFinding).where(
            OrgFinding.organization_id == org_id,
            OrgFinding.snapshot_id == snap.id,
            OrgFinding.is_ignored.is_(False),
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
