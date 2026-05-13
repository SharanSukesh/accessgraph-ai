"""Read-only queries that hydrate the Equity dashboard.

Reads from EquitySnapshot (latest row per org for the headline diagnostic)
and walks the snapshot graph fresh for the per-user disparity drill-down.

Kept separate from EquityRecommendationService so the two paths can fail
independently — the dashboard should still render even if a generation
run errored last time.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import EquitySnapshot, SalesforceConnection
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
    # Salesforce instance URL ("https://orgfarm-xyz.my.salesforce.com") so
    # the frontend can build deep-links from recommendations into the
    # right org. Null if no active SalesforceConnection for this org.
    salesforce_instance_url: Optional[str] = None


@dataclass
class HistoryPoint:
    """One row in the Equity Index trend series."""
    snapshot_at: str
    equity_index: float
    disparity: float
    vip_count: int
    recommendations_generated: int


@dataclass
class UserDisparityPayload:
    user_sf_id: str
    department: Optional[str]
    distance_to_nearest_vip: float           # inf -> json null at the route layer
    inverse_distance_utility: float
    department_avg_utility: float
    org_avg_utility: float
    is_vip: bool


@dataclass
class UserEquityRow:
    """One row in the bulk per-user equity list (drives the LWC + admin tab)."""
    user_sf_id: str
    name: str
    department: Optional[str]
    is_vip: bool
    # Distance to nearest VIP — None when unreachable. Lower = better.
    distance_to_nearest_vip: Optional[float]
    inverse_distance_utility: float
    department_avg_utility: float
    # How many active (status=pending) equity recommendations target this user
    open_recommendations: int


class EquityDiagnosticService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _instance_url(self, org_id: str) -> Optional[str]:
        """Fetch the most recent active SalesforceConnection.instance_url
        for the org. Used so frontend can build SF deep-links from recs.
        """
        conn: Optional[SalesforceConnection] = (
            await self.db.execute(
                select(SalesforceConnection)
                .where(
                    SalesforceConnection.organization_id == org_id,
                    SalesforceConnection.is_active.is_(True),
                )
                .order_by(desc(SalesforceConnection.created_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        return conn.instance_url if conn else None

    async def latest_diagnostic(self, org_id: str) -> DiagnosticPayload:
        instance_url = await self._instance_url(org_id)
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
                salesforce_instance_url=instance_url,
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
            salesforce_instance_url=instance_url,
        )

    async def history(self, org_id: str, limit: int = 30) -> List[HistoryPoint]:
        """Last N equity snapshots, oldest first (for left-to-right plotting).

        Caps at 200 server-side. Returns an empty list when no snapshots
        have ever been generated; the frontend can render an empty
        sparkline gracefully.
        """
        limit = max(1, min(int(limit), 200))
        rows: List[EquitySnapshot] = (
            await self.db.execute(
                select(EquitySnapshot)
                .where(EquitySnapshot.organization_id == org_id)
                .order_by(desc(EquitySnapshot.snapshot_at))
                .limit(limit)
            )
        ).scalars().all()
        # We queried newest-first; reverse for chronological order so
        # the sparkline reads left-to-right.
        return [
            HistoryPoint(
                snapshot_at=r.snapshot_at.isoformat() if r.snapshot_at else "",
                equity_index=float(r.equity_index or 0.0),
                disparity=float(r.disparity or 0.0),
                vip_count=int(r.vip_count or 0),
                recommendations_generated=int(r.recommendations_generated or 0),
            )
            for r in reversed(rows)
        ]

    async def user_equity_list(
        self,
        org_id: str,
        limit: int = 100,
        offset: int = 0,
        include_vips: bool = True,
    ) -> List[UserEquityRow]:
        """Per-user equity stats for the LWC + admin tab user list.

        Returns rows sorted by ascending utility (worst-off juniors first)
        which is the most informative view for an admin scanning who to
        help. Caps at 500 per page; pagination via offset.
        """
        from sqlalchemy import func
        from app.domain.models import Recommendation, RecommendationStatus, RecommendationTrack, UserSnapshot
        limit = max(1, min(int(limit), 500))
        offset = max(0, int(offset))

        rec_service = EquityRecommendationService(self.db)
        graph = await rec_service._build_graph(org_id)
        if not graph.user_ids:
            return []

        cost = rec_service._compute_distances(graph)
        _, _, _, per_user_util = rec_service._group_utilities(graph)
        group_util, _, _, _ = rec_service._group_utilities(graph)

        # Count open (pending) equity recs per target user in one round-trip
        rec_counts: Dict[str, int] = {}
        if not include_vips:
            rec_counts = {}  # we'll only show juniors anyway
        rows = (
            await self.db.execute(
                select(Recommendation.target_entity_id, func.count())
                .where(
                    Recommendation.organization_id == org_id,
                    Recommendation.track == RecommendationTrack.EQUITY,
                    Recommendation.status == RecommendationStatus.PENDING,
                )
                .group_by(Recommendation.target_entity_id)
            )
        ).all()
        for sf_id, count in rows:
            rec_counts[sf_id] = int(count)

        # Build name lookup
        users_by_sf_id = {
            u.salesforce_id: u for u in (
                await self.db.execute(
                    select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
                )
            ).scalars().all()
        }

        vip_set = set(graph.vip_indices.tolist())
        results: List[UserEquityRow] = []
        for sf_id, idx in graph.user_index.items():
            is_vip = idx in vip_set
            if is_vip and not include_vips:
                continue
            dept = graph.user_dept[idx]
            vip_dist = (
                cost[idx, graph.vip_indices]
                if graph.vip_indices.size > 0
                else None
            )
            if vip_dist is None or not np.isfinite(np.min(vip_dist)):
                nearest = None
                utility = 0.0
            else:
                nearest = float(np.min(vip_dist))
                utility = float(per_user_util[idx])
            user_row = users_by_sf_id.get(sf_id)
            display_name = (
                user_row.name if user_row and user_row.name
                else (user_row.username if user_row else sf_id)
            )
            results.append(UserEquityRow(
                user_sf_id=sf_id,
                name=display_name,
                department=dept,
                is_vip=is_vip,
                distance_to_nearest_vip=nearest,
                inverse_distance_utility=utility,
                department_avg_utility=float(group_util.get(dept, 0.0)) if dept else 0.0,
                open_recommendations=int(rec_counts.get(sf_id, 0)),
            ))

        # Sort: juniors with lowest utility first (most interesting). VIPs
        # land at the end via the (is_vip, utility) key.
        results.sort(key=lambda r: (r.is_vip, r.inverse_distance_utility))
        return results[offset:offset + limit]

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
