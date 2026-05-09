"""PPO training loop for the equity policy.

We sample one synthetic org per episode (deterministic by seed), roll the
R-GCN actor for T = 1/(1-γ) steps under budget B, compute GAE advantages,
and update the policy with PPO. Eval every --eval-every episodes against
the GECI baseline; checkpoint when the policy's equity index beats it.

Per-episode rather than per-minibatch updates because the graph topology
differs per org and would require padding to batch across orgs. Within
one episode (same graph) we re-use transitions across PPO epochs.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List

import numpy as np
import torch
import torch.nn.functional as F
from torch.distributions import Categorical
from torch.optim import Adam

from research.rl_solution.baselines.geci import run_geci
from research.rl_solution.env import EquityAccessEnv
from research.rl_solution.policy import EquityActorCritic, obs_to_torch


@dataclass
class Transition:
    obs: dict
    action_flat: int
    log_prob: float
    value: float
    reward: float
    done: bool


@dataclass
class EpisodeResult:
    transitions: List[Transition]
    final_equity_index: float
    final_min_group_utility: float
    final_disparity: float


def _select_action(
    policy: EquityActorCritic,
    obs_t: dict,
    deterministic: bool = False,
) -> tuple[int, float, float]:
    """Sample a flat action index, return (action, log_prob, value)."""
    with torch.no_grad():
        logits, value = policy(
            obs_t["node_features"],
            obs_t["adjs"],
            obs_t["junior_indices"],
            obs_t["action_mask"],
        )
        flat = logits.flatten()
        if torch.all(flat == float("-1e9")):
            # No legal actions — fall back to action 0 with log_prob 0.
            return 0, 0.0, float(value.item())
        dist = Categorical(logits=flat)
        if deterministic:
            action = int(torch.argmax(flat).item())
        else:
            action = int(dist.sample().item())
        return action, float(dist.log_prob(torch.tensor(action)).item()), float(value.item())


def _collect_episode(
    env: EquityAccessEnv,
    policy: EquityActorCritic,
    persona: str,
    seed: int,
    device: torch.device,
) -> EpisodeResult:
    obs, info = env.reset(persona=persona, seed=seed)
    transitions: List[Transition] = []
    last_info = info
    del info  # alias to last_info from here on
    while True:
        obs_t = obs_to_torch(obs, device=device)
        action_flat, log_prob, value = _select_action(policy, obs_t)
        action = env.decode_flat_action(action_flat)
        next_obs, reward, done, info = env.step(action)
        transitions.append(Transition(
            obs=obs, action_flat=action_flat, log_prob=log_prob,
            value=value, reward=reward, done=done,
        ))
        obs = next_obs
        last_info = info
        if done:
            break
    return EpisodeResult(
        transitions=transitions,
        final_equity_index=last_info.equity_index,
        final_min_group_utility=min(last_info.group_utilities.values()) if last_info.group_utilities else 0.0,
        final_disparity=last_info.disparity,
    )


def _compute_gae(
    transitions: List[Transition],
    gamma: float,
    lam: float,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Generalized advantage estimation. Returns (advantages, returns)."""
    rewards = np.array([t.reward for t in transitions], dtype=np.float32)
    values = np.array([t.value for t in transitions], dtype=np.float32)
    dones = np.array([t.done for t in transitions], dtype=np.float32)
    advantages = np.zeros_like(rewards)
    last_gae = 0.0
    for t in reversed(range(len(transitions))):
        next_value = 0.0 if t == len(transitions) - 1 else values[t + 1]
        delta = rewards[t] + gamma * next_value * (1.0 - dones[t]) - values[t]
        last_gae = delta + gamma * lam * (1.0 - dones[t]) * last_gae
        advantages[t] = last_gae
    returns = advantages + values
    return torch.from_numpy(advantages), torch.from_numpy(returns)


def _ppo_update(
    policy: EquityActorCritic,
    optimizer: Adam,
    transitions: List[Transition],
    advantages: torch.Tensor,
    returns: torch.Tensor,
    clip_eps: float,
    epochs: int,
    entropy_coef: float,
    value_coef: float,
    device: torch.device,
) -> dict:
    """Standard PPO update; we re-encode the graph each epoch since the
    topology is fixed within an episode."""
    metrics = {"policy_loss": 0.0, "value_loss": 0.0, "entropy": 0.0, "n_updates": 0}
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    for _ in range(epochs):
        for i, tr in enumerate(transitions):
            obs_t = obs_to_torch(tr.obs, device=device)
            logits, value = policy(
                obs_t["node_features"],
                obs_t["adjs"],
                obs_t["junior_indices"],
                obs_t["action_mask"],
            )
            flat = logits.flatten()
            dist = Categorical(logits=flat)
            new_log_prob = dist.log_prob(torch.tensor(tr.action_flat, device=device))
            ratio = torch.exp(new_log_prob - tr.log_prob)
            adv = advantages[i].to(device)
            surr1 = ratio * adv
            surr2 = torch.clamp(ratio, 1.0 - clip_eps, 1.0 + clip_eps) * adv
            policy_loss = -torch.min(surr1, surr2)
            value_loss = F.mse_loss(value, returns[i].to(device))
            entropy = dist.entropy()
            loss = policy_loss + value_coef * value_loss - entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(policy.parameters(), max_norm=0.5)
            optimizer.step()

            metrics["policy_loss"] += float(policy_loss.item())
            metrics["value_loss"] += float(value_loss.item())
            metrics["entropy"] += float(entropy.item())
            metrics["n_updates"] += 1

    if metrics["n_updates"] > 0:
        for k in ("policy_loss", "value_loss", "entropy"):
            metrics[k] /= metrics["n_updates"]
    return metrics


def _eval_policy(
    policy: EquityActorCritic,
    persona: str,
    seeds: List[int],
    budget: int,
    device: torch.device,
) -> dict:
    """Eval policy vs GECI on `seeds`. Returns averaged metrics."""
    pol_eq, geci_eq, pol_min, geci_min = [], [], [], []
    for s in seeds:
        env_p = EquityAccessEnv(budget=budget)
        ep = _collect_episode(env_p, policy, persona=persona, seed=s, device=device)
        pol_eq.append(ep.final_equity_index)
        pol_min.append(ep.final_min_group_utility)

        env_g = EquityAccessEnv(budget=budget)
        env_g.reset(persona=persona, seed=s)
        run_geci(env_g)
        info_g = env_g._snapshot_info()
        geci_eq.append(info_g.equity_index)
        geci_min.append(min(info_g.group_utilities.values()) if info_g.group_utilities else 0.0)
    return {
        "policy_equity": float(np.mean(pol_eq)),
        "geci_equity": float(np.mean(geci_eq)),
        "policy_min_utility": float(np.mean(pol_min)),
        "geci_min_utility": float(np.mean(geci_min)),
        "n_eval_seeds": len(seeds),
    }


# PS embedding cap. Larger than any synthetic org we expect; padding is
# masked out by the env's action_mask so unused rows don't affect learning.
MAX_PS_EMBEDDING = 4096


def _instantiate_policy_for_org(
    persona: str, seed: int, hidden_dim: int, embed_dim: int
) -> EquityActorCritic:
    """Construct a policy with a fixed shape that holds across all orgs.

    Uses the canonical 6-dept × 4-seniority vocabulary from the env so
    feat_dim stays constant; sizes the PS embedding table to MAX_PS so
    different seeds (which produce different n_ps) all share the same
    parameters. persona / seed are kept in the signature so eval.py can
    pass through what was used at train time (signature stays callable
    even though current shape choice is persona-agnostic).
    """
    del persona, seed
    from research.rl_solution.env import CANONICAL_DEPARTMENTS, CANONICAL_SENIORITIES
    feat_dim = len(CANONICAL_DEPARTMENTS) + len(CANONICAL_SENIORITIES) + 2
    return EquityActorCritic(
        node_feature_dim=feat_dim,
        n_ps=MAX_PS_EMBEDDING,
        hidden_dim=hidden_dim,
        embed_dim=embed_dim,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--persona", default="mid_market", choices=["small_business", "mid_market", "enterprise"])
    parser.add_argument("--episodes", type=int, default=10000)
    parser.add_argument("--budget", type=int, default=20)
    parser.add_argument("--gamma", type=float, default=0.95)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--clip-eps", type=float, default=0.2)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--ppo-epochs", type=int, default=4)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--value-coef", type=float, default=0.5)
    parser.add_argument("--lambda-disparity", type=float, default=0.5)
    parser.add_argument("--hidden-dim", type=int, default=64)
    parser.add_argument("--embed-dim", type=int, default=32)
    parser.add_argument("--eval-every", type=int, default=100)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--checkpoint-dir", default="research/rl_solution/checkpoints")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = torch.device(args.device)

    Path(args.checkpoint_dir).mkdir(parents=True, exist_ok=True)
    log_path = Path(args.checkpoint_dir) / "train_log.jsonl"

    policy = _instantiate_policy_for_org(args.persona, seed=args.seed, hidden_dim=args.hidden_dim, embed_dim=args.embed_dim).to(device)
    optimizer = Adam(policy.parameters(), lr=args.lr)

    best_eval_equity = -math.inf
    eval_seeds = list(range(10000, 10005))

    with open(log_path, "w", encoding="utf-8") as logf:
        for episode in range(args.episodes):
            env = EquityAccessEnv(budget=args.budget, lambda_disparity=args.lambda_disparity)
            ep_seed = args.seed + episode + 1
            ep = _collect_episode(env, policy, persona=args.persona, seed=ep_seed, device=device)

            advantages, returns = _compute_gae(ep.transitions, args.gamma, args.gae_lambda)
            update_metrics = _ppo_update(
                policy, optimizer, ep.transitions, advantages, returns,
                clip_eps=args.clip_eps, epochs=args.ppo_epochs,
                entropy_coef=args.entropy_coef, value_coef=args.value_coef,
                device=device,
            )

            if (episode + 1) % args.eval_every == 0 or episode == args.episodes - 1:
                eval_metrics = _eval_policy(policy, args.persona, eval_seeds, args.budget, device)
                record = {
                    "episode": episode + 1,
                    "ep_equity": ep.final_equity_index,
                    "ep_min_util": ep.final_min_group_utility,
                    **update_metrics,
                    **eval_metrics,
                }
                logf.write(json.dumps(record) + "\n")
                logf.flush()
                print(
                    f"ep={episode+1} train_eq={ep.final_equity_index:.3f} "
                    f"eval_eq={eval_metrics['policy_equity']:.3f} "
                    f"geci_eq={eval_metrics['geci_equity']:.3f} "
                    f"policy_loss={update_metrics['policy_loss']:.4f}",
                    flush=True,
                )
                if eval_metrics["policy_equity"] > best_eval_equity:
                    best_eval_equity = eval_metrics["policy_equity"]
                    torch.save(
                        {"state_dict": policy.state_dict(), "args": vars(args), "episode": episode + 1},
                        Path(args.checkpoint_dir) / "best.pt",
                    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
