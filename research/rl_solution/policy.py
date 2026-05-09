"""2-layer R-GCN actor + critic for the equity policy (paper §IV-A).

R-GCN (relational GCN) extends vanilla GCN by learning one weight matrix
per edge type — necessary because our graph carries 3 distinct relations
(manages, role_above, ps_overlap) whose semantics differ.

The actor outputs per-(junior, ps) logits; we apply the env's action mask
before softmax. The critic shares the first R-GCN layer with the actor.

We hand-roll the R-GCN layer rather than depend on torch-geometric so the
research deps stay minimal — the paper's architecture is small enough that
the message-passing fits in ~30 lines.
"""
from __future__ import annotations

from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


EDGE_TYPES: Tuple[str, ...] = ("manages", "role_above", "ps_overlap")


class RGCNLayer(nn.Module):
    """One relational graph convolution layer.

    For each relation r, output_r = norm(A_r) @ X @ W_r. We sum across
    relations and add a self-loop term, then apply ReLU.
    """

    def __init__(self, in_dim: int, out_dim: int, edge_types: Tuple[str, ...] = EDGE_TYPES):
        super().__init__()
        self.edge_types = edge_types
        self.weights = nn.ModuleDict(
            {et: nn.Linear(in_dim, out_dim, bias=False) for et in edge_types}
        )
        self.self_loop = nn.Linear(in_dim, out_dim, bias=True)

    def forward(self, x: torch.Tensor, adjs: Dict[str, torch.Tensor]) -> torch.Tensor:
        out = self.self_loop(x)
        for et in self.edge_types:
            adj = adjs[et]
            if adj.numel() == 0:
                continue
            # Symmetric normalization: D^-1/2 (A + I) D^-1/2 ... we omit
            # +I (self_loop already covers it) and use row-normalization
            # for simplicity. R-GCN is robust to either choice.
            deg = adj.sum(dim=1, keepdim=True).clamp(min=1.0)
            norm_adj = adj / deg
            out = out + self.weights[et](norm_adj @ x)
        return F.relu(out)


class EquityActorCritic(nn.Module):
    """Shared 2-layer R-GCN backbone, with separate actor / critic heads.

    Actor: takes the junior x ps action grid, computes a logit per pair via
    a bilinear scorer between the junior's node embedding and a learned
    per-ps embedding.

    Critic: mean-pools all node embeddings → scalar value.
    """

    def __init__(
        self,
        node_feature_dim: int,
        n_ps: int,
        hidden_dim: int = 64,
        embed_dim: int = 32,
    ):
        super().__init__()
        self.layer1 = RGCNLayer(node_feature_dim, hidden_dim)
        self.layer2 = RGCNLayer(hidden_dim, embed_dim)
        self.ps_embeddings = nn.Embedding(n_ps, embed_dim)
        self.actor_bilinear = nn.Bilinear(embed_dim, embed_dim, 1, bias=False)
        self.critic_head = nn.Sequential(
            nn.Linear(embed_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def encode(
        self, node_features: torch.Tensor, adjs: Dict[str, torch.Tensor]
    ) -> torch.Tensor:
        h = self.layer1(node_features, adjs)
        h = self.layer2(h, adjs)
        return h

    def actor_logits(
        self,
        node_embeddings: torch.Tensor,
        junior_indices: torch.Tensor,
        n_ps_active: Optional[int] = None,
    ) -> torch.Tensor:
        """Returns (n_juniors, n_ps_active) logit grid.

        n_ps_active lets one shared embedding table be reused across orgs
        with different n_ps — we slice to the current org's prefix and
        ignore the rest. The embedding table must be large enough to cover
        the largest org we expect to see (set at construction time).
        """
        junior_emb = node_embeddings[junior_indices]               # (J, E)
        full_ps_emb = self.ps_embeddings.weight                    # (P_max, E)
        n_p = full_ps_emb.shape[0] if n_ps_active is None else min(n_ps_active, full_ps_emb.shape[0])
        ps_emb = full_ps_emb[:n_p]
        n_j, e = junior_emb.shape[0], junior_emb.shape[1]
        je = junior_emb.unsqueeze(1).expand(n_j, n_p, e).reshape(-1, e)
        pe = ps_emb.unsqueeze(0).expand(n_j, n_p, e).reshape(-1, e)
        logits = self.actor_bilinear(je, pe).reshape(n_j, n_p)
        return logits

    def critic_value(self, node_embeddings: torch.Tensor) -> torch.Tensor:
        pooled = node_embeddings.mean(dim=0, keepdim=True)
        return self.critic_head(pooled).squeeze(-1).squeeze(-1)

    def forward(
        self,
        node_features: torch.Tensor,
        adjs: Dict[str, torch.Tensor],
        junior_indices: torch.Tensor,
        action_mask: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        h = self.encode(node_features, adjs)
        # The action_mask's second dim defines the active PS count for this
        # org — slice the embedding table to match so logits and mask align
        # even when n_ps differs across episodes.
        n_ps_active = int(action_mask.shape[1])
        logits = self.actor_logits(h, junior_indices, n_ps_active=n_ps_active)
        # Apply mask: invalid → very negative so softmax → ~0
        masked_logits = logits.masked_fill(action_mask < 0.5, float("-1e9"))
        value = self.critic_value(h)
        return masked_logits, value


def obs_to_torch(
    obs: Dict[str, np.ndarray], device: torch.device = torch.device("cpu")
) -> Dict[str, torch.Tensor]:
    """Convert env observation to torch tensors on the requested device."""
    return {
        "node_features": torch.from_numpy(obs["node_features"]).to(device),
        "adjs": {
            "manages": torch.from_numpy(obs["adj_manages"]).to(device),
            "role_above": torch.from_numpy(obs["adj_role_above"]).to(device),
            "ps_overlap": torch.from_numpy(obs["adj_ps_overlap"]).to(device),
        },
        "junior_indices": torch.from_numpy(obs["junior_indices"]).long().to(device),
        "action_mask": torch.from_numpy(obs["action_mask"]).to(device),
    }
