"""GECI — Greedy Equity-Centric Augmentation (paper §III-A).

For each step under the budget:
  1. Identify the group with the lowest current utility, g_min.
  2. Enumerate every legal (junior, PS) action where the junior belongs
     to g_min, simulate the edge addition, and score the resulting
     U_{g_min}.
  3. Apply the highest-scoring edge.

This is the paper's primary baseline. We use it both as a comparison
target during PPO eval and as a fallback policy when the trained model
isn't available.
"""
from __future__ import annotations

from copy import deepcopy
from typing import List, Tuple

import numpy as np

from research.rl_solution.env import EquityAccessEnv
from research.rl_solution.data.synth_hierarchy import HeterogeneousOrg


def geci_select_action(env: EquityAccessEnv) -> Tuple[int, int]:
    """Return the (user_idx, ps_idx) GECI would pick at the current state.

    Implementation note: we mutate `env._ps_assignments_mut` in a deep copy
    to simulate edges, then revert. The state-snapshot scope is small
    enough that this is acceptable for v1.
    """
    info = env._snapshot_info()
    if not info.group_utilities:
        # Empty R or no juniors — return a no-op edge.
        return 0, 0
    g_min = info.most_disadvantaged_group
    obs = env._observation()
    mask = obs["action_mask"]  # (J, P)
    junior_indices = obs["junior_indices"]
    users = env._het.org.users

    best_score = -np.inf
    best_action = (0, 0)
    for ji in range(mask.shape[0]):
        user_idx = int(junior_indices[ji])
        if users[user_idx].department != g_min:
            continue
        for pi in range(mask.shape[1]):
            if mask[ji, pi] < 0.5:
                continue
            score = _simulate_score(env, user_idx, pi, g_min)
            if score > best_score:
                best_score = score
                best_action = (user_idx, pi)
    return best_action


def _simulate_score(env: EquityAccessEnv, user_idx: int, ps_idx: int, group: str) -> float:
    """Apply the edge in-place, snapshot, then revert. Returns U_group."""
    het = env._het
    user_id = het.org.users[user_idx].user_id
    ps_id = sorted(het.ps_index, key=lambda p: het.ps_index[p])[ps_idx]
    held = env._ps_assignments_mut.setdefault(user_id, set())
    if ps_id in held:
        return -np.inf
    held.add(ps_id)
    try:
        info = env._snapshot_info()
        return info.group_utilities.get(group, 0.0)
    finally:
        held.discard(ps_id)


def run_geci(env: EquityAccessEnv) -> List[Tuple[int, int]]:
    """Run GECI to exhaustion of the env's budget. Returns the list of
    (user_idx, ps_idx) actions taken."""
    actions: List[Tuple[int, int]] = []
    for _ in range(env.budget):
        action = geci_select_action(env)
        env.step(action)
        actions.append(action)
    return actions
