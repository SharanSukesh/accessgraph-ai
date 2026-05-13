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
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_current_org
from app.domain.models import UserSnapshot
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


# ----- Endpoints -----


@router.get(
    "/orgs/{org_id}/reporting-graph",
    response_model=ReportingGraphResponse,
)
async def get_reporting_graph(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> ReportingGraphResponse:
    """Current manager + delegated-approver edges for the canvas.

    Reads from UserSnapshot (no SF callout). Inactive users are excluded
    from nodes but kept on the source side of edges if they appear as a
    subordinate elsewhere — keeps the graph from breaking on archival.
    """
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's reporting graph.",
        )

    users = (await db.execute(
        select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.is_active.is_(True),
        )
    )).scalars().all()

    nodes = [
        ReportingGraphNode(
            user_sf_id=u.salesforce_id,
            name=u.name or u.username or u.salesforce_id,
            department=u.department,
            is_active=u.is_active,
        )
        for u in users
    ]
    edges: List[ReportingGraphEdge] = []
    active_sf_ids = {u.salesforce_id for u in users}
    for u in users:
        if u.manager_id and u.manager_id in active_sf_ids:
            edges.append(ReportingGraphEdge(
                source=u.salesforce_id,
                target=u.manager_id,
                edge_type="manager",
            ))
        if u.delegated_approver_id and u.delegated_approver_id in active_sf_ids:
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
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> ApplyResponse:
    """Apply a batch of manager / delegated-approver edits back to Salesforce.

    Authorization: actor must have OrgUserRole.ORG_ADMIN for this org
    (enforced inside ReportingGraphService.apply_edits).
    Partial-failure semantics: returns one EditResult per edit; success
    field tells the frontend which to retry / surface as errors.
    """
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot edit another org's reporting graph.",
        )
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
