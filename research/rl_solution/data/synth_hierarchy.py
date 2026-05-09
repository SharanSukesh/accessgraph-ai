"""Augment SyntheticOrg with the heterogeneous edges the equity policy needs.

The benchmark generator (research/anomaly_benchmark/data/generator.py) ships
flat user feature vectors with no graph structure. The RL env needs an
explicit multi-edge graph: who reports to whom, who shares PSes with whom,
who sits above whom in the role tree. We wrap an existing SyntheticOrg and
attach those edges deterministically from the same seed, so we can sample
infinite training graphs without modifying the production benchmark.

Edge types in v1:
- manages           user -> manager (self.manager_id)
- role_above        role -> parent role (separate hierarchy from reporting)
- ps_overlap        user <-> permission_set (bipartite, projected at runtime)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

from research.anomaly_benchmark.data.generator import generate_org
from research.anomaly_benchmark.data.schemas import SyntheticOrg, SyntheticUser


# Seniority ordering: lower index = more senior. Drives manager assignment
# (juniors report to seniors of same department) and role hierarchy.
SENIORITY_ORDER = {"admin": 0, "senior": 1, "mid": 2, "junior": 3}


@dataclass
class HeterogeneousOrg:
    """SyntheticOrg + the edge types the RL env consumes.

    user_ids and ps_ids are stable strings; index maps are precomputed for
    fast lookup during PPO rollouts.
    """
    org: SyntheticOrg
    # user_id -> integer index used for adjacency matrices
    user_index: Dict[str, int]
    # ps_id -> integer index
    ps_index: Dict[str, int]
    # user_id -> manager user_id (or None for top-of-tree)
    manages: Dict[str, Optional[str]]
    # user role assignments — many users share a role
    user_role: Dict[str, str]
    # role_id -> parent_role_id (or None for tree root)
    role_above: Dict[str, Optional[str]]
    # user_id -> set of ps_ids assigned to that user
    ps_assignments: Dict[str, Set[str]]
    # ps_id -> ordered department + seniority tier this PS targets (for narration)
    ps_metadata: Dict[str, Dict[str, str]]

    def n_users(self) -> int:
        return len(self.org.users)

    def n_ps(self) -> int:
        return len(self.ps_index)

    def departments(self) -> List[str]:
        return sorted({u.department for u in self.org.users if u.department})


def _sample_role_tree(
    rng: np.random.Generator, departments: List[str]
) -> Tuple[Dict[str, str], Dict[str, Optional[str]]]:
    """Construct a per-department role tree of the form:
        <dept>-admin -> <dept>-senior -> <dept>-mid -> <dept>-junior
    plus a single CEO role at the top of the company.

    Returns (per-user role assignment by [dept,seniority] string,
             role_above map keyed by role name).
    """
    role_above: Dict[str, Optional[str]] = {"CEO": None}
    for dept in departments:
        role_above[f"{dept}-admin"] = "CEO"
        role_above[f"{dept}-senior"] = f"{dept}-admin"
        role_above[f"{dept}-mid"] = f"{dept}-senior"
        role_above[f"{dept}-junior"] = f"{dept}-mid"
    # role_above intentionally returned without user assignment — caller
    # zips it with users below.
    return {}, role_above


def _assign_managers(
    rng: np.random.Generator, users: List[SyntheticUser]
) -> Dict[str, Optional[str]]:
    """Assign each user a manager (the User.ManagerId field in production).

    Strategy: within each department, juniors report to a randomly chosen
    mid; mids report to a randomly chosen senior; seniors report to a
    randomly chosen admin; admins all report to a single org-wide CEO.
    If a department lacks a senior tier, we promote the most senior
    available; if there's no CEO-eligible admin, we leave them as roots.
    """
    by_dept_seniority: Dict[Tuple[str, str], List[SyntheticUser]] = {}
    for u in users:
        if not u.department or not u.role_name:
            continue
        seniority = u.role_name.split("-")[-1]
        by_dept_seniority.setdefault((u.department, seniority), []).append(u)

    manages: Dict[str, Optional[str]] = {u.user_id: None for u in users}

    # Pick a single CEO from the highest-seniority pool across all depts.
    admin_pool = [u for (_, s), lst in by_dept_seniority.items() if s == "admin" for u in lst]
    senior_pool = [u for (_, s), lst in by_dept_seniority.items() if s == "senior" for u in lst]
    ceo_pool = admin_pool or senior_pool
    ceo: Optional[SyntheticUser] = ceo_pool[int(rng.integers(0, len(ceo_pool)))] if ceo_pool else None

    for u in users:
        if not u.department or not u.role_name:
            continue
        if ceo is not None and u.user_id == ceo.user_id:
            manages[u.user_id] = None  # CEO is the root
            continue
        seniority = u.role_name.split("-")[-1]
        if seniority == "junior":
            candidates = by_dept_seniority.get((u.department, "mid"), [])
        elif seniority == "mid":
            candidates = by_dept_seniority.get((u.department, "senior"), [])
        elif seniority == "senior":
            candidates = by_dept_seniority.get((u.department, "admin"), [])
        elif seniority == "admin":
            manages[u.user_id] = ceo.user_id if ceo and ceo.user_id != u.user_id else None
            continue
        else:
            candidates = []
        # Fallback up the seniority ladder if the immediate level is empty.
        for fallback_level in ("senior", "admin"):
            if not candidates:
                candidates = by_dept_seniority.get((u.department, fallback_level), [])
        if candidates:
            mgr = candidates[int(rng.integers(0, len(candidates)))]
            if mgr.user_id != u.user_id:
                manages[u.user_id] = mgr.user_id
    return manages


def _build_ps_pool_and_assignments(
    rng: np.random.Generator, users: List[SyntheticUser]
) -> Tuple[Dict[str, Set[str]], Dict[str, Dict[str, str]]]:
    """Materialize concrete per-user PS assignments + a PS catalog.

    The benchmark generator gives us aggregate counts (num_permission_sets)
    but not the actual edges. We build a department/seniority-keyed pool
    and assign PSes such that:
      - users in the same dept+seniority share most of their PSes (so PS-
        overlap edges form meaningful clusters)
      - ~20% of each user's PSes are department-only (any seniority), to
        model cross-seniority sharing
      - ~10% are org-wide (e.g. "Standard User" PS)
    """
    # Build a stratified PS pool sized to fit the largest user's count.
    max_ps = max(u.num_permission_sets for u in users) if users else 0
    by_dept_seniority: Dict[Tuple[str, str], List[str]] = {}
    by_dept: Dict[str, List[str]] = {}
    org_wide: List[str] = []
    metadata: Dict[str, Dict[str, str]] = {}

    # Sized so even a single user's count can be covered with realistic
    # cross-coverage. Tuned so ps_overlap edges are dense enough to be
    # meaningful but not saturate.
    n_per_strat = max(8, max_ps)
    ps_idx = 0
    for dept in sorted({u.department for u in users if u.department}):
        for seniority in ("admin", "senior", "mid", "junior"):
            for _ in range(n_per_strat):
                ps_id = f"PS{ps_idx:05d}"
                by_dept_seniority.setdefault((dept, seniority), []).append(ps_id)
                metadata[ps_id] = {"dept": dept, "seniority": seniority, "scope": "strat"}
                ps_idx += 1
        for _ in range(max(4, n_per_strat // 2)):
            ps_id = f"PS{ps_idx:05d}"
            by_dept.setdefault(dept, []).append(ps_id)
            metadata[ps_id] = {"dept": dept, "seniority": "any", "scope": "dept"}
            ps_idx += 1
    for _ in range(max(4, n_per_strat // 4)):
        ps_id = f"PS{ps_idx:05d}"
        org_wide.append(ps_id)
        metadata[ps_id] = {"dept": "any", "seniority": "any", "scope": "org"}
        ps_idx += 1

    assignments: Dict[str, Set[str]] = {}
    for u in users:
        target = u.num_permission_sets
        if target <= 0:
            assignments[u.user_id] = set()
            continue
        if not u.department or not u.role_name:
            assignments[u.user_id] = set(rng.choice(org_wide, size=min(target, len(org_wide)), replace=False).tolist()) if org_wide else set()
            continue
        seniority = u.role_name.split("-")[-1]
        n_strat = max(1, int(target * 0.7))
        n_dept = max(0, int(target * 0.2))
        n_org = max(0, target - n_strat - n_dept)

        chosen: Set[str] = set()
        strat_pool = by_dept_seniority.get((u.department, seniority), [])
        if strat_pool:
            picks = rng.choice(strat_pool, size=min(n_strat, len(strat_pool)), replace=False)
            chosen.update(picks.tolist())
        dept_pool = by_dept.get(u.department, [])
        if dept_pool:
            picks = rng.choice(dept_pool, size=min(n_dept, len(dept_pool)), replace=False)
            chosen.update(picks.tolist())
        if org_wide and n_org > 0:
            picks = rng.choice(org_wide, size=min(n_org, len(org_wide)), replace=False)
            chosen.update(picks.tolist())
        assignments[u.user_id] = chosen
    return assignments, metadata


def augment(org: SyntheticOrg, seed: Optional[int] = None) -> HeterogeneousOrg:
    """Decorate a SyntheticOrg with manages / role_above / ps_overlap edges.

    Same seed that produced the org will (when reused) yield the same
    augmentation. The org parameter is not mutated.
    """
    rng = np.random.default_rng(seed if seed is not None else org.seed)
    users = list(org.users)
    departments = sorted({u.department for u in users if u.department})

    _, role_above = _sample_role_tree(rng, departments)
    user_role: Dict[str, str] = {
        u.user_id: (u.role_name or "CEO") for u in users
    }
    manages = _assign_managers(rng, users)
    ps_assignments, ps_metadata = _build_ps_pool_and_assignments(rng, users)

    user_index = {u.user_id: i for i, u in enumerate(users)}
    all_ps_ids = sorted(ps_metadata.keys())
    ps_index = {pid: i for i, pid in enumerate(all_ps_ids)}

    return HeterogeneousOrg(
        org=org,
        user_index=user_index,
        ps_index=ps_index,
        manages=manages,
        user_role=user_role,
        role_above=role_above,
        ps_assignments=ps_assignments,
        ps_metadata=ps_metadata,
    )


def generate_heterogeneous_org(persona: str, seed: int) -> HeterogeneousOrg:
    """One-shot helper: generate + augment in one call."""
    return augment(generate_org(persona=persona, seed=seed), seed=seed)
