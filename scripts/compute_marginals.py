#!/usr/bin/env python
"""Compute per-persona marginal statistics for the paper's synthetic-org table.

Standalone, read-only: imports the benchmark generator but modifies nothing.

Tuple provenance (do-not-guess requirement)
-------------------------------------------
The 150 benchmark orgs are regenerated from the sweep command documented in
the repo at two places:

  research/anomaly_benchmark/REPORT.md                  §10, lines 274-275
  research/paper_bundle/PUBLISHABLE_PAPER_BUNDLE.md     §12.2, lines 956-957

      python -m research.anomaly_benchmark.experiment \
          --algos all --personas all --seeds 0-9 --datasets-per-persona 5 --reset

Enumeration mirrors research/anomaly_benchmark/experiment.py::run() exactly:

      for persona in list(PERSONAS):                # small_business, mid_market, enterprise
          for dataset_idx in range(5):
              for run_seed in range(0, 10):
                  org_seed = run_seed * 1000 + dataset_idx
                  org = generate_org(persona=persona, seed=org_seed)

NOTE: research/anomaly_benchmark/results/results.parquet in the repo is a
30-org / 5-algorithm smoke-test artifact (2 personas, seeds 0-4, 3 dataset
indices), NOT the paper's sweep; the full run was executed on Colab
(REPORT.md line 283) and its parquet was not committed. The tuples used
here therefore come from the documented configuration above.

Usage (from repo root):
    python scripts/compute_marginals.py
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import numpy as np

# Make `research.*` importable when run as a plain script from anywhere.
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from research.anomaly_benchmark.data.distributions import PERSONAS  # noqa: E402
from research.anomaly_benchmark.data.generator import generate_org  # noqa: E402

# --- Sweep configuration (from the documented command; see module docstring) ---
RUN_SEEDS = list(range(0, 10))          # --seeds 0-9
DATASETS_PER_PERSONA = 5                # --datasets-per-persona 5
PERSONA_ORDER = list(PERSONAS)          # --personas all  -> dict order
DISPLAY = {"small_business": "Small", "mid_market": "Mid", "enterprise": "Enterprise"}

# --- Field mapping (SyntheticUser attribute names, research/.../schemas.py) ---
FIELD_MAP = {
    "num_permission_sets": "num_permission_sets",
    "profile": "profile_name",
    "last_login_days_ago": "last_login_days_ago",
    "grants components": [
        "num_objects_read",
        "num_objects_edit",
        "num_objects_delete",
        "num_fields_read",
        "num_fields_edit",
    ],
}
INACTIVE_THRESHOLD_DAYS = 90


def org_stats(org) -> dict:
    """Five statistics for one org, over ALL users (planted anomalies included)."""
    users = org.users
    n = len(users)
    ps = np.array([u.num_permission_sets for u in users], dtype=float)
    login = np.array([u.last_login_days_ago for u in users], dtype=float)
    grants = np.array(
        [
            u.num_objects_read + u.num_objects_edit + u.num_objects_delete
            + u.num_fields_read + u.num_fields_edit
            for u in users
        ],
        dtype=float,
    )
    largest_profile = max(Counter(u.profile_name for u in users).values())
    return {
        "median_ps": float(np.median(ps)),
        "p95_ps": float(np.percentile(ps, 95)),          # numpy default: linear interpolation
        "largest_profile_pct": largest_profile / n * 100.0,
        "pct_inactive": float((login > INACTIVE_THRESHOLD_DAYS).mean() * 100.0),
        "median_grants": float(np.median(grants)),
        "n_users": n,
        "n_anomalies": org.n_anomalies(),
    }


def main() -> int:
    print("=" * 78)
    print("Synthetic-org marginals — regenerated from the documented benchmark sweep")
    print("=" * 78)
    print("Sweep: --personas all --seeds 0-9 --datasets-per-persona 5")
    print(f"Personas (PERSONAS dict order): {PERSONA_ORDER}")
    print(f"Run seeds: {RUN_SEEDS}")
    print(f"Dataset indices: {list(range(DATASETS_PER_PERSONA))}")
    print("org_seed = run_seed * 1000 + dataset_idx   (experiment.py::run)")
    print()
    print("Field mapping used (SyntheticUser attributes):")
    for k, v in FIELD_MAP.items():
        print(f"  {k:<24} -> {v}")
    print("'grants per user' has NO canonical definition in the codebase; using the")
    print("  requested definition: objects_read + objects_edit + objects_delete")
    print("  + fields_read + fields_edit")
    print(f"'inactive' = last_login_days_ago > {INACTIVE_THRESHOLD_DAYS}")
    print("95th percentile: numpy.percentile, linear interpolation (default)")
    print()

    per_persona: dict[str, list[dict]] = {p: [] for p in PERSONA_ORDER}
    generated_ids: dict[str, list[str]] = {p: [] for p in PERSONA_ORDER}

    for persona in PERSONA_ORDER:
        for dataset_idx in range(DATASETS_PER_PERSONA):
            for run_seed in RUN_SEEDS:
                org_seed = run_seed * 1000 + dataset_idx
                org = generate_org(persona=persona, seed=org_seed)
                per_persona[persona].append(org_stats(org))
                generated_ids[persona].append(org.org_id)
        print(f"generated {len(per_persona[persona]):>3} orgs for {persona:<15} "
              f"(first: {generated_ids[persona][0]}, last: {generated_ids[persona][-1]})")

    # Hard guard: exactly 50 per persona, 150 total.
    counts = {p: len(v) for p, v in per_persona.items()}
    assert all(c == 50 for c in counts.values()), counts
    assert sum(counts.values()) == 150, counts
    print(f"total orgs: {sum(counts.values())}")
    print()

    # --- Averages over the 50 orgs in each persona ---
    rows = [
        ("Median permission sets / user", "median_ps", 1),
        ("95th pct permission sets / user", "p95_ps", 1),
        ("Largest-profile user share (%)", "largest_profile_pct", 1),
        (f"Users inactive > {INACTIVE_THRESHOLD_DAYS}d (%)", "pct_inactive", 1),
        ("Median grants / user", "median_grants", 0),
    ]
    avg = {
        p: {key: float(np.mean([s[key] for s in stats])) for _, key, _ in rows}
        for p, stats in per_persona.items()
    }

    col_w = 12
    header = f"{'Statistic':<34}" + "".join(f"{DISPLAY[p]:>{col_w}}" for p in PERSONA_ORDER)
    print(header)
    print("-" * len(header))
    for label, key, dec in rows:
        cells = "".join(
            f"{avg[p][key]:>{col_w}.{dec}f}" if dec else f"{int(round(avg[p][key])):>{col_w}d}"
            for p in PERSONA_ORDER
        )
        print(f"{label:<34}{cells}")
    print()

    # --- Sanity checks ---
    print("Sanity checks")
    print("-" * 78)
    flags = 0

    for p in PERSONA_ORDER:
        share = avg[p]["largest_profile_pct"]
        dev = abs(share - 30.0)
        status = "OK" if dev <= 5.0 else "FLAG"
        if status == "FLAG":
            flags += 1
        print(f"[{status:>4}] largest-profile share {DISPLAY[p]:<10} = {share:5.1f}%  "
              f"(target ~30%, deviation {dev:.1f} pts)")

    g = [avg[p]["median_grants"] for p in PERSONA_ORDER]
    mono = g[0] < g[1] < g[2]
    if not mono:
        flags += 1
    print(f"[{'OK' if mono else 'FLAG':>4}] median grants monotonic Small -> Mid -> Enterprise: "
          f"{g[0]:.1f} -> {g[1]:.1f} -> {g[2]:.1f}")

    for p in PERSONA_ORDER:
        pi = avg[p]["pct_inactive"]
        ok = pi > 0
        if not ok:
            flags += 1
        print(f"[{'OK' if ok else 'FLAG':>4}] percent inactive {DISPLAY[p]:<10} = {pi:5.1f}%  (must be > 0)")

    print()
    print("Scale check — total users per persona (sum over 50 orgs)")
    print("-" * 78)
    for p in PERSONA_ORDER:
        n_users = sum(s["n_users"] for s in per_persona[p])
        n_anom = sum(s["n_anomalies"] for s in per_persona[p])
        sizes = [s["n_users"] for s in per_persona[p]]
        print(f"  {DISPLAY[p]:<10} users={n_users:>8,}  anomalies={n_anom:>6,}  "
              f"org size min/mean/max = {min(sizes):,} / {np.mean(sizes):,.0f} / {max(sizes):,}  "
              f"(spec range {PERSONAS[p].n_users_range})")
    print()
    print(f"Flags raised: {flags}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
