"""Top-level experiment driver.

Iterates (algorithm × persona × seed) and accumulates results into a
parquet file. Designed to run from the command line.

Usage:
    # Run everything (default)
    python -m research.anomaly_benchmark.experiment

    # Subset to specific algorithms / personas / seed range
    python -m research.anomaly_benchmark.experiment \\
        --algos isolation_forest,lof,gmm \\
        --personas small_business,mid_market \\
        --seeds 0-9 \\
        --datasets-per-persona 5

    # Reset accumulated results before running
    python -m research.anomaly_benchmark.experiment --reset
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path
from typing import List

from .algorithms import available
from .data.distributions import PERSONAS
from .data.generator import generate_org
from .results_store import append_results, reset
from .runner import RunResult, run_experiment


DEFAULT_RESULTS_PATH = Path("research/anomaly_benchmark/results/results.parquet")


def parse_seed_range(spec: str) -> List[int]:
    """Parse '0-9' or '0,3,7' into a list of seeds."""
    if "-" in spec:
        a, b = spec.split("-")
        return list(range(int(a), int(b) + 1))
    return [int(s) for s in spec.split(",") if s.strip()]


def parse_csv(spec: str) -> List[str]:
    return [s.strip() for s in spec.split(",") if s.strip()]


def run(
    algos: List[str],
    personas: List[str],
    seeds: List[int],
    datasets_per_persona: int,
    results_path: Path,
    reset_results: bool,
) -> int:
    """Iterate algos × personas × seeds × datasets, write results.

    Each (persona, seed, dataset_idx) combination produces one synthetic
    org. Each algorithm scores that same org. So the same dataset_id
    appears under multiple algos in the results, enabling paired
    Wilcoxon comparisons during analysis.

    Returns the count of (algo, dataset, seed) results written.
    """
    if reset_results:
        reset(results_path)

    total_planned = (
        len(algos) * len(personas) * len(seeds) * datasets_per_persona
    )
    print(f"Planned experiments: {total_planned}")
    print(f"  algos:     {algos}")
    print(f"  personas:  {personas}")
    print(f"  seeds:     {seeds}")
    print(f"  datasets per persona: {datasets_per_persona}")
    print(f"  results:   {results_path}")

    written = 0
    started_at = time.perf_counter()
    batch: List[RunResult] = []
    BATCH_FLUSH = 50

    for persona in personas:
        for dataset_idx in range(datasets_per_persona):
            # Use (seed, dataset_idx) jointly to derive each org's seed
            # so different dataset_idx values produce different orgs even
            # with the same algorithm seed.
            for run_seed in seeds:
                org_seed = run_seed * 1000 + dataset_idx
                org = generate_org(persona=persona, seed=org_seed)
                for algo in algos:
                    result = run_experiment(algo, org, seed=run_seed)
                    batch.append(result)
                    if len(batch) >= BATCH_FLUSH:
                        written += append_results(results_path, batch)
                        batch = []
                        elapsed = time.perf_counter() - started_at
                        rate = written / elapsed if elapsed else 0
                        remaining = total_planned - written
                        eta_min = (remaining / rate / 60) if rate else float("inf")
                        print(
                            f"  ... {written}/{total_planned} done "
                            f"({rate:.1f}/s, ETA {eta_min:.1f}m)",
                            flush=True,
                        )

    # Flush any remaining
    if batch:
        written += append_results(results_path, batch)

    elapsed = time.perf_counter() - started_at
    print(f"DONE: {written} results in {elapsed:.1f}s "
          f"({written/elapsed:.1f}/s)")
    return written


def _cli() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--algos", default="all",
        help="comma-separated algorithm ids (or 'all' for everything available)",
    )
    p.add_argument(
        "--personas", default="all",
        help="comma-separated personas (or 'all')",
    )
    p.add_argument(
        "--seeds", default="0-9",
        help="seed range like '0-9' or '0,5,10'",
    )
    p.add_argument(
        "--datasets-per-persona", type=int, default=5,
        help="how many distinct synthetic orgs per persona (varies dataset_idx)",
    )
    p.add_argument(
        "--results-path",
        default=str(DEFAULT_RESULTS_PATH),
        help="parquet file to accumulate results into",
    )
    p.add_argument(
        "--reset", action="store_true",
        help="delete the results file before running",
    )
    args = p.parse_args()

    algos = list(available()) if args.algos == "all" else parse_csv(args.algos)
    personas = list(PERSONAS) if args.personas == "all" else parse_csv(args.personas)
    seeds = parse_seed_range(args.seeds)

    return run(
        algos=algos,
        personas=personas,
        seeds=seeds,
        datasets_per_persona=args.datasets_per_persona,
        results_path=Path(args.results_path),
        reset_results=args.reset,
    ) > 0 and 0 or 0


if __name__ == "__main__":
    sys.exit(_cli())
