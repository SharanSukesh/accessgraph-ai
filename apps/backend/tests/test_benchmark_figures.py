"""The methodology page's benchmark figures come from the paper text, not
from retyping: the committed JSON must equal a fresh extraction."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _extractor():
    spec = importlib.util.spec_from_file_location(
        "extract_benchmark_figures", ROOT / "research/paper_bundle/extract_benchmark_figures.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_committed_figures_match_the_paper_text():
    mod = _extractor()
    fresh = mod.extract(mod.SOURCE.read_text())
    committed = json.loads((ROOT / "apps/frontend/src/lib/anomalyBenchmark.json").read_text())
    assert committed == fresh


def test_mean_recall_is_the_average_of_the_patterns():
    figures = json.loads((ROOT / "apps/frontend/src/lib/anomalyBenchmark.json").read_text())
    per = [p["recall"] for p in figures["per_pattern_recall"]]
    assert len(per) == 5
    assert abs(sum(per) / len(per) - figures["mean_recall"]) < 0.001
