# Research Paper Bundle

A self-contained snapshot of all the AccessGraph AI research work, formatted for
copy-paste into Claude Deep Research (or any other research-paper drafting tool)
to produce a publishable paper.

## How to use

The single file `PUBLISHABLE_PAPER_BUNDLE.md` contains everything Deep Research
needs:
- Domain context (Salesforce permission model, AccessGraph AI product)
- Problem formulation (5 anomaly archetypes, gap in existing tools)
- Methodology (synthetic-data design, 13-feature schema, 14 algorithms, statistics)
- Results (v1 + v2 benchmarks, full numerical tables, per-archetype recall)
- Key findings (especially the "ensemble averaging dilutes specialist signal" insight)
- Reproducibility and code references

**Workflow:**
1. Open `PUBLISHABLE_PAPER_BUNDLE.md`
2. Paste its full contents into a Claude Deep Research conversation
3. Prompt: *"Using only the information in the bundle, write a publishable conference workshop paper on access anomaly detection in CRM systems. Target venue: an applied-ML or security workshop (e.g., USENIX Security, ACM CCS, or KDD applied data science track). Format: 8 pages, with abstract, introduction, related work, methodology, results, discussion, limitations, conclusion, and references."*

The bundle is self-sufficient — no external file lookups needed. All numeric
tables are embedded directly.

## What's in the bundle (high level)

- **Section 1**: Product context — what AccessGraph AI is and why this research matters.
- **Section 2**: The Salesforce permission model — domain knowledge a paper reviewer would need.
- **Section 3**: Problem statement — anomaly detection in CRM access patterns; the 5-archetype taxonomy.
- **Section 4**: Related work — Salesforce native tools (Summer '26 Field Access tab, Security Center 2.0), commercial competitors (Clientell AI), and prior unsupervised anomaly detection literature.
- **Section 5**: Methodology — synthetic-data generator, feature schemas (v1 + v2), 14 algorithms across 5 paradigms, evaluation framework.
- **Section 6**: v1 results — initial 10-feature benchmark identifying Isolation Forest baseline as suboptimal and selecting Mahalanobis distance as the v1 winner.
- **Section 7**: Feature engineering — analysis of per-archetype blind spots in v1, design of three new features.
- **Section 8**: v2 results — 13-feature benchmark with 14 algorithms (12 base + 2 ensembles); Mahalanobis+GMM rank-average ensemble wins.
- **Section 9**: The OVER_PRIVILEGED trade-off — key publishable finding about ensemble signal dilution.
- **Section 10**: Discussion — feature engineering vs algorithm choice; classical vs neural methods at this scale.
- **Section 11**: Limitations and future work.
- **Section 12**: Reproducibility — repo structure, exact commands, random seeds.
- **Appendix**: Full numerical tables, statistical significance matrices.

## Why this format

A publishable paper requires comprehensive context that a reviewer can verify
without external sources. The bundle is one file so:
- The model answering the prompt has everything in context
- Nothing relies on file system access or repo state
- Easy to version (single file diff) as the research evolves
- Can be archived / shared as a standalone artifact alongside the codebase

## Source of truth

The bundle is derived from:
- `research/anomaly_benchmark/REPORT.md` (final empirical results)
- `research/anomaly_benchmark/data/*.py` (synthetic generator implementation)
- `research/anomaly_benchmark/algorithms/*.py` (algorithm adapters)
- `apps/backend/app/services/anomaly_detection.py` (production deployment)
- This conversation's running discussion of design choices

When you re-run the benchmark and get updated numbers, regenerate the bundle:
copy the new tables from REPORT.md into the relevant sections.
