"""RL-driven equity recommendations (GAEA / EMD-MRP).

Heavy ML deps live here, never in apps/backend/. Train a 2-layer R-GCN PPO
policy on synthetic orgs from research/anomaly_benchmark/, then export the
policy as numpy weights so apps/backend/ can run inference without torch.
"""
