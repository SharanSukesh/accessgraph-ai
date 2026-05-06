# Benchmark Report: Anomaly Detection for Salesforce Access Patterns

**Status:** Template — fill with results after running the full benchmark via
`python -m research.anomaly_benchmark.experiment`. The analysis notebook
[`analysis.py`](analysis.py) emits all the tables/figures referenced below.

---

## 1. Setup

### 1.1 Synthetic data
- 3 org personas — small business (25–100 users), mid-market (200–1k), enterprise (2k–10k)
- 5 datasets per persona × 10 seeds = **150 distinct synthetic orgs** evaluated
- Realistic distributions for profile membership (Pareto), PS-per-user counts (negative-binomial), object/field permissions (bimodal — admin vs non-admin), and last-login (log-normal)
- 5 planted anomaly archetypes per org with explicit ground-truth labels:
  1. Over-privileged user (junior profile, admin-tier permissions)
  2. Dormant-but-powerful (90+ days inactive, retains delete + sensitive access)
  3. Role-mismatch (Sales user with HR/Finance object access)
  4. Permission accumulator (5× peer-median PS count)
  5. Sole-access risk (only user with delete on a sensitive object)
- Per-persona anomaly prevalence: 0.5%–5%, matching real Salesforce orgs

Implementation: [`data/generator.py`](data/generator.py), [`data/anomaly_planters.py`](data/anomaly_planters.py).

### 1.2 Algorithms
12 algorithms across 5 paradigms:

| Paradigm | Algorithms |
|---|---|
| Tree/Ensemble | Isolation Forest (sklearn baseline), Extended Isolation Forest (PyOD) |
| Statistical/Probabilistic | ECOD, COPOD, HBOS (PyOD); Robust z-score with MAD (custom) |
| Distance/Density | LOF (sklearn), kNN-AD (PyOD), Mahalanobis (custom) |
| Probabilistic mixture | GMM (sklearn) |
| Neural | AutoEncoder, VAE (PyOD/PyTorch) |

Each algorithm runs with default hyperparameters under a unified `Detector`
protocol ([`algorithms/__init__.py`](algorithms/__init__.py)). Isolation
Forest also runs with a contamination sweep
(`{0.005, 0.01, 0.02, 0.05, 0.10, 0.20}`) since the production value of 0.20
is suspect.

### 1.3 Metrics
- **Precision@k** with `k = n_planted_anomalies` per org
- **Recall@k** (paired with precision@k)
- **F1@k** — harmonic mean of the above
- **AUC-ROC** — threshold-free discrimination
- **AUC-PR** — robust to class imbalance, headline metric for this benchmark
- **Per-archetype recall** — diagnostic, reveals blind spots
- **Inference latency** — wall-clock fit + score time

### 1.4 Statistical rigor
- 10 random seeds per (algorithm, dataset) combination
- 95% bootstrap confidence intervals (10,000 resamples) on every reported metric
- Wilcoxon signed-rank paired test for pairwise comparisons
- Bonferroni correction for the 132-pair comparison matrix (12 algos × 11 others)

---

## 2. Headline Result

> **TBD after running the full benchmark.** This section identifies the
> single algorithm we recommend for production. Format will be:
>
> > Top algorithm: **`<name>`** (AUC-PR = X.XXX, 95% CI [X.XXX, X.XXX]).
> > Beats Isolation Forest by ΔAUC-PR = +X.XXX (Wilcoxon adj_p = X.XXXX).
> > Net recall improvement on the 5 planted archetypes: +XX%.

A small smoke run (sklearn-only, 60 experiments) hinted that **Mahalanobis**
may dominate Isolation Forest on this synthetic data with statistically
significant Wilcoxon margins even at small sample sizes — the full run
will confirm or refute this.

---

## 3. Per-algorithm summary

> Filled by `analysis.py` § "Per-algorithm summary tables".

Each row shows the algorithm's headline metrics with 95% bootstrap CIs over
all 150 datasets × 10 seeds = 1,500 runs.

| Algorithm | Precision@k | Recall@k | F1@k | AUC-PR | AUC-ROC | Mean fit (s) |
|---|---|---|---|---|---|---|
| _TBD_ | | | | | | |

---

## 4. Pairwise significance (Wilcoxon signed-rank, Bonferroni-corrected)

> Heatmap from `analysis.py` § 4. Cells annotated with `*` denote pairs
> where the difference is significant at adj_p < 0.05 after Bonferroni
> correction across the 132 pairwise comparisons.

---

## 5. Per-archetype recall

> Heatmap from `analysis.py` § 5. Highlights detector blind spots.
>
> The DORMANT_POWERFUL archetype is intentionally challenging — the
> current 10-feature schema does not include `last_login_days_ago`, so
> any detector that catches this archetype is likely doing so via
> correlated signals (high delete + sensitive access). Expected
> low recall here for all algorithms is a finding, not a bug — it
> motivates adding a temporal feature in the production handoff.

| Algorithm | OverPriv | DormantPow | RoleMismatch | Accumulator | SoleAccess |
|---|---|---|---|---|---|
| _TBD_ | | | | | |

---

## 6. Inference latency

> Wall-clock fit + score time per org, broken down by persona.
> Production-relevant: a 100ms fit on a 10k-user org runs comfortably in
> the per-org sync pipeline; a 30s fit does not.

| Algorithm | Small (50u) | Mid (500u) | Enterprise (5k u) |
|---|---|---|---|
| _TBD_ | | | |

---

## 7. Contamination sweep for Isolation Forest

> Production currently uses `contamination=0.2`. The benchmark sweep
> tests `{0.005, 0.01, 0.02, 0.05, 0.10, 0.20}` to identify the right
> value for typical orgs (where actual prevalence is 0.5–5%).
>
> Expected finding: 0.20 is much too aggressive — should be in the
> 0.01–0.05 range. The exact recommendation goes here.

---

## 8. Recommendations

### 8.1 Production swap

> Replace
> [`apps/backend/app/services/anomaly_detection.py:120-122`](../../apps/backend/app/services/anomaly_detection.py#L120-L122)
> with the winning algorithm. If multiple algorithms tie within CI,
> prefer (in order):
> 1. Lower inference latency
> 2. Better per-archetype balance
> 3. Algorithmic simplicity (Mahalanobis > AutoEncoder if tied)

### 8.2 Tune contamination

> Set production `contamination = <recommendation from § 7>`.

### 8.3 Add temporal feature

> The DORMANT_POWERFUL archetype is currently invisible to all
> algorithms because `last_login_days_ago` isn't a feature. Adding it is
> a one-line change in
> [`apps/backend/app/services/anomaly_detection.py:179-239`](../../apps/backend/app/services/anomaly_detection.py#L179-L239)
> and is expected to materially improve recall on dormant accounts.

### 8.4 Add unit tests for detection

> [`apps/backend/tests/services/test_anomaly_detection.py`](../../apps/backend/tests/services/) doesn't exist yet.
> Build it using `research/anomaly_benchmark/data/generator.py` to
> generate small known-anomaly orgs and assert flagging.

---

## 9. Future work

- **Real-org evaluation.** This benchmark is synthetic. After the first
  5–10 customers install AccessGraph AI, anonymize their data and re-run
  the benchmark for external validity.
- **Hyperparameter tuning.** All algorithms ran with defaults. A second
  sweep with optuna might shift the winner.
- **Ensemble methods.** Averaging the top-3 detectors (e.g., Mahalanobis +
  IF + ECOD) often outperforms any single one. Worth one experiment.
- **Explainability.** Once the winner is chosen, run SHAP on flagged
  users to attribute the anomaly score to specific features. Powers the
  "why is this user flagged?" surface in the web app.
- **Paper.** The benchmark setup, datasets, and statistical methodology
  are sufficient for a "Anomaly Detection for CRM Permission Audits"
  workshop paper. The synthetic generator is the most novel contribution
  — no public dataset exists for this domain.

---

## 10. Reproducibility

```bash
# 1. Install research-only deps
pip install -r research/anomaly_benchmark/requirements.txt

# 2. Run the full benchmark (~2 hours single CPU)
python -m research.anomaly_benchmark.experiment \
    --algos all --personas all --seeds 0-9 \
    --datasets-per-persona 5 --reset

# 3. Generate the analysis notebook output
jupyter lab research/anomaly_benchmark/analysis.py
# (or open it as Interactive Python in VS Code)

# 4. Update this report's TBD sections from the notebook output
```

All synthetic data is fully deterministic given the (persona, seed,
dataset_idx) tuple. The benchmark is bit-for-bit reproducible.
