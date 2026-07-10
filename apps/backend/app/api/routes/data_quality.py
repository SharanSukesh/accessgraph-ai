"""Data Quality API routes.

Per-object data-quality scoring — surfaces:

  - POST  /orgs/{org_id}/data-quality/run           — kick off a run
  - GET   /orgs/{org_id}/data-quality/latest        — most recent run summary
  - GET   /orgs/{org_id}/data-quality/objects       — per-object score list
  - GET   /orgs/{org_id}/data-quality/objects/{obj} — one object's detail
  - GET   /orgs/{org_id}/data-quality/history       — score trend

The dashboards on the frontend (Objects list "Quality" column + Object
detail card) hydrate from `/objects` + `/objects/{name}`. `/latest`
powers the org-wide KPI on the main Objects page header.

Everything here is additive — no existing route or engine touched.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_current_org
from app.domain.models import DataQualityRun, ObjectQualityScore
from app.services.data_quality import DataQualityService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class ObjectScoreResponse(BaseModel):
    object_name: str
    object_label: str
    is_custom: bool
    record_count: int
    sampled_count: int
    score: float
    completeness_pct: float
    duplicate_pct: float
    staleness_pct: float
    fields_inspected: int
    fields_with_gaps: int
    duplicate_clusters: int
    stale_record_count: int
    # Only surface evidence on the detail endpoint — the list endpoint
    # trims it out to keep the payload tight.
    evidence: Optional[Dict[str, Any]] = None

    @classmethod
    def from_orm(
        cls, row: ObjectQualityScore, *, include_evidence: bool = False
    ) -> "ObjectScoreResponse":
        return cls(
            object_name=row.object_name,
            object_label=row.object_label,
            is_custom=row.is_custom,
            record_count=row.record_count,
            sampled_count=row.sampled_count,
            score=round(row.score, 1),
            completeness_pct=round(row.completeness_pct, 1),
            duplicate_pct=round(row.duplicate_pct, 1),
            staleness_pct=round(row.staleness_pct, 1),
            fields_inspected=row.fields_inspected,
            fields_with_gaps=row.fields_with_gaps,
            duplicate_clusters=row.duplicate_clusters,
            stale_record_count=row.stale_record_count,
            evidence=(row.evidence or {}) if include_evidence else None,
        )


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    objects_analyzed: int
    objects_skipped: int
    avg_score: float
    avg_completeness: float
    avg_duplicate_pct: float
    avg_staleness_pct: float
    sample_size: int
    staleness_threshold_days: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]
    # Skip-reason breakdown extracted from the run's `error` JSON so
    # the frontend can render "N skipped: 3 sample_failed, 2 count_failed…"
    # without having to parse the error blob itself. Empty dict when
    # no objects were skipped.
    skip_reasons: Dict[str, int] = {}


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    objects_analyzed: int
    avg_score: float


class ObjectListResponse(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    objects: List[ObjectScoreResponse]


class HistoryPoint(BaseModel):
    run_id: str
    snapshot_at: str
    avg_score: float
    objects_analyzed: int


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's data-quality results.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[DataQualityRun]:
    result = await db.execute(
        select(DataQualityRun)
        .where(DataQualityRun.organization_id == org_id)
        .order_by(desc(DataQualityRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _scores_for_run(
    db: AsyncSession, run_id: str
) -> List[ObjectQualityScore]:
    result = await db.execute(
        select(ObjectQualityScore)
        .where(ObjectQualityScore.run_id == run_id)
        .order_by(ObjectQualityScore.score.asc())  # worst first — the actionable end
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/data-quality/run",
    response_model=RunResponse,
)
async def run_data_quality(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a data-quality run synchronously.

    Runs are I/O bound (Salesforce SOQL sampling) and typically take
    15-60s depending on how many objects the org has. Kept synchronous
    for v1 — the caller sees the run ID immediately in the response.
    If runtime grows past ~90s we should switch to the same background
    pattern the sync-job uses (asyncio.create_task + polling endpoint).
    """
    _enforce_same_org(org_id, current_org_id)
    service = DataQualityService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception("Data-quality run crashed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Data-quality run failed: {e}",
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        objects_analyzed=run.objects_analyzed,
        avg_score=round(run.avg_score, 1),
    )


@router.get(
    "/orgs/{org_id}/data-quality/latest",
    response_model=RunSummary,
)
async def get_latest_run(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """Headline stats for the most recent run. Returns has_data=False
    if no run exists yet so the Objects page renders cleanly on first
    visit."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            objects_analyzed=0,
            objects_skipped=0,
            avg_score=0.0,
            avg_completeness=0.0,
            avg_duplicate_pct=0.0,
            avg_staleness_pct=0.0,
            sample_size=0,
            staleness_threshold_days=0,
            has_data=False,
            duration_ms=None,
            error=None,
        )
    # The service stashes skip categories in `error` as JSON. Parse
    # it out so the frontend gets a clean dict without having to know
    # the storage detail.
    skip_reasons: Dict[str, int] = {}
    if run.error:
        try:
            import json
            payload = json.loads(run.error)
            raw = payload.get("skip_reasons", {}) if isinstance(payload, dict) else {}
            if isinstance(raw, dict):
                skip_reasons = {str(k): int(v) for k, v in raw.items()}
        except (ValueError, TypeError):
            # Legacy runs where `error` is a plain string — leave the
            # dict empty and let the frontend fall back to the raw
            # `error` field for display.
            pass

    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        objects_analyzed=run.objects_analyzed,
        objects_skipped=run.objects_skipped,
        avg_score=round(run.avg_score, 1),
        avg_completeness=round(run.avg_completeness, 1),
        avg_duplicate_pct=round(run.avg_duplicate_pct, 1),
        avg_staleness_pct=round(run.avg_staleness_pct, 1),
        sample_size=run.sample_size,
        staleness_threshold_days=run.staleness_threshold_days,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
        skip_reasons=skip_reasons,
    )


@router.get(
    "/orgs/{org_id}/data-quality/objects",
    response_model=ObjectListResponse,
)
async def list_object_scores(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> ObjectListResponse:
    """Per-object score list from the most recent run — ordered
    worst-first so the Objects page can badge the offenders."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return ObjectListResponse(run_id=None, snapshot_at=None, objects=[])
    rows = await _scores_for_run(db, run.id)
    return ObjectListResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        objects=[ObjectScoreResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/data-quality/objects/{object_name}",
    response_model=ObjectScoreResponse,
)
async def get_object_score(
    org_id: str,
    object_name: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> ObjectScoreResponse:
    """One object's detail — includes the evidence blob (top gap fields,
    duplicate clusters, oldest records) so the object detail page can
    render the drill-down without a second round-trip."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No data-quality run yet — trigger POST /run first.",
        )
    result = await db.execute(
        select(ObjectQualityScore)
        .where(
            ObjectQualityScore.run_id == run.id,
            ObjectQualityScore.object_name == object_name,
        )
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No data-quality score for {object_name} in latest run.",
        )
    return ObjectScoreResponse.from_orm(row, include_evidence=True)


@router.get(
    "/orgs/{org_id}/data-quality/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = 30,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    """Score-over-time — powers a small sparkline next to the org KPI."""
    _enforce_same_org(org_id, current_org_id)
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(DataQualityRun)
        .where(DataQualityRun.organization_id == org_id)
        .order_by(desc(DataQualityRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            avg_score=round(r.avg_score, 1),
            objects_analyzed=r.objects_analyzed,
        )
        for r in reversed(runs)  # chronological order for charting
    ]
