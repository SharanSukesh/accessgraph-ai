"""Extracts the production detector's benchmark figures from the paper text
into apps/frontend/src/lib/anomalyBenchmark.json, for the in-app
methodology page. Nothing is retyped: the figures are parsed from the
per-archetype recall table (row "mahalanobis_gmm_avg"), the mean-recall
row and the synthetic-org count.

Source: research/paper_bundle/PUBLISHABLE_PAPER_BUNDLE.md, the repo's
draft of the paper accepted at IEEE TPS 2026. To use the camera-ready
paper instead, point SOURCE at a text export of it with the same table
and re-run.

    python research/paper_bundle/extract_benchmark_figures.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "research/paper_bundle/PUBLISHABLE_PAPER_BUNDLE.md"
OUT = ROOT / "apps/frontend/src/lib/anomalyBenchmark.json"

PATTERNS = {  # paper column -> name used in the app
    "OverPriv": "Over-privilege",
    "DormantPow": "Dormant privileged accounts",
    "RoleMismatch": "Role mismatch",
    "Accumulator": "Permission accumulation",
    "SoleAccess": "Exclusive access",
}


def extract(text: str, source: Path = SOURCE) -> dict:
    # The per-archetype recall table (section 8.3 in the draft).
    section = text[text.index("## 8.3 Per-archetype recall"):]
    section = section[:section.index("\n## ", 5)]
    header = re.search(r"^\| Algorithm \|(.+)\|\s*$", section, re.M)
    columns = [c.strip() for c in header.group(1).split("|")]
    row = re.search(r"^\| \*\*mahalanobis_gmm_avg[^|]*\|(.+)\|\s*$", section, re.M)
    values = [float(v.strip().strip("*")) for v in row.group(1).split("|")]
    recall = [{"pattern": PATTERNS[c], "paper_column": c, "recall": v} for c, v in zip(columns, values)]
    mean = re.search(r"^\| Mean recall \(5 archetypes\) \| [\d.]+ \| ([\d.]+) \|", text, re.M)
    orgs = re.search(r"= \*\*(\d+) synthetic orgs\*\*", text)
    return {
        "source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
        "source_note": "Draft paper text in the repo; confirm against the camera-ready Table II.",
        "venue": "IEEE TPS 2026",
        "synthetic_orgs": int(orgs.group(1)),
        "mean_recall": float(mean.group(1)),
        "per_pattern_recall": recall,
    }


def main() -> None:
    source = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SOURCE
    figures = extract(source.read_text(), source)
    OUT.write_text(json.dumps(figures, indent=2) + "\n")
    print(json.dumps(figures, indent=2))


if __name__ == "__main__":
    main()
