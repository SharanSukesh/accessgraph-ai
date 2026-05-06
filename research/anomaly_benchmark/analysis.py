"""Analysis notebook for the anomaly-benchmark results.

Written as a .py file with `# %%` cell markers so it works as a Jupyter
notebook in VS Code Interactive / Jupyter Lab without requiring a binary
.ipynb checkin. Convert to .ipynb if needed:

    jupytext --to notebook research/anomaly_benchmark/analysis.py

Sections:
    1. Setup
    2. Per-algorithm summary tables (precision@k, recall@k, F1, AUC-PR, AUC-ROC)
    3. Bootstrap CIs
    4. Pairwise Wilcoxon significance heatmap
    5. Per-archetype recall breakdown
    6. Inference latency scaling
    7. Recommendations for production
"""
# %% [markdown]
# # AccessGraph AI — Anomaly Detection Benchmark Analysis
#
# Loads the experiment parquet produced by `experiment.py` and produces:
#  * per-algorithm summary tables with bootstrap 95% CIs
#  * pairwise Wilcoxon significance matrix (Bonferroni-corrected)
#  * per-archetype recall breakdown
#  * inference-latency scaling
#
# Conclusions feed directly into `REPORT.md`.

# %%
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Ensure the research package is importable (works in VS Code interactive
# even when the notebook isn't run via `python -m`).
import sys
REPO_ROOT = Path.cwd()
while REPO_ROOT != REPO_ROOT.parent and not (REPO_ROOT / "research").exists():
    REPO_ROOT = REPO_ROOT.parent
sys.path.insert(0, str(REPO_ROOT))

from research.anomaly_benchmark.stats import (
    summary_table,
    pairwise_significance,
)

RESULTS_PATH = REPO_ROOT / "research" / "anomaly_benchmark" / "results" / "results.parquet"

sns.set_theme(style="whitegrid")

# %%
df = pd.read_parquet(RESULTS_PATH)
print(f"Loaded {len(df)} runs across {df['algo'].nunique()} algorithms, "
      f"{df['persona'].nunique()} personas, {df['seed'].nunique()} seeds, "
      f"{df['dataset_id'].nunique()} datasets.")
print(f"Failures: {int(df['failed'].sum())} / {len(df)}")

# %%
# Drop failed runs from the analysis (they're recorded for debugging,
# not for averaging).
clean = df[~df["failed"]].copy()


# %% [markdown]
# ## 1. Per-algorithm summary tables
#
# Each metric reported as mean ± 95% bootstrap CI across all (dataset, seed)
# pairs.

# %%
for metric in ["precision_at_k", "recall_at_k", "f1_at_k", "auc_pr", "auc_roc"]:
    print(f"\n=== {metric} ===")
    s = summary_table(clean, metric)
    print(s.round(3).to_string())


# %% [markdown]
# ## 2. AUC-PR comparison plot
#
# AUC-PR is the headline metric for this benchmark — best for imbalanced
# binary classification (anomalies are <5% of users).

# %%
fig, ax = plt.subplots(figsize=(10, 5))
order = clean.groupby("algo")["auc_pr"].mean().sort_values(ascending=False).index
sns.boxplot(data=clean, x="algo", y="auc_pr", order=order, ax=ax)
ax.set_title("AUC-PR distribution by algorithm")
ax.set_xlabel("Algorithm")
ax.set_ylabel("AUC-PR")
plt.xticks(rotation=30, ha="right")
plt.tight_layout()
plt.show()


# %% [markdown]
# ## 3. Pairwise significance (Wilcoxon paired test, Bonferroni-corrected)
#
# Negative `mean_diff` means algo_b beats algo_a. We surface only pairs
# with adj_p < 0.05.

# %%
for metric in ["auc_pr", "precision_at_k"]:
    print(f"\n=== Pairwise significance for {metric} (adj_p < 0.05) ===")
    sig = pairwise_significance(clean, metric)
    sig_only = sig[sig["adj_p"] < 0.05].sort_values("mean_diff", ascending=False)
    if sig_only.empty:
        print("(no pairs reached significance — try more seeds/datasets)")
    else:
        print(sig_only.round(4).to_string(index=False))


# %% [markdown]
# ## 4. Pairwise significance heatmap
#
# Cell color = sign + magnitude of mean_diff (algo_a vs algo_b on AUC-PR);
# cells where the diff is statistically significant after Bonferroni
# correction are annotated.

# %%
def plot_pairwise_heatmap(clean: pd.DataFrame, metric: str = "auc_pr"):
    sig = pairwise_significance(clean, metric)
    pivot_diff = sig.pivot(index="algo_a", columns="algo_b", values="mean_diff")
    pivot_p = sig.pivot(index="algo_a", columns="algo_b", values="adj_p")

    fig, ax = plt.subplots(figsize=(10, 8))
    sns.heatmap(
        pivot_diff,
        annot=pivot_p.map(lambda p: "*" if p < 0.05 else "").values,
        fmt="",
        cmap="RdBu_r",
        center=0,
        cbar_kws={"label": f"mean_diff in {metric} (a vs b)"},
        ax=ax,
    )
    ax.set_title(
        f"Pairwise {metric} difference\n"
        f"(rows = algo_a, columns = algo_b; * = adj_p<0.05)"
    )
    plt.tight_layout()
    return fig


plot_pairwise_heatmap(clean, "auc_pr")
plt.show()


# %% [markdown]
# ## 5. Per-archetype recall
#
# Does the winner detect every kind of anomaly equally, or is it blind
# to specific archetypes?

# %%
archetype_cols = [
    "recall_over_privileged",
    "recall_dormant_but_powerful",
    "recall_role_mismatch",
    "recall_permission_accumulator",
    "recall_sole_access_risk",
]

per_arch = (
    clean.groupby("algo")[archetype_cols]
    .mean()
    .sort_index()
)
print(per_arch.round(3).to_string())

fig, ax = plt.subplots(figsize=(11, 6))
sns.heatmap(per_arch, annot=True, fmt=".2f", cmap="YlOrRd", ax=ax,
            cbar_kws={"label": "mean recall"})
ax.set_title("Per-archetype mean recall by algorithm")
ax.set_xlabel("Anomaly archetype")
ax.set_ylabel("Algorithm")
plt.xticks(rotation=20, ha="right")
plt.tight_layout()
plt.show()


# %% [markdown]
# ## 6. Inference latency
#
# Wall-clock fit + score time, scaled by org size. Production-relevant
# even if AUC-PR is identical between two algorithms.

# %%
latency = (
    clean.groupby(["algo", "persona"])
    [["fit_seconds", "score_seconds"]]
    .mean()
    .round(4)
)
print(latency.to_string())


# %% [markdown]
# ## 7. Recommendation summary
#
# Top algorithm by AUC-PR with significant lead over Isolation Forest:

# %%
auc_pr_summary = summary_table(clean, "auc_pr")
top = auc_pr_summary.iloc[0]
print(f"Top algorithm by mean AUC-PR: {top.name}")
print(f"  mean = {top['mean']:.3f}, 95% CI = [{top['ci_lower']:.3f}, {top['ci_upper']:.3f}]")
print(f"  vs. isolation_forest mean = {auc_pr_summary.loc['isolation_forest', 'mean']:.3f}")

sig = pairwise_significance(clean, "auc_pr")
top_vs_if = sig[(sig["algo_a"] == top.name) & (sig["algo_b"] == "isolation_forest")]
if not top_vs_if.empty:
    row = top_vs_if.iloc[0]
    print(f"  Wilcoxon vs IF: mean_diff = {row['mean_diff']:+.3f}, "
          f"raw_p = {row['raw_p']:.4f}, adj_p = {row['adj_p']:.4f}")
