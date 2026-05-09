"""Equity recommendations: read snapshots, build the heterogeneous user
graph, run the trained R-GCN policy in numpy, persist Recommendation rows.

Mirrors research/rl_solution/env.py and policy.py but in pure numpy so the
production backend never imports torch. The policy weights live at
research/rl_solution/artifacts/policy_v1.npz; if absent or unreadable we
fall back to the GECI greedy baseline so the feature still ships value.

This service is invoked manually via the equity router (POST
/orgs/{id}/equity/recommendations/generate). Auto-run after sync is
deferred to v2 — the orchestrator (apps/backend/app/ingestion/) is
explicitly off-limits per the project handoff.
"""
from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AnomalySeverity,
    EquitySnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    Recommendation,
    RecommendationStatus,
    RecommendationType,
    RoleSnapshot,
    UserSnapshot,
    VIPDesignation,
    VIPDesignationKind,
)


logger = logging.getLogger(__name__)


# Edge-type weights — must match research/rl_solution/env.py:EDGE_WEIGHTS.
EDGE_WEIGHTS = {
    "manages": 1.0,
    "role_above": 0.7,
    "ps_overlap": 0.5,
}

# Canonical vocabulary — must match research/rl_solution/env.py exactly so
# trained weights line up with the inference-time feature encoding. If
# this changes, retrain and re-export the policy.
CANONICAL_DEPARTMENTS = ("Finance", "HR", "IT", "Marketing", "Sales", "Support")
CANONICAL_SENIORITIES = ("admin", "senior", "mid", "junior")

NAME_PATTERN_TERMS = (
    "director", "vp ", " vp", "chief", "manager", "head of",
    "officer", "lead", "president", "hr business partner",
)

DEFAULT_BUDGET = 20
DEFAULT_LAMBDA = 0.5

# Where the trained policy lives. Configurable via env var so research/
# can checkpoint elsewhere without code changes.
POLICY_PATH_DEFAULT = "research/rl_solution/artifacts/policy_v1.npz"


@dataclass
class EquityGraph:
    """Snapshot of the org graph as numpy arrays for inference."""
    user_ids: List[str]
    user_index: Dict[str, int]
    user_dept: List[Optional[str]]
    user_seniority: List[Optional[str]]
    user_profile_name: List[str]
    user_role_name: List[str]
    ps_ids: List[str]
    ps_index: Dict[str, int]
    # Adjacency matrices (n, n) for user-user relations
    adj_manages: np.ndarray
    adj_role_above: np.ndarray
    # User-PS bipartite, mutated during the rollout
    user_ps: Dict[str, Set[str]]
    # R: integer indices into user_ids
    vip_indices: np.ndarray
    junior_indices: np.ndarray


@dataclass
class EquityProposal:
    """One (junior, PS) grant the policy proposes."""
    user_idx: int
    ps_idx: int
    user_sf_id: str
    ps_sf_id: str
    department: Optional[str]
    group_before_utility: float
    group_after_utility: float
    delta_disparity: float
    rationale: str


@dataclass
class EquityRunResult:
    """End-to-end output of one .generate() call."""
    snapshot_id: str
    recommendations_created: int
    equity_index: float
    disparity: float
    most_disadvantaged_group: Optional[str]
    vip_count: int
    per_dept_utilities: Dict[str, float]
    edge_type_counts: Dict[str, int]


class EquityRecommendationService:
    """Read-only against existing snapshots, write-only against the new
    equity tables and the existing Recommendation table."""

    def __init__(
        self,
        db: AsyncSession,
        budget: int = DEFAULT_BUDGET,
        lambda_disparity: float = DEFAULT_LAMBDA,
        policy_path: Optional[str] = None,
    ):
        self.db = db
        self.budget = budget
        self.lambda_disparity = lambda_disparity
        self.policy_path = policy_path or os.environ.get(
            "EQUITY_POLICY_PATH", POLICY_PATH_DEFAULT
        )

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    async def generate(self, org_id: str) -> EquityRunResult:
        graph = await self._build_graph(org_id)
        if graph.vip_indices.size == 0:
            logger.warning(
                "Equity: no VIPs identified for org %s; skipping recs", org_id,
            )
            return await self._persist_empty_snapshot(org_id, graph)

        runner = _PolicyRunner.try_load(self.policy_path)
        proposals = self._roll_out(graph, runner)
        snapshot = await self._persist(org_id, graph, proposals)
        return snapshot

    # ------------------------------------------------------------------
    # Graph construction
    # ------------------------------------------------------------------
    async def _build_graph(self, org_id: str) -> EquityGraph:
        users = (await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.is_active.is_(True),
            )
        )).scalars().all()

        roles = (await self.db.execute(
            select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id)
        )).scalars().all()

        profiles = (await self.db.execute(
            select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id)
        )).scalars().all()

        assignments = (await self.db.execute(
            select(PermissionSetAssignmentSnapshot).where(
                PermissionSetAssignmentSnapshot.organization_id == org_id,
            )
        )).scalars().all()

        permission_sets = (await self.db.execute(
            select(PermissionSetSnapshot).where(
                PermissionSetSnapshot.organization_id == org_id,
            )
        )).scalars().all()

        designations = (await self.db.execute(
            select(VIPDesignation).where(VIPDesignation.organization_id == org_id)
        )).scalars().all()

        return self._materialize_graph(
            users, roles, profiles, assignments, permission_sets, designations,
        )

    def _materialize_graph(
        self,
        users: List[UserSnapshot],
        roles: List[RoleSnapshot],
        profiles: List[ProfileSnapshot],
        assignments: List[PermissionSetAssignmentSnapshot],
        permission_sets: List[PermissionSetSnapshot],
        designations: List[VIPDesignation],
    ) -> EquityGraph:
        user_ids = [u.salesforce_id for u in users]
        user_index = {sf_id: i for i, sf_id in enumerate(user_ids)}
        n = len(users)

        profiles_by_id = {p.salesforce_id: p for p in profiles}
        roles_by_id = {r.salesforce_id: r for r in roles}

        user_dept = [u.department for u in users]
        user_profile_name = [
            profiles_by_id[u.profile_id].name if u.profile_id and u.profile_id in profiles_by_id else ""
            for u in users
        ]
        user_role_name = [
            roles_by_id[u.user_role_id].name if u.user_role_id and u.user_role_id in roles_by_id else ""
            for u in users
        ]
        # Seniority is approximated from role name suffix ("admin", "senior",
        # "mid", "junior") if the org follows the synthetic convention; for
        # real Salesforce orgs without that convention we leave it None and
        # the encoder treats it as a separate one-hot bucket.
        user_seniority: List[Optional[str]] = []
        for rn in user_role_name:
            seniority = None
            for marker in ("admin", "senior", "mid", "junior"):
                if rn.lower().endswith(f"-{marker}") or marker in rn.lower():
                    seniority = marker
                    break
            user_seniority.append(seniority)

        # Adjacency: manages — junior -> manager
        adj_manages = np.zeros((n, n), dtype=np.float32)
        for u in users:
            if u.manager_id and u.manager_id in user_index:
                i = user_index[u.salesforce_id]
                j = user_index[u.manager_id]
                adj_manages[i, j] = 1.0

        # Adjacency: role_above — user a -> user b if b's role is an ancestor of a's role
        ancestors_per_role: Dict[str, Set[str]] = {}
        for role in roles:
            seen: Set[str] = set()
            current: Optional[str] = role.parent_role_id
            depth = 0
            while current is not None and depth < 32 and current not in seen:
                seen.add(current)
                parent = roles_by_id.get(current)
                if parent is None:
                    break
                current = parent.parent_role_id
                depth += 1
            ancestors_per_role[role.salesforce_id] = seen
        adj_role_above = np.zeros((n, n), dtype=np.float32)
        for i, u in enumerate(users):
            if not u.user_role_id:
                continue
            anc = ancestors_per_role.get(u.user_role_id, set())
            if not anc:
                continue
            for v in users:
                if v.user_role_id in anc and v.salesforce_id != u.salesforce_id:
                    j = user_index[v.salesforce_id]
                    adj_role_above[i, j] = 1.0

        # User-PS bipartite (mutable during rollout)
        user_ps: Dict[str, Set[str]] = {sf_id: set() for sf_id in user_ids}
        for a in assignments:
            if a.assignee_id in user_ps:
                user_ps[a.assignee_id].add(a.permission_set_id)

        ps_ids = sorted({ps.salesforce_id for ps in permission_sets})
        ps_index = {pid: i for i, pid in enumerate(ps_ids)}

        # ----- VIP set R (multi-signal) -----
        managers_in_data: Set[str] = {u.manager_id for u in users if u.manager_id}
        admin_roots: Set[str] = set()
        for u in users:
            if u.manager_id is None and (
                u.user_role_id is None
                or roles_by_id.get(u.user_role_id) is not None
                and roles_by_id[u.user_role_id].parent_role_id is None
            ):
                admin_roots.add(u.salesforce_id)
        # Top-2 levels of role tree
        depth_0 = {r.salesforce_id for r in roles if r.parent_role_id is None}
        depth_1 = {r.salesforce_id for r in roles if r.parent_role_id in depth_0}
        top_role_ids = depth_0 | depth_1
        top_role_users = {u.salesforce_id for u in users if u.user_role_id in top_role_ids}
        # Name-pattern match
        name_match: Set[str] = set()
        for u in users:
            haystack = " ".join([
                user_profile_name[user_index[u.salesforce_id]],
                user_role_name[user_index[u.salesforce_id]],
                u.title or "",
            ]).lower()
            if any(term in haystack for term in NAME_PATTERN_TERMS):
                name_match.add(u.salesforce_id)
        # Admin override
        pinned = {d.user_sf_id for d in designations if d.kind == VIPDesignationKind.PIN}
        unpinned = {d.user_sf_id for d in designations if d.kind == VIPDesignationKind.UNPIN}

        vip_user_ids = (
            (managers_in_data | admin_roots | top_role_users | name_match | pinned)
            - unpinned
        )
        vip_user_ids &= set(user_ids)
        vip_indices = np.array(
            sorted(user_index[sf_id] for sf_id in vip_user_ids),
            dtype=np.int64,
        )
        junior_indices = np.array(
            sorted(i for sf_id, i in user_index.items() if sf_id not in vip_user_ids),
            dtype=np.int64,
        )

        return EquityGraph(
            user_ids=user_ids,
            user_index=user_index,
            user_dept=user_dept,
            user_seniority=user_seniority,
            user_profile_name=user_profile_name,
            user_role_name=user_role_name,
            ps_ids=ps_ids,
            ps_index=ps_index,
            adj_manages=adj_manages,
            adj_role_above=adj_role_above,
            user_ps=user_ps,
            vip_indices=vip_indices,
            junior_indices=junior_indices,
        )

    # ------------------------------------------------------------------
    # Distance / utility math (numpy-only; mirrors env._snapshot_info)
    # ------------------------------------------------------------------
    def _build_ps_adjacency(self, graph: EquityGraph) -> np.ndarray:
        n = len(graph.user_ids)
        adj = np.zeros((n, n), dtype=np.float32)
        ps_to_users: Dict[str, List[int]] = {}
        for sf_id, ps_set in graph.user_ps.items():
            i = graph.user_index[sf_id]
            for ps in ps_set:
                ps_to_users.setdefault(ps, []).append(i)
        for idxs in ps_to_users.values():
            if len(idxs) < 2:
                continue
            arr = np.array(idxs)
            for a in arr:
                for b in arr:
                    if a != b:
                        adj[a, b] = 1.0
        return adj

    def _compute_distances(self, graph: EquityGraph) -> np.ndarray:
        n = len(graph.user_ids)
        cost = np.full((n, n), np.inf, dtype=np.float32)
        np.fill_diagonal(cost, 0.0)

        def _apply(adj: np.ndarray, edge_cost: float) -> None:
            mask = adj > 0
            cost[mask] = np.minimum(cost[mask], edge_cost)

        _apply(graph.adj_manages, 1.0 / EDGE_WEIGHTS["manages"])
        _apply(graph.adj_role_above, 1.0 / EDGE_WEIGHTS["role_above"])
        _apply(self._build_ps_adjacency(graph), 1.0 / EDGE_WEIGHTS["ps_overlap"])

        for k in range(n):
            row_k = cost[k, :][None, :]
            col_k = cost[:, k][:, None]
            cost = np.minimum(cost, col_k + row_k)
        return cost

    def _group_utilities(
        self, graph: EquityGraph
    ) -> Tuple[Dict[str, float], float, Optional[str], np.ndarray]:
        if graph.vip_indices.size == 0:
            return {}, 0.0, None, np.zeros(len(graph.user_ids), dtype=np.float32)
        cost = self._compute_distances(graph)
        vip_dist = cost[:, graph.vip_indices]
        min_d = np.min(vip_dist, axis=1)
        with np.errstate(divide="ignore"):
            per_user_util = np.where(np.isinf(min_d), 0.0, 1.0 / np.maximum(min_d, 1e-6))

        utils_by_dept: Dict[str, List[float]] = {}
        for idx in graph.junior_indices.tolist():
            dept = graph.user_dept[idx]
            if dept is None:
                continue
            utils_by_dept.setdefault(dept, []).append(float(per_user_util[idx]))
        group_util = {d: float(np.mean(v)) if v else 0.0 for d, v in utils_by_dept.items()}

        if group_util:
            mean_u = float(np.mean(list(group_util.values())))
            disparity = float(sum(abs(u - mean_u) for u in group_util.values()))
            most_dis = min(group_util, key=group_util.get)
        else:
            disparity = 0.0
            most_dis = None
        return group_util, disparity, most_dis, per_user_util

    def _equity_index(self, group_util: Dict[str, float]) -> float:
        vals = sorted(group_util.values())
        n = len(vals)
        if n == 0:
            return 1.0
        s = sum(vals)
        if s <= 0:
            return 0.0
        cum = sum(i * v for i, v in enumerate(vals, start=1))
        gini = (2.0 * cum) / (n * s) - (n + 1) / n
        return float(max(0.0, min(1.0, 1.0 - gini)))

    # ------------------------------------------------------------------
    # Rollout: pick B (junior, PS) edges
    # ------------------------------------------------------------------
    def _roll_out(
        self, graph: EquityGraph, runner: Optional["_PolicyRunner"]
    ) -> List[EquityProposal]:
        proposals: List[EquityProposal] = []
        for _ in range(self.budget):
            group_util, disparity, most_dis, _ = self._group_utilities(graph)
            if most_dis is None:
                break

            action = self._choose_action(graph, runner, group_util, most_dis)
            if action is None:
                break
            user_idx, ps_idx = action

            user_sf_id = graph.user_ids[user_idx]
            ps_sf_id = graph.ps_ids[ps_idx]
            graph.user_ps.setdefault(user_sf_id, set()).add(ps_sf_id)

            new_util, new_disparity, _, _ = self._group_utilities(graph)
            before = group_util.get(most_dis, 0.0)
            after = new_util.get(most_dis, 0.0)
            rationale = (
                f"Grants {ps_sf_id} → reduces avg distance for {most_dis} group "
                f"({before:.3f} → {after:.3f}); equity index "
                f"{self._equity_index(group_util):.3f} → {self._equity_index(new_util):.3f}"
            )
            proposals.append(EquityProposal(
                user_idx=user_idx,
                ps_idx=ps_idx,
                user_sf_id=user_sf_id,
                ps_sf_id=ps_sf_id,
                department=graph.user_dept[user_idx],
                group_before_utility=before,
                group_after_utility=after,
                delta_disparity=new_disparity - disparity,
                rationale=rationale,
            ))
        return proposals

    def _action_mask(self, graph: EquityGraph) -> np.ndarray:
        """(n_juniors, n_ps) — 1 where the edge is legal AND useful."""
        n_jr = len(graph.junior_indices)
        n_ps = len(graph.ps_ids)
        mask = np.zeros((n_jr, n_ps), dtype=np.float32)
        vip_user_ids = {graph.user_ids[i] for i in graph.vip_indices.tolist()}
        ps_held_by_vip: Set[str] = set()
        for sf_id in vip_user_ids:
            ps_held_by_vip.update(graph.user_ps.get(sf_id, set()))
        for ji, uidx in enumerate(graph.junior_indices.tolist()):
            sf_id = graph.user_ids[uidx]
            held = graph.user_ps.get(sf_id, set())
            for pi, ps_id in enumerate(graph.ps_ids):
                if ps_id in held:
                    continue
                if ps_id not in ps_held_by_vip:
                    continue
                mask[ji, pi] = 1.0
        return mask

    def _choose_action(
        self,
        graph: EquityGraph,
        runner: Optional["_PolicyRunner"],
        group_util: Dict[str, float],
        most_dis: str,
    ) -> Optional[Tuple[int, int]]:
        """Pick (user_idx, ps_idx) using policy if available, else GECI fallback."""
        mask = self._action_mask(graph)
        if mask.sum() == 0:
            return None

        if runner is not None:
            try:
                logits = runner.actor_logits(graph)
                logits = np.where(mask >= 0.5, logits, -1e9)
                # Argmax over (junior, ps) grid restricted to most_dis dept.
                # We softly prefer juniors in the disadvantaged group by zeroing
                # logits elsewhere; if the policy disagrees its argmax inside
                # the dept still wins.
                jr_dept_mask = np.zeros(mask.shape[0], dtype=bool)
                for ji, uidx in enumerate(graph.junior_indices.tolist()):
                    if graph.user_dept[uidx] == most_dis:
                        jr_dept_mask[ji] = True
                if jr_dept_mask.any():
                    logits[~jr_dept_mask, :] = -1e9
                if np.all(logits == -1e9):
                    # Policy + dept restriction left no option; fall through.
                    pass
                else:
                    flat = logits.flatten()
                    flat_idx = int(np.argmax(flat))
                    n_ps = mask.shape[1]
                    ji, pi = divmod(flat_idx, n_ps)
                    return int(graph.junior_indices[ji]), int(pi)
            except Exception as exc:
                logger.warning("Equity policy failed (%s); falling back to GECI", exc)

        # GECI fallback: simulate every legal (j, ps) restricted to most_dis dept.
        best_score = -math.inf
        best_action: Optional[Tuple[int, int]] = None
        for ji, uidx in enumerate(graph.junior_indices.tolist()):
            if graph.user_dept[uidx] != most_dis:
                continue
            sf_id = graph.user_ids[uidx]
            for pi, ps_id in enumerate(graph.ps_ids):
                if mask[ji, pi] < 0.5:
                    continue
                # Simulate
                graph.user_ps.setdefault(sf_id, set()).add(ps_id)
                util_after, _, _, _ = self._group_utilities(graph)
                graph.user_ps[sf_id].discard(ps_id)
                score = util_after.get(most_dis, 0.0)
                if score > best_score:
                    best_score = score
                    best_action = (uidx, pi)
        return best_action

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    async def _persist(
        self,
        org_id: str,
        graph: EquityGraph,
        proposals: List[EquityProposal],
    ) -> EquityRunResult:
        group_util, disparity, most_dis, _ = self._group_utilities(graph)
        equity_index = self._equity_index(group_util)
        edge_counts = {
            "manages": int(graph.adj_manages.sum()),
            "role_above": int(graph.adj_role_above.sum()),
            "ps_overlap": int(self._build_ps_adjacency(graph).sum()),
        }

        now = datetime.now(timezone.utc)
        snapshot = EquitySnapshot(
            organization_id=org_id,
            snapshot_at=now,
            equity_index=equity_index,
            disparity=disparity,
            most_disadvantaged_group=most_dis,
            vip_count=int(graph.vip_indices.size),
            per_dept_utilities=group_util,
            edge_type_counts=edge_counts,
            raw_metrics={
                "n_users": len(graph.user_ids),
                "n_ps": len(graph.ps_ids),
                "budget": self.budget,
                "lambda_disparity": self.lambda_disparity,
                "policy_loaded": os.path.exists(self.policy_path),
            },
            recommendations_generated=len(proposals),
            created_at=now,
            updated_at=now,
        )
        self.db.add(snapshot)

        for p in proposals:
            rec = Recommendation(
                organization_id=org_id,
                rec_type=RecommendationType.GRANT_FOR_EQUITY,
                status=RecommendationStatus.PENDING,
                severity=AnomalySeverity.INFO,
                target_entity_type="user",
                target_entity_id=p.user_sf_id,
                title=f"Grant {p.ps_sf_id} for equity ({p.department or 'unknown'})",
                description=(
                    f"Granting permission set {p.ps_sf_id} to user {p.user_sf_id} is "
                    f"predicted to improve {p.department or 'their group'}'s "
                    f"access to VIP resources."
                ),
                rationale=p.rationale,
                impact_summary={
                    "department": p.department,
                    "group_before_utility": p.group_before_utility,
                    "group_after_utility": p.group_after_utility,
                    "delta_disparity": p.delta_disparity,
                },
                affected_access={
                    "ps_id": p.ps_sf_id,
                    "user_id": p.user_sf_id,
                    "track": "equity",
                },
                generated_at=datetime.now(timezone.utc),
            )
            self.db.add(rec)

        await self.db.commit()
        await self.db.refresh(snapshot)
        return EquityRunResult(
            snapshot_id=snapshot.id,
            recommendations_created=len(proposals),
            equity_index=equity_index,
            disparity=disparity,
            most_disadvantaged_group=most_dis,
            vip_count=int(graph.vip_indices.size),
            per_dept_utilities=group_util,
            edge_type_counts=edge_counts,
        )

    async def _persist_empty_snapshot(
        self, org_id: str, graph: EquityGraph
    ) -> EquityRunResult:
        now = datetime.now(timezone.utc)
        snapshot = EquitySnapshot(
            organization_id=org_id,
            snapshot_at=now,
            equity_index=1.0,
            disparity=0.0,
            most_disadvantaged_group=None,
            vip_count=0,
            per_dept_utilities={},
            edge_type_counts={},
            raw_metrics={"reason": "empty_R", "n_users": len(graph.user_ids)},
            recommendations_generated=0,
            created_at=now,
            updated_at=now,
        )
        self.db.add(snapshot)
        await self.db.commit()
        await self.db.refresh(snapshot)
        return EquityRunResult(
            snapshot_id=snapshot.id,
            recommendations_created=0,
            equity_index=1.0,
            disparity=0.0,
            most_disadvantaged_group=None,
            vip_count=0,
            per_dept_utilities={},
            edge_type_counts={},
        )


# ---------------------------------------------------------------------
# Numpy-only inference adapter for the trained R-GCN policy.
# Mirrors research/rl_solution/policy.py forward pass.
# ---------------------------------------------------------------------


class _PolicyRunner:
    """Loads policy weights from .npz and runs a numpy forward pass.

    Falls back gracefully — the service catches any exception here and
    drops to GECI rather than crash inference.
    """

    def __init__(self, weights: Dict[str, np.ndarray]):
        self.weights = weights

    @classmethod
    def try_load(cls, path: str) -> Optional["_PolicyRunner"]:
        p = Path(path)
        if not p.exists():
            logger.info("Equity policy weights not found at %s; using GECI fallback", path)
            return None
        try:
            data = np.load(p, allow_pickle=True)
            return cls({k: data[k] for k in data.files if not k.startswith("__")})
        except Exception as exc:
            logger.warning("Failed to load equity policy weights at %s: %s", path, exc)
            return None

    @staticmethod
    def _relu(x: np.ndarray) -> np.ndarray:
        return np.maximum(x, 0.0)

    def _node_features(self, graph: EquityGraph) -> np.ndarray:
        n = len(graph.user_ids)
        depts = CANONICAL_DEPARTMENTS
        seniorities = CANONICAL_SENIORITIES
        feat_dim = len(depts) + len(seniorities) + 2  # +is_vip, +is_junior
        feats = np.zeros((n, feat_dim), dtype=np.float32)
        vip_set = set(graph.vip_indices.tolist())
        jr_set = set(graph.junior_indices.tolist())
        for i in range(n):
            d = graph.user_dept[i]
            if d in depts:
                feats[i, depts.index(d)] = 1.0
            s = graph.user_seniority[i]
            if s in seniorities:
                feats[i, len(depts) + seniorities.index(s)] = 1.0
            if i in vip_set:
                feats[i, len(depts) + len(seniorities)] = 1.0
            if i in jr_set:
                feats[i, len(depts) + len(seniorities) + 1] = 1.0
        return feats

    def _adj_dict(self, graph: EquityGraph, ps_adj: np.ndarray) -> Dict[str, np.ndarray]:
        return {
            "manages": graph.adj_manages,
            "role_above": graph.adj_role_above,
            "ps_overlap": ps_adj,
        }

    def _rgcn_layer(self, x: np.ndarray, adjs: Dict[str, np.ndarray], prefix: str) -> np.ndarray:
        # self_loop: Linear(in, out) — weight (out, in), bias (out,)
        sl_w = self.weights.get(f"{prefix}.self_loop.weight")
        sl_b = self.weights.get(f"{prefix}.self_loop.bias")
        if sl_w is None or sl_b is None:
            raise RuntimeError(f"Missing self_loop weights for {prefix}")
        out = x @ sl_w.T + sl_b
        for et in ("manages", "role_above", "ps_overlap"):
            w = self.weights.get(f"{prefix}.weights.{et}.weight")
            if w is None:
                continue
            adj = adjs[et]
            deg = adj.sum(axis=1, keepdims=True)
            deg = np.where(deg < 1.0, 1.0, deg)
            norm_adj = adj / deg
            out = out + (norm_adj @ x) @ w.T
        return self._relu(out)

    def actor_logits(self, graph: EquityGraph) -> np.ndarray:
        ps_adj = np.zeros((len(graph.user_ids), len(graph.user_ids)), dtype=np.float32)
        # Reproject ps_overlap (may have shifted as the policy added edges)
        ps_to_users: Dict[str, List[int]] = {}
        for sf_id, ps_set in graph.user_ps.items():
            i = graph.user_index[sf_id]
            for ps in ps_set:
                ps_to_users.setdefault(ps, []).append(i)
        for idxs in ps_to_users.values():
            if len(idxs) < 2:
                continue
            for a in idxs:
                for b in idxs:
                    if a != b:
                        ps_adj[a, b] = 1.0

        feats = self._node_features(graph)
        adjs = self._adj_dict(graph, ps_adj)
        h = self._rgcn_layer(feats, adjs, "layer1")
        h = self._rgcn_layer(h, adjs, "layer2")

        ps_emb = self.weights.get("ps_embeddings.weight")
        bilinear_w = self.weights.get("actor_bilinear.weight")
        if ps_emb is None or bilinear_w is None:
            raise RuntimeError("Missing actor head weights")

        # bilinear: shape (1, embed_dim, embed_dim) per torch.nn.Bilinear convention
        if bilinear_w.ndim == 3:
            W = bilinear_w[0]
        else:
            W = bilinear_w

        n_jr = len(graph.junior_indices)
        # Match PS embedding table size to current org's PS count.
        n_ps_in_table = ps_emb.shape[0]
        n_ps = min(len(graph.ps_ids), n_ps_in_table)
        junior_emb = h[graph.junior_indices][:n_jr]
        ps_emb_used = ps_emb[:n_ps]
        # logits[j, p] = junior_emb[j] @ W @ ps_emb_used[p].T
        scored = junior_emb @ W @ ps_emb_used.T
        # If the org has more PSes than the table (unlikely but possible),
        # pad with -inf so we never pick them.
        if len(graph.ps_ids) > n_ps:
            pad = np.full((n_jr, len(graph.ps_ids) - n_ps), -1e9, dtype=np.float32)
            scored = np.concatenate([scored, pad], axis=1)
        return scored.astype(np.float32)
