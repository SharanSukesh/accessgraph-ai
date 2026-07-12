"""Restructure Studio API routes — GAEA Optimal Org Restructure.

13 endpoints across four resource families:

  Runs
    - POST  /orgs/{org_id}/restructure/run       kick off generation
    - GET   /orgs/{org_id}/restructure/latest    run summary + KPI deltas

  Moves
    - GET   /orgs/{org_id}/restructure/moves               paginated list
    - GET   /orgs/{org_id}/restructure/moves/{move_id}     full detail
    - PATCH /orgs/{org_id}/restructure/moves/{move_id}     accept/reject/edit
    - POST  /orgs/{org_id}/restructure/moves/{move_id}/deep-analyze
                                                on-demand Option B probing

  Plans
    - GET   /orgs/{org_id}/restructure/plans               list
    - GET   /orgs/{org_id}/restructure/plans/{plan_id}     detail
    - POST  /orgs/{org_id}/restructure/plans               create draft
    - PATCH /orgs/{org_id}/restructure/plans/{plan_id}     edit
    - GET   /orgs/{org_id}/restructure/plans/{plan_id}/export.csv

  Preservation constraints
    - GET   /orgs/{org_id}/restructure/constraints         list
    - POST  /orgs/{org_id}/restructure/constraints         create
    - DELETE /orgs/{org_id}/restructure/constraints/{id}   remove

Phase 2 status: skeleton only — pattern miner + impact simulator land
in Phases 3-6. Endpoints currently return stubbed data or 501-adjacent
"not yet implemented" responses so the frontend can build against the
contract while the engine gets wired.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_current_org
from app.domain.models import (
    RestructureMove,
    RestructureMoveStatus,
    RestructurePlan,
    RestructurePlanStatus,
    RestructurePreservationConstraint,
    RestructureRun,
)
from app.services.restructure_planner import RestructurePlannerService
from app.services.restructure_probe import RestructureProbeService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunKpiBlock(BaseModel):
    """Current-state or projected-state KPI bundle. Nullable fields are
    the ones that require data we may not have (GAEA never fired,
    licence data missing)."""
    equity_index: Optional[float]
    ps_count: int
    role_count: int
    user_count: Optional[int] = None
    monthly_license_cost: Optional[float]


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    status: Optional[str]
    moves_generated: int = 0
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    has_data: bool
    current: Optional[RunKpiBlock] = None
    projected: Optional[RunKpiBlock] = None
    # Per-move-type + per-blast-tier counts so the Studio can render the
    # filter chips without another fetch.
    move_type_counts: Dict[str, int] = {}
    blast_tier_counts: Dict[str, int] = {}


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    moves_generated: int
    projected_equity_index: Optional[float]


class MoveImpact(BaseModel):
    """The impact chip bundle rendered on each move card."""
    object_access_preserved_pct: Optional[float] = None
    field_access_preserved_pct: Optional[float] = None
    equity_delta: Optional[float] = None
    cost_delta_monthly: Optional[float] = None
    complexity_delta: Optional[int] = None
    sharing_rules_simplified: Optional[int] = None
    blast_tier: str
    blast_score: float
    # Option B fields — populated only after the on-demand probe.
    records_gained_by_object: Optional[Dict[str, int]] = None
    records_lost_by_object: Optional[Dict[str, int]] = None
    deep_analysis_at: Optional[str] = None
    probe_sample_size: Optional[int] = None


class MoveResponse(BaseModel):
    id: str
    run_id: str
    move_type: str
    move_status: str
    primary_component_id: Optional[str]
    primary_component_name: Optional[str]
    affected_component_ids: List[str] = []
    affected_user_ids: List[str] = []
    impact: MoveImpact
    constraint_violations: List[str] = []
    rationale: Optional[str]
    consultant_notes: Optional[str]

    @classmethod
    def from_orm(cls, row: RestructureMove) -> "MoveResponse":
        return cls(
            id=row.id,
            run_id=row.run_id,
            move_type=row.move_type,
            move_status=row.move_status,
            primary_component_id=row.primary_component_id,
            primary_component_name=row.primary_component_name,
            affected_component_ids=list(row.affected_component_ids or []),
            affected_user_ids=list(row.affected_user_ids or []),
            impact=MoveImpact(
                object_access_preserved_pct=row.object_access_preserved_pct,
                field_access_preserved_pct=row.field_access_preserved_pct,
                equity_delta=row.equity_delta,
                cost_delta_monthly=row.cost_delta_monthly,
                complexity_delta=row.complexity_delta,
                sharing_rules_simplified=row.sharing_rules_simplified,
                blast_tier=row.blast_tier,
                blast_score=row.blast_score,
                records_gained_by_object=row.records_gained_by_object,
                records_lost_by_object=row.records_lost_by_object,
                deep_analysis_at=(
                    row.deep_analysis_at.isoformat()
                    if row.deep_analysis_at
                    else None
                ),
                probe_sample_size=row.probe_sample_size,
            ),
            constraint_violations=list(row.constraint_violations or []),
            rationale=row.rationale,
            consultant_notes=row.consultant_notes,
        )


class MoveListResponse(BaseModel):
    run_id: Optional[str]
    total: int
    moves: List[MoveResponse]


class MoveUpdatePayload(BaseModel):
    """PATCH payload. All optional so the client can update just one
    field at a time. `move_status` accepts the RestructureMoveStatus
    enum values."""
    move_status: Optional[str] = None
    consultant_notes: Optional[str] = None


class PlanResponse(BaseModel):
    id: str
    run_id: str
    name: str
    status: str
    accepted_move_ids: List[str]
    notes: Optional[str]
    created_by: Optional[str]
    updated_by: Optional[str]

    @classmethod
    def from_orm(cls, row: RestructurePlan) -> "PlanResponse":
        return cls(
            id=row.id,
            run_id=row.run_id,
            name=row.name,
            status=row.status,
            accepted_move_ids=list(row.accepted_move_ids or []),
            notes=row.notes,
            created_by=row.created_by,
            updated_by=row.updated_by,
        )


class PlanCreatePayload(BaseModel):
    run_id: str
    name: str = "Draft"
    notes: Optional[str] = None


class PlanUpdatePayload(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    accepted_move_ids: Optional[List[str]] = None


class ConstraintResponse(BaseModel):
    id: str
    run_id: str
    user_sf_id: str
    object_type: str
    reason: Optional[str]

    @classmethod
    def from_orm(
        cls, row: RestructurePreservationConstraint
    ) -> "ConstraintResponse":
        return cls(
            id=row.id,
            run_id=row.run_id,
            user_sf_id=row.user_sf_id,
            object_type=row.object_type,
            reason=row.reason,
        )


class ConstraintCreatePayload(BaseModel):
    run_id: str
    user_sf_id: str
    object_type: str
    reason: Optional[str] = None


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's restructure data.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[RestructureRun]:
    result = await db.execute(
        select(RestructureRun)
        .where(RestructureRun.organization_id == org_id)
        .order_by(desc(RestructureRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _get_move(
    db: AsyncSession, org_id: str, move_id: str
) -> RestructureMove:
    result = await db.execute(
        select(RestructureMove).where(
            RestructureMove.id == move_id,
            RestructureMove.organization_id == org_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restructure move not found.",
        )
    return row


async def _get_plan(
    db: AsyncSession, org_id: str, plan_id: str
) -> RestructurePlan:
    result = await db.execute(
        select(RestructurePlan).where(
            RestructurePlan.id == plan_id,
            RestructurePlan.organization_id == org_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restructure plan not found.",
        )
    return row


# ---------------------------------------------------------------- runs


@router.post(
    "/orgs/{org_id}/restructure/run",
    response_model=RunResponse,
)
async def run_restructure(
    org_id: str,
    max_moves: int = Query(
        50, ge=1, le=500,
        description="Cap on total moves the pattern miner may propose. "
                    "Studio renders 5 per bucket by default; larger values "
                    "just add tail — no cost to the run.",
    ),
    ps_overlap_threshold: float = Query(
        0.90, ge=0.5, le=1.0,
        description="Two PermissionSets flagged as merge candidates when "
                    "their object+field permission Jaccard similarity "
                    "exceeds this. 0.9 = 'nearly identical'.",
    ),
    role_member_overlap_threshold: float = Query(
        0.85, ge=0.5, le=1.0,
        description="Two Roles flagged as merge candidates when their "
                    "member profile+PSet overlap exceeds this.",
    ),
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a Restructure generation.

    Synchronous call — the planner service loads snapshots, mines
    candidate moves, scores each with Option A symbolic simulation, and
    persists everything in one DB transaction. Typical runtime ~2-10s
    depending on org size (dominated by the O(n²) PSet pairs pass).
    """
    _enforce_same_org(org_id, current_org_id)

    service = RestructurePlannerService(
        db,
        org_id,
        max_moves=max_moves,
        ps_overlap_threshold=ps_overlap_threshold,
        role_member_overlap_threshold=role_member_overlap_threshold,
    )
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as exc:
        logger.exception("restructure: run crashed for org %s", org_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Restructure run failed",
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )

    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        moves_generated=run.moves_generated,
        projected_equity_index=run.projected_equity_index,
    )


@router.get(
    "/orgs/{org_id}/restructure/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """Headline stats for the last run. Returns has_data=False when
    no run has ever been created, so the Studio can render an empty
    state cleanly on first visit.
    """
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            status=None,
            moves_generated=0,
            has_data=False,
        )

    # Roll up move-type + blast counts from the moves table. Cheap
    # aggregations that spare the frontend from N loops over a big list.
    from sqlalchemy import func
    type_rows = await db.execute(
        select(RestructureMove.move_type, func.count())
        .where(RestructureMove.run_id == run.id)
        .group_by(RestructureMove.move_type)
    )
    blast_rows = await db.execute(
        select(RestructureMove.blast_tier, func.count())
        .where(RestructureMove.run_id == run.id)
        .group_by(RestructureMove.blast_tier)
    )
    type_counts = {row[0]: int(row[1]) for row in type_rows.all()}
    blast_counts = {row[0]: int(row[1]) for row in blast_rows.all()}

    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        status=run.status,
        moves_generated=run.moves_generated,
        duration_ms=run.duration_ms,
        error=run.error,
        has_data=True,
        current=RunKpiBlock(
            equity_index=run.current_equity_index,
            ps_count=run.current_ps_count,
            role_count=run.current_role_count,
            user_count=run.current_user_count,
            monthly_license_cost=run.current_monthly_license_cost,
        ),
        projected=RunKpiBlock(
            equity_index=run.projected_equity_index,
            ps_count=run.projected_ps_count,
            role_count=run.projected_role_count,
            user_count=run.current_user_count,  # user count doesn't change
            monthly_license_cost=run.projected_monthly_license_cost,
        ),
        move_type_counts=type_counts,
        blast_tier_counts=blast_counts,
    )


# ---------------------------------------------------------------- moves


@router.get(
    "/orgs/{org_id}/restructure/moves",
    response_model=MoveListResponse,
)
async def list_moves(
    org_id: str,
    move_type: Optional[str] = Query(
        None,
        description="Filter by move type (one of the RestructureMoveType "
                    "enum values).",
    ),
    blast_tier: Optional[str] = Query(
        None,
        pattern="^(low|medium|high|critical)$",
        description="Filter by blast tier.",
    ),
    move_status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by move status (proposed / accepted / "
                    "rejected / edited).",
    ),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> MoveListResponse:
    """Paginated move list from the latest run. Filter chips on the
    Studio use `move_type`, `blast_tier`, and `status`; sort order is
    applied on the frontend since v1 lists are always fully loaded
    within the 500-cap.
    """
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return MoveListResponse(run_id=None, total=0, moves=[])

    from sqlalchemy import func

    conditions = [RestructureMove.run_id == run.id]
    if move_type:
        conditions.append(RestructureMove.move_type == move_type)
    if blast_tier:
        conditions.append(RestructureMove.blast_tier == blast_tier)
    if move_status_filter:
        conditions.append(RestructureMove.move_status == move_status_filter)

    total = (
        await db.execute(
            select(func.count()).select_from(RestructureMove).where(*conditions)
        )
    ).scalar_one()

    rows = list((
        await db.execute(
            select(RestructureMove)
            .where(*conditions)
            .order_by(desc(RestructureMove.blast_score))
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all())

    return MoveListResponse(
        run_id=run.id,
        total=int(total),
        moves=[MoveResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/restructure/moves/{move_id}",
    response_model=MoveResponse,
)
async def get_move(
    org_id: str,
    move_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> MoveResponse:
    """Full move detail — same shape as the list-item response but
    fetched by ID. Used by the Studio's per-move drawer."""
    _enforce_same_org(org_id, current_org_id)
    move = await _get_move(db, org_id, move_id)
    return MoveResponse.from_orm(move)


@router.patch(
    "/orgs/{org_id}/restructure/moves/{move_id}",
    response_model=MoveResponse,
)
async def update_move(
    org_id: str,
    move_id: str,
    payload: MoveUpdatePayload,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> MoveResponse:
    """Accept / reject / edit a move. Uses model_dump(exclude_unset=True)
    so omitted keys leave the row untouched. Status updates get validated
    against the enum before persistence.
    """
    _enforce_same_org(org_id, current_org_id)
    move = await _get_move(db, org_id, move_id)

    updates = payload.model_dump(exclude_unset=True)
    if "move_status" in updates:
        status_val = updates["move_status"]
        try:
            RestructureMoveStatus(status_val)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid move_status: {status_val}",
            )
        move.move_status = status_val
    if "consultant_notes" in updates:
        move.consultant_notes = updates["consultant_notes"]

    try:
        await db.commit()
        await db.refresh(move)
    except Exception as exc:
        logger.exception(
            "restructure: failed to update move %s (org %s)",
            move_id, org_id,
        )
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update move: {exc}",
        )

    logger.info(
        "restructure: move %s updated by %s (status_set=%s)",
        move_id, actor_email, updates.get("move_status") is not None,
    )
    return MoveResponse.from_orm(move)


@router.post(
    "/orgs/{org_id}/restructure/moves/{move_id}/deep-analyze",
    response_model=MoveResponse,
)
async def deep_analyze_move(
    org_id: str,
    move_id: str,
    sample_size: int = Query(
        1000, ge=100, le=5000,
        description="Records to probe per key object for record-level "
                    "impact scoring (Option B). 1000 gives ~3% margin.",
    ),
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> MoveResponse:
    """On-demand Option B probing for a single move.

    Runs the probe service synchronously — bounded record sampling
    against snapshot tables (AccountShare, OpportunityShare) to
    produce concrete `records_gained_by_object` / `records_lost_by_object`
    counts. Typical runtime <5s for sample_size=1000.

    PSet-only moves (MERGE_PS, RETIRE_UNUSED_PS) + REASSIGN_MANAGER
    persist an empty result set (no record-level effect) so the UI
    can render "no impact" and skip re-probing.
    """
    _enforce_same_org(org_id, current_org_id)
    # Verify move existence + org up front so a 404 doesn't come from
    # deep inside the probe service.
    await _get_move(db, org_id, move_id)

    service = RestructureProbeService(db, org_id)
    try:
        move = await service.probe_move(move_id, sample_size=sample_size)
    except Exception as exc:
        logger.exception(
            "restructure: probe crashed for move %s (org %s)",
            move_id, org_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Deep-analysis probe failed",
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
    logger.info(
        "restructure: probe complete for move %s by %s",
        move_id, actor_email,
    )
    return MoveResponse.from_orm(move)


# ---------------------------------------------------------------- plans


@router.get(
    "/orgs/{org_id}/restructure/plans",
    response_model=List[PlanResponse],
)
async def list_plans(
    org_id: str,
    run_id: Optional[str] = Query(
        None,
        description="Filter to plans under a specific run. Defaults to the "
                    "latest run.",
    ),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[PlanResponse]:
    """List plans for the given (or latest) run."""
    _enforce_same_org(org_id, current_org_id)
    if run_id is None:
        run = await _latest_run(db, org_id)
        if run is None:
            return []
        run_id = run.id

    rows = list((
        await db.execute(
            select(RestructurePlan)
            .where(
                RestructurePlan.organization_id == org_id,
                RestructurePlan.run_id == run_id,
            )
            .order_by(desc(RestructurePlan.created_at))
        )
    ).scalars().all())
    return [PlanResponse.from_orm(r) for r in rows]


@router.get(
    "/orgs/{org_id}/restructure/plans/{plan_id}",
    response_model=PlanResponse,
)
async def get_plan(
    org_id: str,
    plan_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> PlanResponse:
    _enforce_same_org(org_id, current_org_id)
    plan = await _get_plan(db, org_id, plan_id)
    return PlanResponse.from_orm(plan)


@router.post(
    "/orgs/{org_id}/restructure/plans",
    response_model=PlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_plan(
    org_id: str,
    payload: PlanCreatePayload,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> PlanResponse:
    """Create a draft plan for a run."""
    _enforce_same_org(org_id, current_org_id)
    # Verify the run belongs to this org so we don't get cross-org
    # plan attachment via a spoofed run_id.
    run = await db.execute(
        select(RestructureRun).where(
            RestructureRun.id == payload.run_id,
            RestructureRun.organization_id == org_id,
        )
    )
    if run.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found for this org.",
        )

    plan = RestructurePlan(
        run_id=payload.run_id,
        organization_id=org_id,
        name=payload.name,
        status="draft",
        accepted_move_ids=[],
        notes=payload.notes,
        created_by=actor_email,
        updated_by=actor_email,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return PlanResponse.from_orm(plan)


@router.patch(
    "/orgs/{org_id}/restructure/plans/{plan_id}",
    response_model=PlanResponse,
)
async def update_plan(
    org_id: str,
    plan_id: str,
    payload: PlanUpdatePayload,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> PlanResponse:
    """Rename, mark approved/archived, or reorder the accepted moves."""
    _enforce_same_org(org_id, current_org_id)
    plan = await _get_plan(db, org_id, plan_id)

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"]:
        plan.name = updates["name"][:120]
    if "notes" in updates:
        plan.notes = updates["notes"]
    if "status" in updates:
        val = updates["status"]
        try:
            RestructurePlanStatus(val)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid plan status: {val}",
            )
        plan.status = val
    if "accepted_move_ids" in updates:
        plan.accepted_move_ids = list(updates["accepted_move_ids"] or [])
    plan.updated_by = actor_email

    try:
        await db.commit()
        await db.refresh(plan)
    except Exception as exc:
        logger.exception(
            "restructure: failed to update plan %s (org %s)",
            plan_id, org_id,
        )
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update plan: {exc}",
        )
    return PlanResponse.from_orm(plan)


@router.get(
    "/orgs/{org_id}/restructure/plans/{plan_id}/export.csv",
    response_class=None,  # PlainText/CSV response set inline below
)
async def export_plan_csv(
    org_id: str,
    plan_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
):
    """CSV export of the accepted moves in a plan, in execution order.

    Phase 2 stub — returns a single-row header CSV until the full
    exporter lands with the pattern miner (Phase 3+). Signature stable.
    """
    from fastapi.responses import PlainTextResponse

    _enforce_same_org(org_id, current_org_id)
    plan = await _get_plan(db, org_id, plan_id)

    header = (
        "move_id,move_type,primary_component_name,blast_tier,"
        "object_access_preserved_pct,equity_delta,cost_delta_monthly,"
        "rationale\n"
    )
    lines = [header]

    if plan.accepted_move_ids:
        rows = list((
            await db.execute(
                select(RestructureMove).where(
                    RestructureMove.id.in_(plan.accepted_move_ids),
                    RestructureMove.organization_id == org_id,
                )
            )
        ).scalars().all())
        # Preserve the consultant's ordering from the plan
        by_id = {r.id: r for r in rows}
        for mid in plan.accepted_move_ids:
            r = by_id.get(mid)
            if r is None:
                continue

            def _csv(v):
                if v is None:
                    return ""
                s = str(v)
                if "," in s or '"' in s or "\n" in s:
                    return '"' + s.replace('"', '""') + '"'
                return s

            lines.append(",".join([
                _csv(r.id),
                _csv(r.move_type),
                _csv(r.primary_component_name),
                _csv(r.blast_tier),
                _csv(r.object_access_preserved_pct),
                _csv(r.equity_delta),
                _csv(r.cost_delta_monthly),
                _csv(r.rationale),
            ]) + "\n")

    csv_body = "".join(lines)
    filename = f"restructure-plan-{plan.name.replace(' ', '_')}.csv"
    return PlainTextResponse(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ---------------------------------------------------------------- constraints


@router.get(
    "/orgs/{org_id}/restructure/constraints",
    response_model=List[ConstraintResponse],
)
async def list_constraints(
    org_id: str,
    run_id: Optional[str] = Query(
        None,
        description="Filter to constraints under a specific run. Defaults "
                    "to the latest run.",
    ),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[ConstraintResponse]:
    _enforce_same_org(org_id, current_org_id)
    if run_id is None:
        run = await _latest_run(db, org_id)
        if run is None:
            return []
        run_id = run.id

    rows = list((
        await db.execute(
            select(RestructurePreservationConstraint)
            .where(
                RestructurePreservationConstraint.organization_id == org_id,
                RestructurePreservationConstraint.run_id == run_id,
            )
            .order_by(RestructurePreservationConstraint.created_at)
        )
    ).scalars().all())
    return [ConstraintResponse.from_orm(r) for r in rows]


@router.post(
    "/orgs/{org_id}/restructure/constraints",
    response_model=ConstraintResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_constraint(
    org_id: str,
    payload: ConstraintCreatePayload,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> ConstraintResponse:
    _enforce_same_org(org_id, current_org_id)
    # Verify the run belongs to this org.
    run = await db.execute(
        select(RestructureRun).where(
            RestructureRun.id == payload.run_id,
            RestructureRun.organization_id == org_id,
        )
    )
    if run.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found for this org.",
        )

    constraint = RestructurePreservationConstraint(
        run_id=payload.run_id,
        organization_id=org_id,
        user_sf_id=payload.user_sf_id[:18],
        object_type=payload.object_type[:120],
        reason=payload.reason,
        created_by=actor_email,
    )
    db.add(constraint)
    try:
        await db.commit()
        await db.refresh(constraint)
    except Exception as exc:
        # Almost always the uq_ constraint on (run, user, object)
        # tripping — the consultant tried to pin the same user+object
        # twice. Report a 409 with the message so the frontend can
        # show a friendly warning.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Constraint already exists or is invalid: {exc}",
        )
    return ConstraintResponse.from_orm(constraint)


@router.delete(
    "/orgs/{org_id}/restructure/constraints/{constraint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_constraint(
    org_id: str,
    constraint_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
):
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(RestructurePreservationConstraint).where(
            RestructurePreservationConstraint.id == constraint_id,
            RestructurePreservationConstraint.organization_id == org_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preservation constraint not found.",
        )
    await db.delete(row)
    await db.commit()
    return None
