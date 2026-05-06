"""Parquet-backed results store. One row per (algo, dataset, seed)."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

import pandas as pd

from .runner import RunResult


def append_results(path: Path, results: Iterable[RunResult]) -> int:
    """Append rows to the parquet file at `path`. Creates it if missing.

    Returns the number of rows appended. If `path` already exists, we read
    + concat + rewrite — fine for our benchmark sizes (a few thousand rows).
    For multi-million-row scale we'd switch to partitioned parquet.
    """
    new_df = pd.DataFrame([r.to_dict() for r in results])
    if new_df.empty:
        return 0

    if path.exists():
        existing = pd.read_parquet(path)
        df = pd.concat([existing, new_df], ignore_index=True)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        df = new_df

    df.to_parquet(path, index=False)
    return len(new_df)


def load_results(path: Path) -> pd.DataFrame:
    """Load all results from a parquet file into a DataFrame for analysis."""
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


def reset(path: Path) -> None:
    """Delete the results file. Used at the start of a fresh experiment run
    to avoid mixing results from different code versions."""
    if path.exists():
        path.unlink()
