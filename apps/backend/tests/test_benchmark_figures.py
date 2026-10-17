"""The methodology page's benchmark figures must equal the committed
published figures (IEEE TPS-ISA 2026 camera-ready, Fig. 4)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PAGE = ROOT / "apps/frontend/src/lib/anomalyBenchmark.json"


def _builder():
    spec = importlib.util.spec_from_file_location(
        "build_benchmark_figures", ROOT / "research/paper_bundle/build_benchmark_figures.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_page_figures_equal_the_published_figures():
    mod = _builder()
    published = json.loads(mod.SOURCE.read_text())
    assert published["label"] == "IEEE TPS-ISA 2026 camera-ready, Fig. 4"
    assert json.loads(PAGE.read_text()) == mod.build(published)


def test_published_mean_is_the_average_of_the_five_archetypes():
    published = json.loads(_builder().SOURCE.read_text())
    deployed = published["detectors"]["rank_average_ensemble"]
    values = list(deployed["recall"].values())
    assert len(values) == 5
    assert abs(sum(values) / len(values) - deployed["mean"]) < 0.001
