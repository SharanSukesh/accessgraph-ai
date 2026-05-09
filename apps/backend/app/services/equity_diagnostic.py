"""Read-only queries that hydrate the Equity dashboard.

Reads from EquitySnapshot (latest row per org for the headline diagnostic)
and walks the snapshot graph fresh for the per-user disparity drill-down.

Kept separate from EquityRecommendationService so the two paths can fail
independently — the dashboard should still render even if a generation
run errored last time.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional

import numpy as np
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import EquitySnapshot, UserSnapshot
from app.services.equity_recommendations import EquityRecommendationService


logger = logging.getLogger(__name__)


@dataclass
class DiagnosticPayload:
    snapshot_id: Optional[str]
    snapshot_at: Optional[str]
    equity_index: float
    disparity: float
    most_disadvantaged_group: Optional[str]
    vip_count: int
    per_dept_utilities: Dict[str, float]
    edge_type_counts: Dict[str, int]
    recommendations_generated: int
    has_data: bool


@dataclass
class UserDisparityPayload:
    user_sf_id: str
    department: Optional[str]
    distance_to_nearest_vip: float           # inf -> json null at the route layer
    inverse_distance_utility: float
    department_avg_utility: float
    org_avg_utility: float
    is_vip: bool


class EquityDiagnosticService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def latest_diagnostic(self, org_id: str) -> DiagnosticPayload:
        snapshot: Optional[EquitySnapshot] = (
            await self.db.execute(
                select(EquitySnapshot)
                .where(EquitySnapshot.organization_id == org_id)
                .order_by(desc(EquitySnapshot.snapshot_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        if snapshot is None:
            return DiagnosticPayload(
                snapshot_id=None, snapshot_at=None, equity_index=0.0,
                disparity=0.0, most_disadvantaged_group=None, vip_count=0,
                per_dept_utilities={}, edge_type_counts={},
                recommendations_generated=0, has_data=False,
            )
        return DiagnosticPayload(
            snapshot_id=snapshot.id,
            snapshot_at=snapshot.snapshot_at.isoformat() if snapshot.snapshot_at else None,
            equity_index=float(snapshot.equity_index),
            disparity=float(snapshot.disparity),
            most_disadvantaged_group=snapshot.most_disadvantaged_group,
            vip_count=int(snapshot.vip_count),
            per_dept_utilities=dict(snapshot.per_dept_utilities or {}),
            edge_type_counts=dict(snapshot.edge_type_counts or {}),
            recommendations_generated=int(snapshot.recommendations_generated or 0),
            has_data=True,
        )

    async def user_disparity(self, org_id: str, user_sf_id: str) -> UserDisparityPayload:
        """Recompute the live graph + utilities so the per-user view is
        always current. Reuses EquityRecommendationService's graph builder.
        """
        rec_service = EquityRecommendationService(self.db)
        graph = await rec_service._build_graph(org_id)
        if user_sf_id not in graph.user_index:
            raise ValueError(f"User {user_sf_id} not found in org {org_id}")

        idx = graph.user_index[user_sf_id]
        is_vip = idx in graph.vip_indices.tolist()
        dept = graph.user_dept[idx]

        if graph.vip_indices.size == 0:
            return UserDisparityPayload(
                user_sf_id=user_sf_id, department=dept,
                distance_to_nearest_vip=float("inf"),
                inverse_distance_utility=0.0,
                department_avg_utility=0.0,
                org_avg_utility=0.0,
                is_vip=is_vip,
            )

        cost = rec_service._compute_distances(graph)
        vip_dist = cost[idx, graph.vip_indices]
        nearest = float(np.min(vip_dist)) if vip_dist.size else float("inf")
        utility = 0.0 if not np.isfinite(nearest) else 1.0 / max(nearest, 1e-6)

        group_util, _, _, per_user_util = rec_service._group_utilities(graph)
        dept_avg = group_util.get(dept, 0.0) if dept else 0.0
        all_juniors = per_user_util[graph.junior_indices]
        org_avg = float(np.mean(all_juniors)) if all_juniors.size else 0.0

        return UserDisparityPayload(
            user_sf_id=user_sf_id,
            department=dept,
            distance_to_nearest_vip=nearest,
            inverse_distance_utility=float(utility),
            department_avg_utility=float(dept_avg),
            org_avg_utility=org_avg,
            is_vip=is_vip,
        )
