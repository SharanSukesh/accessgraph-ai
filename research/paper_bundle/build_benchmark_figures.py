"""Builds apps/frontend/src/lib/anomalyBenchmark.json, the figures on the
in-app methodology page, from published_figures_tpsisa2026_fig4.json: the
published figures of the IEEE TPS-ISA 2026 camera-ready paper (Fig. 4,
v2 per-archetype recall), as committed. The paper text itself is not in
the repository (IEEE copyright). Nothing is retyped: this script only
maps the paper's archetype names to the app's.

    python research/paper_bundle/build_benchmark_figures.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "research/paper_bundle/published_figures_tpsisa2026_fig4.json"
OUT = ROOT / "apps/frontend/src/lib/anomalyBenchmark.json"

# Paper archetype -> name used in the app.
PATTERNS = {
    "Over-privileged": "Over-privilege",
    "Dormant powerful": "Dormant privileged accounts",
    "Role mismatch": "Role mismatch",
    "Permission accumulator": "Permission accumulation",
    "Sole access": "Exclusive access",
}


def build(published: dict) -> dict:
    deployed = published["detectors"]["rank_average_ensemble"]
    return {
        "source": published["label"],
        "figure": published["figure"],
        "citation": published["citation"],
        "doi": published["doi"],
        "synthetic_orgs": published["synthetic_orgs"],
        "mean_recall": deployed["mean"],
        "per_pattern_recall": [
            {"pattern": PATTERNS[name], "paper_archetype": name, "recall": value}
            for name, value in deployed["recall"].items()
        ],
    }


def main() -> None:
    figures = build(json.loads(SOURCE.read_text()))
    OUT.write_text(json.dumps(figures, indent=2) + "\n")
    print(json.dumps(figures, indent=2))


if __name__ == "__main__":
    main()
