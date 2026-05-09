"""EquityAccessEnv: Markov reward process where the agent grants PS edges.

Mirrors paper §III-C / §IV. The state is a heterogeneous user graph (manages,
role_above, ps_overlap). Each step adds one ps_overlap edge under budget B.
Reward is the per-step change in worst-group utility minus a disparity penalty.

The env emits a numpy observation dict that the R-GCN policy converts to
torch tensors; nothing here imports torch so unit tests stay light.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np

from research.rl_solution.data.synth_hierarchy import (
    HeterogeneousOrg,
    generate_heterogeneous_org,
)


# Edge-type weights → cost = 1/weight. Strong ties cost less to traverse.
# Tuneable; matches the defaults documented in the plan.
EDGE_WEIGHTS = {
    "manages": 1.0,
    "role_above": 0.7,
    "ps_overlap": 0.5,
}

# Reward shaping: r = ΔU_min(group) − λ·D
DEFAULT_LAMBDA = 0.5

# When R is empty for an org we skip the episode rather than yield NaN rewards.
EMPTY_R_FALLBACK_REWARD = 0.0

# Canonical vocabulary so node-feature dim is constant across orgs of any
# persona (small_business uses a subset of these departments). Order is
# stable so trained weights stay valid across runs.
CANONICAL_DEPARTMENTS = ("Finance", "HR", "IT", "Marketing", "Sales", "Support")
CANONICAL_SENIORITIES = ("admin", "senior", "mid", "junior")


@dataclass
class StepInfo:
    """Diagnostic payload returned alongside the (obs, reward) tuple."""
    edge_type_counts: Dict[str, int]
    group_utilities: Dict[str, float]
    disparity: float
    equity_index: float  # 1 - Gini
    most_disadvantaged_group: Optional[str]
    invalid_action: bool


class EquityAccessEnv:
    """Gymnasium-style env. We don't subclass gym.Env to avoid the dep at
    test time; train.py adapts this to whatever interface PPO expects.

    State is internally a set of edges per relation. The action space is
    (n_juniors x n_ps) — a flat index that the agent picks via the action
    mask. Steps that propose already-existing edges are no-ops with a
    small negative reward (encourages the agent to read the mask).
    """

    def __init__(
        self,
        budget: int = 20,
        lambda_disparity: float = DEFAULT_LAMBDA,
        invalid_action_penalty: float = -0.05,
    ):
        self.budget = budget
        self.lambda_disparity = lambda_disparity
        self.invalid_action_penalty = invalid_action_penalty
        self._het: Optional[HeterogeneousOrg] = None
        self._steps_taken = 0
        self._vip_indices: np.ndarray = np.array([], dtype=np.int64)
        self._junior_indices: np.ndarray = np.array([], dtype=np.int64)
        self._ps_assignments_mut: Dict[str, set] = {}
        # Cached per-reset structure
        self._adj_manages: np.ndarray = np.zeros((0, 0))
        self._adj_role_above: np.ndarray = np.zeros((0, 0))
        self._dept_of_user_idx: List[Optional[str]] = []
        self._last_group_util: Dict[str, float] = {}

    # ---------------------------------------------------------------
    # Reset / setup
    # ---------------------------------------------------------------
    def reset(
        self,
        persona: str = "mid_market",
        seed: int = 0,
        het: Optional[HeterogeneousOrg] = None,
    ) -> Tuple[Dict[str, np.ndarray], StepInfo]:
        if het is None:
            het = generate_heterogeneous_org(persona=persona, seed=seed)
        self._het = het
        self._steps_taken = 0
        self._ps_assignments_mut = {uid: set(pids) for uid, pids in het.ps_assignments.items()}

        n_users = het.n_users()
        users = het.org.users
        self._dept_of_user_idx = [u.department for u in users]

        # VIP set R (v1 multi-signal): union of
        #   (1) users who appear as someone's manager
        #   (2) users with NULL manager (top-of-tree) when role is admin/senior
        #   (3) name-pattern match on profile_name / role_name
        # Admin override is a no-op in the env (no VIPDesignation table here).
        managers_in_data: set = {m for m in het.manages.values() if m}
        admin_role_users: set = {
            u.user_id for u in users
            if u.role_name and u.role_name.endswith(("-admin", "-senior"))
            and het.manages.get(u.user_id) is None
        }
        name_pattern_terms = (
            "director", "vp ", " vp", "chief", "manager", "head of",
            "officer", "lead", "president", "hr business partner",
        )
        name_match: set = set()
        for u in users:
            haystack = " ".join(filter(None, (u.profile_name, u.role_name))).lower()
            if any(term in haystack for term in name_pattern_terms):
                name_match.add(u.user_id)

        vip_user_ids = managers_in_data | admin_role_users | name_match
        self._vip_indices = np.array(
            sorted(het.user_index[uid] for uid in vip_user_ids if uid in het.user_index),
            dtype=np.int64,
        )
        self._junior_indices = np.array(
            sorted(i for uid, i in het.user_index.items() if uid not in vip_user_ids),
            dtype=np.int64,
        )

        # Build static adjacency matrices for manages and role_above. The
        # ps_overlap matrix is rebuilt inside _compute_distances each call
        # because it changes with every step.
        self._adj_manages = np.zeros((n_users, n_users), dtype=np.float32)
        for uid, mgr_uid in het.manages.items():
            if mgr_uid is None:
                continue
            i, j = het.user_index[uid], het.user_index[mgr_uid]
            self._adj_manages[i, j] = 1.0

        # role_above projected to users: user a -> user b iff a's role's
        # parent chain contains b's role.
        self._adj_role_above = np.zeros((n_users, n_users), dtype=np.float32)
        # Precompute ancestor sets per role
        ancestors: Dict[str, set] = {}
        for role in het.role_above:
            current = role
            seen: set = set()
            while current is not None:
                parent = het.role_above.get(current)
                if parent is None or parent in seen:
                    break
                seen.add(parent)
                current = parent
            ancestors[role] = seen
        for uid_a, role_a in het.user_role.items():
            anc = ancestors.get(role_a, set())
            if not anc:
                continue
            i = het.user_index[uid_a]
            for uid_b, role_b in het.user_role.items():
                if uid_a == uid_b:
                    continue
                if role_b in anc:
                    self._adj_role_above[i, het.user_index[uid_b]] = 1.0

        info = self._snapshot_info()
        self._last_group_util = dict(info.group_utilities)
        return self._observation(), info

    # ---------------------------------------------------------------
    # Step
    # ---------------------------------------------------------------
    def step(
        self, action: Tuple[int, int]
    ) -> Tuple[Dict[str, np.ndarray], float, bool, StepInfo]:
        assert self._het is not None, "Call reset() first"
        user_idx, ps_idx = action
        het = self._het

        # Decode action
        users = het.org.users
        ps_ids = sorted(het.ps_index, key=lambda p: het.ps_index[p])
        if user_idx < 0 or user_idx >= len(users) or ps_idx < 0 or ps_idx >= len(ps_ids):
            info = self._snapshot_info()
            info.invalid_action = True
            return self._observation(), self.invalid_action_penalty, True, info

        target_user = users[user_idx]
        target_ps = ps_ids[ps_idx]

        # Validity: action must add a new edge AND target a junior (not a VIP).
        is_junior = user_idx in self._junior_indices.tolist()
        already_assigned = target_ps in self._ps_assignments_mut.get(target_user.user_id, set())
        if not is_junior or already_assigned:
            info = self._snapshot_info()
            info.invalid_action = True
            self._steps_taken += 1
            done = self._steps_taken >= self.budget
            return self._observation(), self.invalid_action_penalty, done, info

        # Apply
        self._ps_assignments_mut.setdefault(target_user.user_id, set()).add(target_ps)
        self._steps_taken += 1

        info = self._snapshot_info()
        prev_min = min(self._last_group_util.values()) if self._last_group_util else 0.0
        new_min = min(info.group_utilities.values()) if info.group_utilities else 0.0
        delta_min = new_min - prev_min
        reward = delta_min - self.lambda_disparity * info.disparity
        self._last_group_util = dict(info.group_utilities)
        done = self._steps_taken >= self.budget
        return self._observation(), reward, done, info

    # ---------------------------------------------------------------
    # Internals
    # ---------------------------------------------------------------
    def _build_ps_overlap_adjacency(self) -> np.ndarray:
        """Project current ps_assignments into a user-user adjacency."""
        het = self._het
        n_users = het.n_users()
        adj = np.zeros((n_users, n_users), dtype=np.float32)
        # Build inverted index: ps -> [user_idx]
        ps_to_users: Dict[str, List[int]] = {}
        for uid, ps_set in self._ps_assignments_mut.items():
            i = het.user_index[uid]
            for ps in ps_set:
                ps_to_users.setdefault(ps, []).append(i)
        for ps, idxs in ps_to_users.items():
            if len(idxs) < 2:
                continue
            for a in idxs:
                for b in idxs:
                    if a != b:
                        adj[a, b] = 1.0
        return adj

    def _compute_distances(self) -> np.ndarray:
        """Floyd-Warshall on the unioned weighted graph.

        Edge cost = 1 / weight per type. Where multiple edge types connect
        the same pair we take the cheapest (min cost). Returns (n, n)
        matrix with np.inf for unreachable pairs.
        """
        adj_ps = self._build_ps_overlap_adjacency()
        n = self._adj_manages.shape[0]
        cost = np.full((n, n), np.inf, dtype=np.float32)
        np.fill_diagonal(cost, 0.0)

        def _apply(adj: np.ndarray, edge_cost: float) -> None:
            mask = adj > 0
            cost[mask] = np.minimum(cost[mask], edge_cost)

        _apply(self._adj_manages, 1.0 / EDGE_WEIGHTS["manages"])
        _apply(self._adj_role_above, 1.0 / EDGE_WEIGHTS["role_above"])
        _apply(adj_ps, 1.0 / EDGE_WEIGHTS["ps_overlap"])

        # Floyd-Warshall on small/medium orgs only. n^3.
        for k in range(n):
            row_k = cost[k, :][None, :]
            col_k = cost[:, k][:, None]
            cost = np.minimum(cost, col_k + row_k)
        return cost

    def _snapshot_info(self) -> StepInfo:
        het = self._het
        if het is None or len(self._vip_indices) == 0:
            return StepInfo(
                edge_type_counts={"manages": 0, "role_above": 0, "ps_overlap": 0},
                group_utilities={},
                disparity=0.0,
                equity_index=1.0,
                most_disadvantaged_group=None,
                invalid_action=False,
            )

        cost = self._compute_distances()
        # Utility: for each junior, 1/d to nearest VIP (ignore unreachable).
        per_user_util = np.zeros(cost.shape[0], dtype=np.float32)
        if len(self._vip_indices) > 0:
            vip_dist = cost[:, self._vip_indices]
            min_d = np.min(vip_dist, axis=1)
            with np.errstate(divide="ignore"):
                per_user_util = np.where(np.isinf(min_d), 0.0, 1.0 / np.maximum(min_d, 1e-6))

        # Aggregate by department
        utils_by_dept: Dict[str, List[float]] = {}
        for idx in self._junior_indices.tolist():
            dept = self._dept_of_user_idx[idx]
            if dept is None:
                continue
            utils_by_dept.setdefault(dept, []).append(float(per_user_util[idx]))
        group_util = {d: float(np.mean(v)) if v else 0.0 for d, v in utils_by_dept.items()}

        if group_util:
            mean_u = float(np.mean(list(group_util.values())))
            disparity = float(sum(abs(u - mean_u) for u in group_util.values()))
        else:
            disparity = 0.0

        equity_index = self._equity_index(group_util)
        most_dis = min(group_util, key=group_util.get) if group_util else None

        adj_ps = self._build_ps_overlap_adjacency()
        edge_counts = {
            "manages": int(self._adj_manages.sum()),
            "role_above": int(self._adj_role_above.sum()),
            "ps_overlap": int(adj_ps.sum()),
        }
        return StepInfo(
            edge_type_counts=edge_counts,
            group_utilities=group_util,
            disparity=disparity,
            equity_index=equity_index,
            most_disadvantaged_group=most_dis,
            invalid_action=False,
        )

    @staticmethod
    def _equity_index(group_util: Dict[str, float]) -> float:
        """Equity Index = 1 − Gini over group utilities. 1.0 = perfect parity."""
        vals = sorted(group_util.values())
        n = len(vals)
        if n == 0:
            return 1.0
        s = sum(vals)
        if s <= 0:
            return 0.0
        cum = 0.0
        for i, v in enumerate(vals, start=1):
            cum += i * v
        gini = (2.0 * cum) / (n * s) - (n + 1) / n
        return float(max(0.0, min(1.0, 1.0 - gini)))

    def _observation(self) -> Dict[str, np.ndarray]:
        """Numpy obs the policy converts to torch tensors.

        - node_features: (n_users, F) — one-hot department + seniority + is_vip + is_junior
        - adj_manages, adj_role_above, adj_ps_overlap: (n, n) float32
        - action_mask: (n_juniors * n_ps,) where 1 = legal action
        - junior_indices, vip_indices: int arrays for index reuse
        """
        het = self._het
        users = het.org.users
        n = len(users)
        depts = CANONICAL_DEPARTMENTS
        seniorities = CANONICAL_SENIORITIES
        feat_dim = len(depts) + len(seniorities) + 2  # +is_vip, +is_junior
        feats = np.zeros((n, feat_dim), dtype=np.float32)
        vip_set = set(self._vip_indices.tolist())
        jr_set = set(self._junior_indices.tolist())
        for i, u in enumerate(users):
            if u.department in depts:
                feats[i, depts.index(u.department)] = 1.0
            if u.role_name:
                seniority = u.role_name.split("-")[-1]
                if seniority in seniorities:
                    feats[i, len(depts) + seniorities.index(seniority)] = 1.0
            if i in vip_set:
                feats[i, len(depts) + len(seniorities)] = 1.0
            if i in jr_set:
                feats[i, len(depts) + len(seniorities) + 1] = 1.0

        # Action mask: one entry per (junior_idx, ps_idx). Mask = 1 if the
        # junior doesn't already hold the PS AND the PS is held by ≥1 VIP
        # (otherwise the edge can't shorten any path to R).
        n_ps = het.n_ps()
        action_mask = np.zeros((len(self._junior_indices), n_ps), dtype=np.float32)
        ps_ids = sorted(het.ps_index, key=lambda p: het.ps_index[p])
        vip_user_ids = {users[i].user_id for i in vip_set}
        ps_held_by_vip: set = set()
        for uid in vip_user_ids:
            ps_held_by_vip.update(self._ps_assignments_mut.get(uid, set()))
        for ji, uidx in enumerate(self._junior_indices.tolist()):
            uid = users[uidx].user_id
            held = self._ps_assignments_mut.get(uid, set())
            for pi, ps_id in enumerate(ps_ids):
                if ps_id in held:
                    continue
                if ps_id not in ps_held_by_vip:
                    continue
                action_mask[ji, pi] = 1.0

        return {
            "node_features": feats,
            "adj_manages": self._adj_manages,
            "adj_role_above": self._adj_role_above,
            "adj_ps_overlap": self._build_ps_overlap_adjacency(),
            "action_mask": action_mask,
            "junior_indices": self._junior_indices,
            "vip_indices": self._vip_indices,
        }

    # ---------------------------------------------------------------
    # Convenience: enumerate the (junior_idx, ps_idx) action space
    # ---------------------------------------------------------------
    def decode_flat_action(self, flat_idx: int) -> Tuple[int, int]:
        het = self._het
        n_ps = het.n_ps()
        ji, pi = divmod(int(flat_idx), n_ps)
        user_idx = int(self._junior_indices[ji])
        return user_idx, pi
