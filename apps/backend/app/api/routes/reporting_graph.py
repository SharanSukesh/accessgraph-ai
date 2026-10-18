"""Reporting Graph routes — read the current manager/delegated-approver
edges for the canvas, plus the bulk apply endpoint that writes admin edits
back to Salesforce.

Auth: GET is allowed for any authenticated org user (read-only).
      POST /apply requires OrgUserRole.ORG_ADMIN (enforced in the service).

Audit: every successful PATCH to Salesforce produces an AuditLog row with
prior_value + new_value in context_data.
"""
from __future__ import annotations

import logging
from typing import Iterable, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, require_org_access, require_org_admin
from app.services import privacy_mode
from app.services.write_back import require_write_back
from app.domain.models import ProfileSnapshot, RoleSnapshot, UserSnapshot
from app.services.reporting_graph_service import (
    ReportingGraphService,
    UserRelationshipEdit,
)


logger = logging.getLogger(__name__)
router = APIRouter()


# ----- Response / request models -----


class ReportingGraphNode(BaseModel):
    user_sf_id: str
    name: str
    department: Optional[str]
    is_active: bool
    # Phase 2 additions for the side-panel + canvas color-by-role:
    title: Optional[str] = None
    role_name: Optional[str] = None
    profile_name: Optional[str] = None
    # 0 = root of role hierarchy, 1 = next level, ..., None if user has
    # no role assigned. Drives the canvas color ramp.
    role_depth: Optional[int] = None
    # People at scale: the raw relationships (even when the other user isn't
    # synced), the latest risk level, and what needs attention:
    #   no_manager                   an active user with no manager and no active direct
    #                                reports (someone with reports is the top of a tree)
    #   manager_inactive             the manager is an inactive user
    #   delegated_approver_inactive  the delegated approver is an inactive user
    #   manager_loop                 following managers up comes back to this user
    manager_id: Optional[str] = None
    delegated_approver_id: Optional[str] = None
    risk_level: Optional[str] = None
    flags: List[str] = Field(default_factory=list)


class ReportingGraphEdge(BaseModel):
    source: str  # the subordinate's user_sf_id
    target: str  # the manager / delegated-approver's user_sf_id
    edge_type: Literal["manager", "delegated_approver"]


class ReportingGraphResponse(BaseModel):
    nodes: List[ReportingGraphNode]
    edges: List[ReportingGraphEdge]


class RelationshipEditRequest(BaseModel):
    user_sf_id: str
    field: Literal["ManagerId", "DelegatedApproverId"]
    new_value: Optional[str] = Field(
        default=None,
        description="18-char SF user id, or null to clear the relationship.",
    )


class ApplyRequest(BaseModel):
    edits: List[RelationshipEditRequest]


class EditResultResponse(BaseModel):
    user_sf_id: str
    field: str
    success: bool
    prior_value: Optional[str]
    new_value: Optional[str]
    error: Optional[str] = None


class ApplyResponse(BaseModel):
    total: int
    succeeded: int
    failed: int
    results: List[EditResultResponse]


# ----- Helpers -----


def _manager_loops(users: Iterable[UserSnapshot]) -> set:
    """Users whose chain of managers comes back to them."""
    manager = {u.salesforce_id: u.manager_id for u in users if u.manager_id}
    in_loop: set = set()
    done: set = set()
    for start in manager:
        path: List[str] = []
        on_path: set = set()
        cur: Optional[str] = start
        while cur and cur not in done and cur not in on_path:
            path.append(cur)
            on_path.add(cur)
            cur = manager.get(cur)
        if cur is not None and cur in on_path:
            in_loop.update(path[path.index(cur):])
        done.update(path)
    return in_loop


def _flags(u: UserSnapshot, active_by_id: dict, loops: set, has_reports: set) -> List[str]:
    """What needs attention about a user's relationships (active users only)."""
    if not u.is_active:
        return []
    out = []
    if not u.manager_id:
        if u.salesforce_id not in has_reports:
            out.append("no_manager")
    elif active_by_id.get(u.manager_id) is False:
        out.append("manager_inactive")
    if u.salesforce_id in loops:
        out.append("manager_loop")
    if u.delegated_approver_id and active_by_id.get(u.delegated_approver_id) is False:
        out.append("delegated_approver_inactive")
    return out


async def _latest_risk_levels(db: AsyncSession, org_id: str) -> dict:
    """Salesforce user id -> the latest risk level ("low" ... "critical")."""
    from sqlalchemy import func
    from app.domain.models import RiskScore
    latest = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        .group_by(RiskScore.entity_id)
        .subquery()
    )
    rows = (await db.execute(
        select(RiskScore.entity_id, RiskScore.risk_level).join(
            latest, (RiskScore.entity_id == latest.c.entity_id) & (RiskScore.calculated_at == latest.c.at),
        ).where(RiskScore.organization_id == org_id)
    )).all()
    return {eid: str(getattr(level, "value", level)).lower() for eid, level in rows}


# ----- Endpoints -----


@router.get(
    "/orgs/{org_id}/reporting-graph",
    response_model=ReportingGraphResponse,
)
async def get_reporting_graph(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
) -> ReportingGraphResponse:
    """Every user with their manager and delegated-approver edges, for the
    People view. Reads from UserSnapshot (no SF callout). Inactive users are
    included (is_active false) so an inactive manager or delegated approver
    can be shown and flagged; the page hides inactive users unless asked.
    """
    await privacy_mode.require_feature(db, org_id, "reporting_graph")
    users = (await db.execute(
        select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
    )).scalars().all()
    risk = await _latest_risk_levels(db, org_id)

    # Side-panel enrichment + canvas color-by-role: pull RoleSnapshot +
    # ProfileSnapshot once per org and compute each role's depth in the
    # parent_role_id tree (BFS from roots).
    roles = (await db.execute(
        select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id)
    )).scalars().all()
    profiles = (await db.execute(
        select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id)
    )).scalars().all()

    roles_by_id = {r.salesforce_id: r for r in roles}
    profiles_by_id = {p.salesforce_id: p for p in profiles}

    # Role depth: 0 for roots, +1 per parent hop. Cap recursion to avoid
    # cycles (Salesforce shouldn't have cyclic role trees but defensive).
    role_depth: dict = {}
    for r in roles:
        depth = 0
        current = r.parent_role_id
        seen: set = set()
        while current and depth < 32 and current not in seen:
            seen.add(current)
            depth += 1
            parent = roles_by_id.get(current)
            if parent is None:
                break
            current = parent.parent_role_id
        role_depth[r.salesforce_id] = depth

    active_by_id = {u.salesforce_id: u.is_active for u in users}
    loops = _manager_loops(users)
    # People with at least one active direct report: the top of a tree when they have no manager.
    has_reports = {u.manager_id for u in users if u.is_active and u.manager_id}
    nodes = [
        ReportingGraphNode(
            user_sf_id=u.salesforce_id,
            name=u.name or u.username or u.salesforce_id,
            department=u.department,
            is_active=u.is_active,
            title=u.title,
            role_name=(
                roles_by_id[u.user_role_id].name
                if u.user_role_id and u.user_role_id in roles_by_id
                else None
            ),
            profile_name=(
                profiles_by_id[u.profile_id].name
                if u.profile_id and u.profile_id in profiles_by_id
                else None
            ),
            role_depth=(
                role_depth.get(u.user_role_id) if u.user_role_id else None
            ),
            manager_id=u.manager_id,
            delegated_approver_id=u.delegated_approver_id,
            risk_level=risk.get(u.salesforce_id),
            flags=_flags(u, active_by_id, loops, has_reports),
        )
        for u in users
    ]
    edges: List[ReportingGraphEdge] = []
    all_sf_ids = set(active_by_id)
    for u in users:
        if u.manager_id and u.manager_id in all_sf_ids:
            edges.append(ReportingGraphEdge(
                source=u.salesforce_id,
                target=u.manager_id,
                edge_type="manager",
            ))
        if u.delegated_approver_id and u.delegated_approver_id in all_sf_ids:
            edges.append(ReportingGraphEdge(
                source=u.salesforce_id,
                target=u.delegated_approver_id,
                edge_type="delegated_approver",
            ))

    return ReportingGraphResponse(nodes=nodes, edges=edges)


@router.post(
    "/orgs/{org_id}/reporting-graph/apply",
    response_model=ApplyResponse,
)
async def apply_reporting_graph_edits(
    org_id: str,
    payload: ApplyRequest,
    request: Request,
    _org: str = Depends(require_org_admin),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> ApplyResponse:
    """Apply a batch of manager / delegated-approver edits back to Salesforce.

    Authorization: actor must have OrgUserRole.ORG_ADMIN for this org
    (enforced inside ReportingGraphService.apply_edits).
    Partial-failure semantics: returns one EditResult per edit; success
    field tells the frontend which to retry / surface as errors.
    """
    await privacy_mode.require_feature(db, org_id, "reporting_graph")
    await require_write_back(db, org_id)
    if not payload.edits:
        return ApplyResponse(total=0, succeeded=0, failed=0, results=[])

    service = ReportingGraphService(db)
    actor_ip = request.client.host if request.client else None
    try:
        results = await service.apply_edits(
            org_id=org_id,
            actor_email=actor_email,
            actor_ip=actor_ip,
            edits=[
                UserRelationshipEdit(
                    user_sf_id=e.user_sf_id,
                    field=e.field,
                    new_value=e.new_value,
                )
                for e in payload.edits
            ],
        )
    except PermissionError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        )

    succeeded = sum(1 for r in results if r.success)
    return ApplyResponse(
        total=len(results),
        succeeded=succeeded,
        failed=len(results) - succeeded,
        results=[
            EditResultResponse(
                user_sf_id=r.user_sf_id,
                field=r.field,
                success=r.success,
                prior_value=r.prior_value,
                new_value=r.new_value,
                error=r.error,
            )
            for r in results
        ],
    )
