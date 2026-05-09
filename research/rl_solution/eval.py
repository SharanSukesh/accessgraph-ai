"""Eval harness: reproduce paper Fig. 3 / Fig. 4 across personas × seeds.

Compares the trained policy vs GECI baseline on (utility, equity_index)
pairs, writes a CSV the user can plot. The pass criterion documented in
the plan is ΔGini < 0 AND ΔUtility > 0 vs GECI on ≥ 4/8 settings.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import List

import numpy as np
import torch

from research.rl_solution.baselines.geci import run_geci
from research.rl_solution.env import EquityAccessEnv
from research.rl_solution.policy import EquityActorCritic, obs_to_torch
from research.rl_solution.train import _collect_episode, _instantiate_policy_for_org


def _eval_one(policy, persona: str, seed: int, budget: int, device: torch.device) -> dict:
    env_p = EquityAccessEnv(budget=budget)
    ep = _collect_episode(env_p, policy, persona=persona, seed=seed, device=device)

    env_g = EquityAccessEnv(budget=budget)
    env_g.reset(persona=persona, seed=seed)
    run_geci(env_g)
    info_g = env_g._snapshot_info()

    return {
        "persona": persona,
        "seed": seed,
        "policy_equity": ep.final_equity_index,
        "policy_min_util": ep.final_min_group_utility,
        "policy_disparity": ep.final_disparity,
        "geci_equity": info_g.equity_index,
        "geci_min_util": min(info_g.group_utilities.values()) if info_g.group_utilities else 0.0,
        "geci_disparity": info_g.disparity,
        "delta_equity": ep.final_equity_index - info_g.equity_index,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default="research/rl_solution/checkpoints/best.pt")
    parser.add_argument("--personas", nargs="+", default=["mid_market"])
    parser.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3, 4, 5])
    parser.add_argument("--budget", type=int, default=20)
    parser.add_argument("--out", default="research/rl_solution/eval/results.csv")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    device = torch.device(args.device)
    ckpt_path = Path(args.checkpoint)
    if not ckpt_path.exists():
        print(f"Checkpoint not found: {ckpt_path}", file=sys.stderr)
        return 1
    ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    train_args = ckpt["args"]

    rows: List[dict] = []
    for persona in args.personas:
        # Re-instantiate policy with the shape used at train time.
        policy = _instantiate_policy_for_org(
            persona=persona,
            seed=train_args.get("seed", 0),
            hidden_dim=train_args.get("hidden_dim", 64),
            embed_dim=train_args.get("embed_dim", 32),
        ).to(device)
        policy.load_state_dict(ckpt["state_dict"])
        policy.eval()
        for seed in args.seeds:
            rows.append(_eval_one(policy, persona, seed, args.budget, device))

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    n_wins = sum(1 for r in rows if r["delta_equity"] > 0 and r["policy_min_util"] > r["geci_min_util"])
    print(f"Wrote {args.out}")
    print(f"Policy beats GECI on {n_wins}/{len(rows)} settings (ΔEquity > 0 AND ΔMinUtility > 0)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
