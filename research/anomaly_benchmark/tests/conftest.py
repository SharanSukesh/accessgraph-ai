"""Make the repo root importable so `from research.anomaly_benchmark...`
works regardless of where pytest is invoked from."""
import sys
from pathlib import Path

# This file lives at research/anomaly_benchmark/tests/conftest.py; the repo
# root is three levels up.
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
