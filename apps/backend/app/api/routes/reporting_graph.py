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
from typing import Any, Dict, Iterable, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged, search, sort_rows
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
    """Users whose chain of managers comes back to them. Salesforce doesn't
    allow this (the Manager field prevents "selecting a user that directly
    or indirectly reports to themselves", Object Reference v68), so it's a
    safeguard: stored data that has a loop still shows, flagged."""
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
    return await _graph(db, org_id)


async def _graph(db: AsyncSession, org_id: str) -> ReportingGraphResponse:
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


def people_rows(graph: ReportingGraphResponse, include_inactive: bool = False) -> List[dict]:
    """The People list: each person with their manager, direct and total
    reports, by the same rules as the tree (lib/peopleTree.ts buildPeople).
    Shown people are active users, plus inactive ones an active person still
    reports to or delegates to; reports count shown people only."""
    by_id = {n.user_sf_id: n for n in graph.nodes}
    manager_of: Dict[str, str] = {}
    approver_of: Dict[str, str] = {}
    for e in graph.edges:
        if e.source not in by_id or e.target not in by_id or e.source == e.target:
            continue
        (manager_of if e.edge_type == "manager" else approver_of)[e.source] = e.target
    shown = {n.user_sf_id for n in graph.nodes if n.is_active}
    for pid in list(shown):
        for target in (manager_of.get(pid), approver_of.get(pid)):
            t, seen = target, set()
            while t and t not in shown and t not in seen:
                seen.add(t)
                shown.add(t)
                t = manager_of.get(t)
    reports: Dict[str, List[str]] = {}
    for pid in shown:
        m = manager_of.get(pid)
        if m and m in shown:
            reports.setdefault(m, []).append(pid)
    total: Dict[str, int] = {}

    def count(pid: str) -> int:
        # Iterative, and nobody counted twice when the data has a manager loop.
        below: set = set()
        stack = list(reports.get(pid, ()))
        while stack:
            cur = stack.pop()
            if cur in below or cur == pid:
                continue
            below.add(cur)
            stack.extend(reports.get(cur, ()))
        return len(below)

    pool = by_id.keys() if include_inactive else shown
    rows = []
    for pid in pool:
        n = by_id[pid]
        if pid not in total:
            total[pid] = count(pid)
        m = manager_of.get(pid)
        rows.append({**n.model_dump(), "manager_name": by_id[m].name if m else None,
                     "direct": len(reports.get(pid, ())), "total": total[pid]})
    return rows


PEOPLE_SORTS: Dict[str, Any] = {
    "name": lambda r: r["name"],
    "title": lambda r: r["title"],
    "role": lambda r: r["role_name"],
    "manager": lambda r: r["manager_name"],
    "direct": lambda r: r["direct"],
    "total": lambda r: r["total"],
}


@router.get("/orgs/{org_id}/reporting-graph/people")
async def list_people(
    org_id: str,
    department: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    profile: Optional[str] = Query(None),
    high_risk: bool = Query(False, alias="highRisk"),
    inactive: bool = Query(False),
    flag: Optional[str] = Query(None),
    manager: Optional[str] = Query(None, description="direct reports of this user"),
    params: PageParams = Depends(page_params),
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """The People view as a paged list (the standing pagination rule): the
    same filters as the graph, searched and sorted across everyone. Without
    `page`, every row (for the CSV export)."""
    await privacy_mode.require_feature(db, org_id, "reporting_graph")
    rows = people_rows(await _graph(db, org_id), include_inactive=inactive)
    rows = [r for r in rows if
            (not department or r["department"] == department)
            and (not role or r["role_name"] == role)
            and (not profile or r["profile_name"] == profile)
            and (not high_risk or r["risk_level"] in ("high", "critical"))
            and (not inactive or not r["is_active"])
            and (not flag or flag in r["flags"])
            and (not manager or r["manager_id"] == manager)]

    def text(r: dict) -> str:
        return " ".join(x for x in (r["name"], r["title"], r["role_name"], r["department"]) if x)

    if not params.paged:
        rows = search(rows, params.q, text)
        return {"items": sort_rows(rows, params, PEOPLE_SORTS, "name"), "total": len(rows)}
    if params.sort is None:
        params.sort, params.dir = "total", "desc"
    return paged(rows, params, text=text, sorts=PEOPLE_SORTS, default_sort="total")


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
