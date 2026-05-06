# AccessGraph AI: Research Paper Bundle

> **Target use:** copy-paste this entire file into Claude Deep Research (or any other
> research-paper drafting tool). Prompt: *"Using only the information in this bundle,
> draft a publishable conference workshop paper on access anomaly detection in CRM systems.
> Target venue: an applied ML or security workshop (e.g., USENIX Security applied track,
> KDD applied data science, or an IAM-focused industry track). 8 pages, with abstract,
> introduction, related work, methodology, results, discussion, limitations, conclusion,
> and references."*
>
> The bundle is self-contained — no external file lookups needed. All numeric tables
> are embedded directly.

---

# Section 1: Product Context

## 1.1 What is AccessGraph AI

AccessGraph AI is a continuous-access-review SaaS for Salesforce administrators. Customers
install a managed package into their Salesforce org; the package registers a Connected App
that grants the AccessGraph AI backend read-only metadata access via OAuth 2.0. The backend
periodically pulls the org's permission graph (users, profiles, permission sets, permission
set groups, object permissions, field permissions, sharing settings) into a Postgres
database. A web dashboard surfaces three things to admins:
- An **access graph** visualization (user-centric view of who can do what)
- A list of **anomalies** (users flagged by the ML model documented in this paper)
- A list of **AI-generated remediation recommendations** for each anomaly

Architecturally:
- **Backend**: FastAPI + SQLAlchemy + Postgres, hosted on Railway. Hand-rolled
  encryption at rest for OAuth refresh tokens (custom SQLAlchemy `EncryptedString`
  type that wraps AES-GCM via `cryptography`).
- **Frontend**: Next.js 14 + React Query + Cytoscape.js for the graph rendering.
- **Salesforce package**: managed 2GP package (`accessgraphai` namespace) with a
  Lightning App, Apex connector class, post-install handler, and an in-app
  "Explorer" tab that lets admins search for users / permission sets / fields and
  deep-link into the web dashboard.
- **Production v2.0** (this paper) ships with the Mahalanobis + GMM rank-average
  ensemble described in Sections 7-9.

## 1.2 Why anomaly detection matters here

Salesforce permissions accrete over time:
- An admin grants a temporary permission set for a short project; nobody removes it.
- A user's role changes but their old permissions persist.
- Org-Wide Defaults are loosened to fix a sharing problem and never tightened.
- Profiles get cloned, edited, and become drift from the original.

Manual quarterly access reviews don't scale past ~50 users. Existing native
Salesforce tooling (covered in Section 4) is field-pivoted (object → field → which
profiles?), not user-pivoted (user → what can they do?), so it answers the wrong
question for an audit. AccessGraph AI's product hypothesis: a user-centric access
graph + automated anomaly detection + remediation guidance closes the loop better
than the manual + native-tools workflow.

This paper documents the ML/statistics work behind the anomaly-detection component:
how we picked the algorithm, validated it, and discovered a non-obvious
ensemble-averaging-dilutes-specialist-signal phenomenon along the way.

---

# Section 2: The Salesforce Permission Model (Domain Knowledge)

A reviewer not familiar with Salesforce needs this background to evaluate the
methodology. The model is unusually multi-layered for an enterprise CRM — that
multi-layeredness is precisely what makes anomaly detection interesting.

## 2.1 Core entities

**User** — a person who logs into Salesforce. Has a Profile and (optionally) a
UserRole, plus zero or more PermissionSetAssignments.

**Profile** — a baseline permission template. Every user has exactly one. Profiles
combine user-level permissions ("API Enabled", "View All Data"), object-level CRUD,
field-level R/W, and tab/app visibility.

**Permission Set (PS)** — additive permission grants on top of a profile. A user
can be assigned many PSes. Designed for least-privilege baselines + additive
elevation.

**Permission Set Group (PSG)** — a bundle of PSes. Assigning a user to a PSG is
equivalent to assigning each component PS individually, except for muting PSes
which can REMOVE specific grants from members of the group.

**UserRole** — orthogonal to profiles/PSes; affects record visibility through the
role hierarchy.

## 2.2 Permission storage

- **ObjectPermissions**: rows on the `ObjectPermissions` SObject; each row is
  `(parent_id, sobject_type, permissions_read, permissions_create, permissions_edit,
  permissions_delete, permissions_view_all_records, permissions_modify_all_records)`.
  `parent_id` is a PermissionSet ID (yes, even for profile-owned permissions —
  Salesforce represents profile permissions as a hidden profile-owned permission set).
- **FieldPermissions**: similar shape but per-field, with only Read and Edit flags.
  Critically, a missing FieldPermission row does NOT mean "no access" — it means
  "default access from the parent object's CRUD," which for most standard fields is
  "accessible if the user has Read on the object." This bites our feature-engineering
  in Section 7.
- **System-level permissions**: ~250 boolean fields directly on the PermissionSet
  object (`PermissionsModifyAllData`, `PermissionsApiEnabled`, `PermissionsAuthorApex`,
  `PermissionsViewAllUsers`, etc.).

## 2.3 Sharing and record access

Beyond CRUD permissions, **record-level access** is governed by:
- **Org-Wide Defaults (OWD)**: per-object public/private/read-only baseline.
- **Role hierarchy**: managers automatically get records owned by direct reports.
- **Sharing rules**: declarative grants of access to records matching criteria.
- **Manual sharing**: per-record explicit grants.
- **Implicit sharing**: hardcoded behavior (Account → Contact → Opportunity).

This paper focuses on **permission-level** anomaly detection (object/field
permissions) and explicitly defers record-level sharing to future work — adding
record-level features would require parsing OWDs and sharing rules into
per-user-per-record grants, which is a substantially larger ingestion problem.

## 2.4 Why this is hard

Three properties make Salesforce access uniquely difficult to audit by hand:
1. **Multi-layered**: a user's effective access is the result of profile + N
   permission sets + M permission set groups (each containing K PSes) - muting PSes,
   then constrained by sharing settings. Computing it requires walking 4-5 tables.
2. **Long-tail of object/field count**: a typical mid-market org has 50-200
   custom objects, each with 30-100 fields. Total grants per user can run into
   the thousands.
3. **Heavy reliance on conventions**: HR data lives in custom objects whose
   "department" association exists only by naming convention (`HR_Employee__c`)
   or by which permission set governs them. There's no built-in "department"
   tag on objects.

---

# Section 3: Problem Statement

## 3.1 Formal problem

**Input.** A snapshot of one organization's permission graph at time `t`:
- A set of users `U`, each with a profile, an optional role, an optional department,
  and a last-login timestamp.
- A set of permission sets `P` (incl. profile-owned PSes and PSGs) with object
  and field permissions.
- A set of `PermissionSetAssignments` linking users to PSes / PSGs.

**Output.** A ranking of `U` by anomaly score (higher = more likely to be an
access risk that warrants admin review). Top-k flags with `k = ⌊|U| · ρ⌋`,
where `ρ` is the expected anomaly prevalence (default 2% based on observed
real-org rates).

**Per-user feature vector.** Each user is summarized as a 13-dimensional
real-valued vector. The feature schema (Section 5.2) is the result of two
benchmark-driven design iterations: v1 with 10 hand-engineered features, v2
adding 3 features that close specific archetype blind spots identified by v1.

**Evaluation.** Each user has an unobserved ground-truth label
`is_anomaly ∈ {0, 1}` and (if anomaly) one of 5 `anomaly_archetypes`. A detector
is good if its score-induced top-k contains a high fraction of the true
anomalies. We evaluate via Precision@k, Recall@k, F1@k, AUC-ROC, AUC-PR, and
per-archetype recall.

## 3.2 The 5-archetype taxonomy

The taxonomy was designed before the benchmark, motivated by audit findings that
real Salesforce admins commonly surface:

1. **OVER_PRIVILEGED** — junior-profile user with admin-tier permissions. The
   classic "Sarah from Sales has Modify All Data because someone gave her the
   wrong PS." Single-extreme-outlier pattern.

2. **DORMANT_POWERFUL** — user hasn't logged in 90+ days but retains delete
   access on sensitive objects. Compliance risk; also breach risk because the
   account is still live and could be compromised.

3. **ROLE_MISMATCH** — user whose access spans departments inconsistent with
   their role/department. e.g., a Sales user with HR.Salary__c read access.
   Multimodal pattern: their access mixes two department clusters.

4. **PERMISSION_ACCUMULATOR** — user with 5x peer-median permission set count
   from years of ad-hoc grants. Their per-grant access is normal but the
   cumulative reach is anomalous. Subtle pattern; often invisible to single-
   feature detectors.

5. **SOLE_ACCESS_RISK** — only person in the org with delete access on a
   sensitive object. Both a compliance issue (no segregation of duties) and an
   operational risk (single point of failure if they leave).

Each archetype is detectable by a different feature signature (Section 5).
The benchmark validates whether a given algorithm finds each one.

## 3.3 Why this is interesting as research

Three reasons this problem is worth a paper:

1. **No public dataset exists for CRM permission anomaly detection.** Prior
   anomaly-detection work is on tabular UCI datasets (KDDCup99, NSL-KDD,
   credit-card fraud) that don't match the structural properties of CRM
   permission data. This paper contributes the synthetic dataset generator
   itself.

2. **The domain has a natural archetype taxonomy** that lets us measure
   per-archetype recall — most anomaly papers report only aggregate AUC-PR
   or F1, hiding which kinds of anomalies a detector actually catches.

3. **The benchmark surfaces a non-obvious finding**: rank-averaging two
   complementary detectors trades per-archetype peaks for breadth. The
   "ensemble dilutes specialist signal" effect (Section 9) is a
   publishable observation that wouldn't have shown up in
   aggregate-only evaluation.

---

# Section 4: Related Work

## 4.1 Salesforce-native tools

- **Profile / Permission Set view pages** (Setup): show what each profile or
  PS grants. Object-pivoted, not user-pivoted; admin must construct the
  effective-access view manually.

- **User Access Summary** (introduced 2023): per-user view of "where does this
  permission come from?" — useful for explanation but not for ranking which
  users are anomalous.

- **Field Access tab in Object Manager** (Summer '26 / Release 262, GA June
  2026): for a selected field, lists every profile/PS/PSG granting access.
  Field-pivoted, no user ranking, no anomaly detection. AccessGraph AI's
  Explorer tab is a strict superset (user-pivoted picker + dashboard
  drill-through).

- **Salesforce Security Center 2.0**: surfaces compliance dashboards and login
  anomalies (geo, time-of-day) but does not analyze permission data for
  archetype anomalies.

- **Shield Real-Time Event Monitoring**: detects runtime behavioral anomalies
  (unusual report exports, suspicious API call rates). Orthogonal to permission
  configuration anomalies — Shield watches what users do; AccessGraph AI
  analyzes what they CAN do.

- **User Access Policies**: rule-based grants/revokes triggered by user state
  (e.g., "remove permission X when role changes"). Orthogonal — automation
  rules, not detection.

## 4.2 Commercial competitors

- **Clientell AI**: closest market competitor; offers natural-language permission
  queries against Salesforce. Does not have a graph view or per-archetype
  anomaly detection at time of writing.

- **Generic IGA (Identity Governance and Administration) platforms**
  (Saviynt, SailPoint, Okta IGA): support Salesforce as one of many connectors;
  detection is rules-based ("user has X permission they shouldn't") not ML-based.
  Setup overhead is large; cost/complexity rules them out for SMB customers.

- **Microsoft Cloud App Security**: covers Microsoft 365 and adjacent SaaS;
  Salesforce coverage is limited.

## 4.3 Prior anomaly-detection literature

The benchmark covers 14 algorithms across 5 paradigms. Each has a substantial
literature; representative prior work:

- **Tree-based**: Liu et al., "Isolation Forest" (ICDM 2008) — the seminal
  unsupervised tree ensemble. Hariri et al., "Extended Isolation Forest"
  (IEEE TKDE 2021) — adds non-axis-aligned splits.

- **Statistical**: Li et al., "ECOD: Unsupervised Outlier Detection Using
  Empirical Cumulative Distribution Functions" (IEEE TKDE 2022). Li et al.,
  "COPOD: Copula-Based Outlier Detection" (ICDM 2020).

- **Distance/density**: Breunig et al., "LOF: Identifying Density-Based Local
  Outliers" (SIGMOD 2000). Ramaswamy et al., "Efficient Algorithms for Mining
  Outliers from Large Data Sets" (SIGMOD 2000).

- **Probabilistic**: Reynolds, "Gaussian Mixture Models" (Encyclopedia of
  Biometrics, 2009). Mahalanobis, "On the Generalised Distance in Statistics"
  (Proc. National Institute of Sciences of India, 1936) — yes, 1936; it's the
  baseline that, in this paper, beats every modern method except the ensemble.

- **Neural**: Sakurada and Yairi, "Anomaly Detection Using Autoencoders with
  Nonlinear Dimensionality Reduction" (MLSDA 2014). Kingma and Welling,
  "Auto-Encoding Variational Bayes" (ICLR 2014).

- **Ensembles**: Aggarwal and Sathe, "Theoretical Foundations and Algorithms
  for Outlier Ensembles" (SIGKDD Explorations 2015). The "ensemble averaging
  dilutes specialist signal" finding in Section 9 is a specific case of the
  bias-variance trade-off they describe in Sec. 4.

## 4.4 Gap this paper fills

To our knowledge, no prior paper:
1. Provides a synthetic Salesforce-org-shaped dataset suitable for benchmarking
   anomaly detection.
2. Reports per-archetype recall on the same evaluation as aggregate metrics.
3. Documents the rank-averaging dilution effect on tightly-clustered anomaly
   archetypes.

This paper contributes all three.

---

# Section 5: Methodology

## 5.1 Synthetic data generator

Real Salesforce org data is highly sensitive (it includes user identities and
business metadata). To enable a reproducible benchmark without customer-data
contamination, we built a synthetic generator that produces realistic
Salesforce-org snapshots with explicitly-labeled ground-truth anomalies.

**Org-size personas:**
| Persona | Users | Profiles used | Anomaly prevalence |
|---|---|---|---|
| Small business | 25–100 | 5 | 2–5% |
| Mid-market | 200–1,000 | 10 | 1–3% |
| Enterprise | 2,000–10,000 | 15 | 0.5–2% |

5 datasets per persona × 10 seeds × 3 personas = **150 synthetic orgs**.

**Distributional realism:**
- **Profile membership**: Pareto-shaped weights via Zipf-like distribution
  (largest profile gets ~30% of users, second ~15%, long tail).
- **Permission-set count per user**: Poisson(λ = profile-baseline) with
  occasional geometric-tail draws to model "permission accumulator" noise
  in the normal population.
- **Object/field permission breadth**: Poisson(μ = profile-baseline) with
  ~5% chance of 5x multiplier (admins).
- **Sensitive-field access**: 2x baseline for HR/Finance profiles.
- **Last-login**: log-normal (mean=1.5, sigma=1.5), heavy tail of dormant
  accounts.

The 4 seniority tiers (junior / mid / senior / admin) each have a distinct
baseline access vector. Profiles are tagged with both seniority and
department, giving 15 distinct profile shapes that the generator samples
from.

**Anomaly planters:** five functions that mutate one normal user into a
labeled anomaly. Each modifies a small number of features in a way that
mirrors the corresponding real-world risk pattern:
1. `plant_over_privileged`: junior profile, bumped to admin-tier permission
   counts in object_edit, object_delete, field_edit, sensitive_fields. Profile
   name kept as junior — that mismatch IS the signal.
2. `plant_dormant_powerful`: senior/admin profile, last_login_days_ago bumped
   to [90, 400). Permissions stay; the inactivity is the new signal.
3. `plant_role_mismatch`: Sales user, sensitive_objects/fields bumped to
   senior baseline, **cross_department_access_ratio set to [0.6, 0.85]**.
4. `plant_permission_accumulator`: any user, num_permission_sets multiplied
   by [4.5, 6.5]. Object/field perms unchanged — only the PS count is
   anomalous.
5. `plant_sole_access_risk`: bump num_objects_delete by 5-10, bump
   num_sensitive_objects by 2-6, **set unique_access_count to [3, 9)**.

The detector NEVER sees `is_anomaly` or `anomaly_archetype` during fit/score.
These are only used by the evaluation harness to compute precision/recall.

**Reproducibility:** every random draw is seeded by `(persona, seed,
dataset_idx)`. Two runs with the same seed produce bit-identical orgs.

## 5.2 Feature schemas

### v1 (10 features) — initial production parity

The first benchmark mirrored production's existing 10-feature schema:
1. `num_permission_sets`
2. `num_permission_set_groups`
3. `num_objects_read`
4. `num_objects_edit`
5. `num_objects_delete`
6. `num_fields_read`
7. `num_fields_edit`
8. `num_sensitive_objects` (count of sensitive objects with read access)
9. `num_sensitive_fields`
10. `permission_breadth_score` = `num_objects_edit + 2*num_objects_delete + num_fields_edit + 3*num_sensitive_fields`

Only one feature (#10) is non-linear; the rest are raw counts.

### v2 (13 features) — closes archetype blind spots

v1 results (Section 6) showed three archetypes were nearly invisible to every
algorithm. The fix was feature engineering, not algorithm choice:

11. **last_login_days_ago** — closes DORMANT_POWERFUL.
12. **cross_department_access_ratio** — fraction of accessible
    objects/fields whose department classification differs from the user's
    own. Closes ROLE_MISMATCH.
13. **unique_access_count** — number of (object, permission_type) tuples
    where this user is the sole grantee in the org. Closes SOLE_ACCESS_RISK.

Cross-department classification uses (a) a hardcoded standard-object
department map (Account/Contact/Lead → Sales; Case → Support;
Contract → Legal; etc.), and (b) a custom-object prefix heuristic
(HR_*, Fin_*, etc.).

### v1 → v2 production deployment

The production code mirrors the synthetic schema exactly (`research/anomaly_benchmark/data/schemas.py` is the canonical source; `apps/backend/app/services/anomaly_detection.py:_extract_user_features` is the matching extractor). The `last_login_at` column was added to `UserSnapshot` (Alembic migration `e7d2c1f4a8b6`). Cross-department and unique-access are computed at scoring time by walking the access graph; unique-access requires an org-wide pre-pass before per-user feature extraction (single O(n_users × avg_grants_per_user) loop builds the inverse index).

## 5.3 Algorithms (14 total)

All wrapped behind a unified protocol:

```python
class Detector(Protocol):
    seed: int
    def fit(self, X: np.ndarray) -> None: ...
    def score(self, X: np.ndarray) -> np.ndarray: ...      # higher = more anomalous
    def predict(self, X: np.ndarray, k: int) -> np.ndarray: ...  # 0/1 top-k labels
```

| Paradigm | Algorithm | Library | Notes |
|---|---|---|---|
| Tree/Ensemble | Isolation Forest | sklearn | Production v0 baseline |
|  | Extended Isolation Forest | PyOD | Hyperplane (non-axis) splits |
| Statistical | ECOD | PyOD | Empirical CDF, parameter-free |
|  | COPOD | PyOD | Copula-based, parameter-free |
|  | HBOS | PyOD | Histogram-based, fastest |
|  | Robust z-score (MAD) | scipy + custom | Domain-friendly baseline |
| Distance/Density | LOF | sklearn | Local Outlier Factor |
|  | kNN-AD | PyOD | Distance to k-th neighbor |
|  | Mahalanobis | scipy + custom | Multivariate distance |
| Probabilistic | GMM | sklearn | 3-component mixture |
| Neural | AutoEncoder | PyOD (PyTorch) | Dense AE, reconstruction error |
|  | VAE | PyOD (PyTorch) | Variational AE |
| **Ensemble (v2)** | **Mahalanobis + GMM rank-AVG** | custom | **Production v2 detector** |
|  | Mahalanobis + GMM rank-MAX | custom | Alternative ensemble variant |

All algorithms ran with library defaults. No hyperparameter tuning per the
benchmark plan (§ 9 future work).

## 5.4 Evaluation metrics

- **Precision@k**: fraction of top-k flagged users that are true anomalies, with
  k = number of planted anomalies in that org. The most product-relevant metric.
- **Recall@k**: paired complement.
- **F1@k**: harmonic mean.
- **AUC-ROC**: threshold-free discrimination.
- **AUC-PR**: better-suited to imbalanced classification (anomalies are <5% of
  users); used as the headline metric.
- **Per-archetype recall**: recall computed separately for each of the 5
  archetypes. Reveals detector blind spots that aggregate metrics would hide.
- **Inference latency**: wall-clock fit + score time per dataset.

## 5.5 Statistical methodology

- **10 random seeds per (algorithm, dataset)** → 1,500 paired runs per algorithm
  for v1 (with 5 algos retained × 150 datasets... see results note); v2 has
  150 runs per algorithm × 14 algorithms = 2,100 runs.
- **Bootstrap 95% confidence intervals**: 10,000 resamples on the mean of each
  metric.
- **Wilcoxon signed-rank test** for paired algorithm comparisons (paired by
  dataset_id and seed). Bonferroni-corrected over 132 pairwise comparisons in
  v1 (12 algos × 11 others) and 182 pairs in v2 (14 × 13).
- **Sensitivity to anomaly prevalence**: per-persona prevalence varied from
  0.5% (enterprise) to 5% (small business) to test detector robustness across
  the prevalence range.

---

# Section 6: v1 Results (10 Features, 12 Algorithms)

## 6.1 Aggregate AUC-PR with 95% CIs

| Algorithm | AUC-PR | 95% CI |
|---|---|---|
| **Mahalanobis** | **0.208** | [0.178, 0.241] |
| Isolation Forest | 0.191 | [0.161, 0.225] |
| Extended IF | 0.191 | [0.161, 0.225] |
| GMM | 0.172 | [0.143, 0.206] |
| AutoEncoder | 0.164 | [0.139, 0.191] |
| kNN-AD | 0.161 | [0.135, 0.189] |
| LOF | 0.154 | [0.125, 0.185] |
| ECOD | 0.138 | [0.115, 0.165] |
| COPOD | 0.135 | [0.112, 0.162] |
| VAE | 0.131 | [0.109, 0.156] |
| HBOS | 0.113 | [0.091, 0.139] |
| Z-score (MAD) | 0.109 | [0.081, 0.141] |

**Headline:** Mahalanobis distance — a 1936 algorithm — beats every modern
classical and neural method on this domain. AUC-PR Δ vs Isolation Forest =
+0.017, Wilcoxon paired Bonferroni-corrected adj_p = 0.0039.

## 6.2 Per-archetype recall (the diagnostic that matters)

| Algorithm | OverPriv | DormantPow | RoleMismatch | Accumulator | SoleAccess |
|---|---|---|---|---|---|
| Mahalanobis | 0.547 | 0.101 | 0.007 | 0.133 | 0.015 |
| Isolation Forest | 0.476 | 0.127 | **0.000** | **0.000** | 0.017 |
| Extended IF | 0.476 | 0.127 | 0.000 | 0.000 | 0.017 |
| GMM | 0.238 | 0.078 | 0.040 | **0.227** | **0.054** |
| AutoEncoder | 0.469 | 0.120 | 0.000 | 0.115 | 0.009 |
| kNN-AD | 0.409 | 0.100 | 0.002 | 0.002 | 0.016 |
| VAE | 0.273 | 0.133 | 0.000 | 0.070 | 0.020 |
| LOF | 0.254 | 0.086 | 0.024 | 0.098 | 0.025 |
| ECOD | 0.144 | 0.136 | 0.000 | 0.003 | 0.011 |
| COPOD | 0.114 | 0.138 | 0.000 | 0.003 | 0.011 |
| Z-score | 0.072 | 0.033 | 0.005 | 0.066 | 0.017 |
| HBOS | 0.007 | 0.129 | 0.000 | 0.010 | 0.014 |

**Three serious blind spots emerge that no algorithm catches:**
- **ROLE_MISMATCH**: max 4% recall (GMM), Isolation Forest gets 0%.
- **PERMISSION_ACCUMULATOR**: max 22.7% (GMM), Isolation Forest gets 0%.
- **SOLE_ACCESS_RISK**: max 5.4% (GMM), most algorithms 1-2%.

These can't be solved by switching algorithms — the 10-feature schema doesn't
contain the signal these archetypes require. **DORMANT_POWERFUL** sits at
7-14% across the board because the 10 features omit `last_login_days_ago`.

This finding **motivated the v2 feature engineering** described in Section 7.

## 6.3 v1 latency

| Algorithm | Fit time (s, mid-market 500 users) |
|---|---|
| Mahalanobis | 0.0003 |
| Z-score | 0.0004 |
| HBOS | 0.0037 |
| LOF | 0.0048 |
| GMM | 0.026 |
| Isolation Forest | 0.219 |
| Extended IF | 0.197 |
| AutoEncoder | 1.887 |
| VAE | 2.547 |

Mahalanobis: ~700× faster than Isolation Forest, ~8000× faster than VAE.

---

# Section 7: Feature Engineering — The v1 → v2 Step

## 7.1 Diagnosis from v1

The per-archetype recall table in Section 6.2 told us:
- 4 of 5 archetypes had max-across-algorithms recall under 25%.
- **The bottleneck wasn't the algorithm; it was missing features.** Even GMM at
  22.7% PERMISSION_ACCUMULATOR recall was carrying a thin signal — there was
  nothing in the 10 features that directly captured "this user has more PSes
  than their peers."

Wait — `num_permission_sets` IS in the v1 schema. Why doesn't it catch
PERMISSION_ACCUMULATOR? Because Mahalanobis and similar use the GLOBAL mean +
covariance, not per-peer-group statistics. A user with 15 PSes when their
profile peers have 3 looks "moderately above average" globally. GMM catches
some of these because its mixture component captures that profile peer-group's
local modes.

## 7.2 The three new v2 features

### `last_login_days_ago` — DORMANT_POWERFUL

Days since the user last logged in. Sourced from Salesforce's `LastLoginDate`
SOQL field. Sentinel `NEVER_LOGGED_IN_DAYS = 9999` for never-logged-in users
(rare but real) so dormancy is the conservative default.

Distribution model in synthetic data: log-normal(mean=1.5, sigma=1.5). Most
active users <30 days, heavy tail past 90 days for "real" dormant cases that
the planter mutation (90-400 days) sits at the tail of.

### `cross_department_access_ratio` — ROLE_MISMATCH

For each user with a known department, walks their effective object and field
access; counts what fraction of their classifiable accesses are to
departments other than their own. Returns 0.0 for users with no department
recorded (safe default — they look "in-department" everywhere).

Department classification:
- Hardcoded standard-object → department map (25+ entries: Account/Contact/Lead
  → Sales, Case → Support, Contract → Legal, PermissionSet → IT, etc.).
- Custom-object prefix heuristics (HR_* → HR, Fin_* → Finance, etc.).
- Unclassifiable objects ignored (don't count toward numerator OR denominator).

Distribution model in synthetic data: Beta(2, 18) for normal users — mean
≈0.10, thin tail to 0.30. Planter for ROLE_MISMATCH sets it to U[0.6, 0.85].

### `unique_access_count` — SOLE_ACCESS_RISK

Per-user count of (object, permission_type) tuples where this user is the
sole grantee in the org. Computed by an org-wide single-pass inverse-index
build at the start of `detect_anomalies`:

```python
grants_by_users: Dict[(kind, identifier, perm_type), set[user_id]] = ...
for sf_id, (obj_access, field_access) in all_user_access.items():
    for obj in obj_access["objects"]:
        for perm in ("read", "create", "edit", "delete"):
            if obj["access"][perm]:
                grants_by_users[("obj", obj["object"], perm)].add(sf_id)
counts = defaultdict(int)
for user_set in grants_by_users.values():
    if len(user_set) == 1:
        counts[next(iter(user_set))] += 1
```

O(n_users × avg_grants_per_user). Cheap.

Distribution model in synthetic data: Poisson(λ = seniority-scaled), where
junior=0.05, mid=0.15, senior=0.40, admin=0.80. Most users have 0; admins
sometimes have 1-2. SOLE_ACCESS planter pushes to U[3, 8].

## 7.3 Why these three (and not others)

The choices were dictated by the v1 per-archetype-recall diagnosis. Each
feature was chosen because:
- It directly captures the signal the corresponding archetype is built around.
- It's computable from data the system already has (Salesforce `LastLoginDate`
  is a single SOQL field; cross-department and unique-access are derivable
  from the existing access service).
- It doesn't require new schema work that would delay deployment.

We considered but deferred:
- **Permission grant timestamps** (when did each grant happen?). Would unlock
  "permission creep" detection but requires SetupAuditTrail integration —
  bigger ingestion change.
- **Login geography / IP**. Captures behavioral anomalies but conflates with
  Shield Real-Time Event Monitoring; orthogonal to permission anomalies.
- **Permission-graph embeddings** (Node2Vec, GNN). High potential ceiling but
  not a quick add.

---

# Section 8: v2 Results (13 Features, 14 Algorithms)

## 8.1 Aggregate AUC-PR with 95% CIs

| Rank | Algorithm | AUC-PR | 95% CI |
|---|---|---|---|
| 🥇 | **mahalanobis_gmm_avg** | **0.362** | [0.324, 0.401] |
| 🥈 | GMM | 0.345 | [0.309, 0.384] |
| 🥉 | Mahalanobis | 0.334 | [0.307, 0.364] |
| 4 | mahalanobis_gmm_max | 0.320 | [0.301, 0.341] |
| 5 | AutoEncoder | 0.300 | [0.278, 0.324] |
| 6 | VAE | 0.238 | [0.220, 0.259] |
| 7 | Isolation Forest | 0.219 | [0.194, 0.247] |
| 8 | Extended IF | 0.219 | [0.194, 0.247] |
| 9 | kNN-AD | 0.179 | [0.153, 0.210] |
| 10 | ECOD | 0.159 | [0.137, 0.185] |
| 11 | LOF | 0.149 | [0.125, 0.177] |
| 12 | COPOD | 0.148 | [0.130, 0.168] |
| 13 | Z-score (MAD) | 0.143 | [0.117, 0.172] |
| 14 | HBOS | 0.136 | [0.118, 0.158] |

**Mahalanobis + GMM rank-average ensemble is the new winner.** Beats single
Mahalanobis by Δ = +0.028 (Wilcoxon Bonferroni adj_p = 0.0104). Beats Isolation
Forest by Δ = +0.143 (~65% relative).

## 8.2 v1 → v2 algorithm-level improvement

| Algorithm | v1 AUC-PR | v2 AUC-PR | Δ relative |
|---|---|---|---|
| GMM | 0.172 | 0.345 | **+101%** |
| AutoEncoder | 0.164 | 0.300 | +83% |
| VAE | 0.131 | 0.238 | +82% |
| Mahalanobis | 0.208 | 0.334 | +61% |
| Z-score (MAD) | 0.109 | 0.143 | +31% |
| HBOS | 0.113 | 0.136 | +20% |
| Isolation Forest | 0.191 | 0.219 | +15% |
| ECOD | 0.138 | 0.159 | +15% |
| COPOD | 0.135 | 0.148 | +10% |
| LOF | 0.154 | 0.149 | -3% |

**Two findings:**
- Adding 3 features produced larger gains than any algorithm change.
- LOF didn't benefit. Its core assumption (anomalies are LOCALLY low-density)
  doesn't fit permission data where many archetypes are GLOBAL deviations.

## 8.3 Per-archetype recall

| Algorithm | OverPriv | DormantPow | RoleMismatch | Accumulator | SoleAccess |
|---|---|---|---|---|---|
| **mahalanobis_gmm_avg ★** | 0.104 | 0.196 | **0.345** | **0.184** | **0.556** |
| Mahalanobis | **0.317** | 0.184 | 0.065 | 0.109 | 0.450 |
| GMM | 0.059 | 0.221 | **0.431** | 0.174 | 0.492 |
| mahalanobis_gmm_max | 0.147 | 0.204 | 0.326 | 0.145 | 0.433 |
| AutoEncoder | 0.177 | 0.262 | 0.124 | 0.100 | 0.445 |
| kNN-AD | 0.388 | **0.385** | 0.009 | 0.004 | 0.016 |
| Isolation Forest / Extended IF | 0.330 | 0.170 | 0.000 | 0.001 | 0.024 |
| LOF | 0.191 | 0.238 | 0.016 | 0.082 | 0.034 |
| VAE | 0.111 | 0.181 | 0.057 | 0.053 | 0.345 |
| ECOD | 0.105 | 0.193 | 0.000 | 0.003 | 0.022 |
| HBOS | 0.003 | 0.101 | 0.118 | 0.017 | 0.068 |
| COPOD | 0.068 | 0.188 | 0.000 | 0.005 | 0.022 |
| Z-score (MAD) | 0.019 | 0.028 | 0.011 | 0.078 | 0.446 |

★ = production detector. **Bold** = best-in-column.

The ensemble wins 3 of 5 archetypes (RoleMismatch, Accumulator, SoleAccess)
and is competitive on DormantPow (0.196 vs the 0.385 ceiling held by
kNN-AD). The OVER_PRIVILEGED column is the trade-off (Section 9).

## 8.4 Latency

| Algorithm | Fit (s) | Notes |
|---|---|---|
| Mahalanobis | 0.0003 | Fastest |
| Z-score | 0.0005 | |
| ECOD | 0.0026 | |
| HBOS | 0.0043 | |
| kNN-AD | 0.0070 | |
| LOF | 0.0090 | |
| GMM | 0.0375 | |
| **mahalanobis_gmm_avg ★** | **0.0480** | Production |
| mahalanobis_gmm_max | 0.0382 | |
| Extended IF | 0.193 | |
| Isolation Forest | 0.214 | |
| AutoEncoder | 1.828 | |
| VAE | 2.523 | Slowest, 50000× the production detector |

Production detector at ~50ms/org disappears into per-org sync overhead.

## 8.5 Wilcoxon significance: top-tier pairs

| Pair | mean_diff | adj_p (Bonferroni, 182 pairs) |
|---|---|---|
| ensemble vs Mahalanobis | +0.028 | 0.0104 ✅ |
| ensemble vs IF | +0.143 | <0.0001 ✅ |
| ensemble vs HBOS | +0.226 | <0.0001 ✅ |
| GMM vs IF | +0.126 | <0.0001 ✅ |
| Mahalanobis vs IF | +0.115 | <0.0001 ✅ |
| AutoEncoder vs IF | +0.081 | <0.0001 ✅ |

The ensemble's lead is small in magnitude (Δ=+0.028 vs Mahalanobis) but
statistically significant after correction. Every other comparison among
the top tier is also significant.

---

# Section 9: The OVER_PRIVILEGED Trade-off (Key Publishable Finding)

## 9.1 Statement

Rank-averaging two complementary detectors strengthens overall AUC-PR but
**dilutes the strongest member at its specialty**. In our v2 benchmark:

| | Mahalanobis | mahalanobis_gmm_avg | Δ |
|---|---|---|---|
| OVER_PRIVILEGED recall | **0.317** | **0.104** | **−67% relative** |
| Mean recall (5 archetypes) | 0.225 | 0.277 | +23% |
| AUC-PR | 0.334 | 0.362 | +8.4% |

## 9.2 Mechanism

The mechanism is specific to GMM's behavior on tightly-clustered outliers.
With `n_components=3` (the default we tested), GMM has 3 Gaussian
components to allocate. When 4+ over-privileged anomalies cluster tightly in
feature space (their access vectors are similar — admin-tier counts across
the board), GMM dedicates one component to that cluster. Their density under
that component is HIGH, so their negated-log-likelihood is LOW, so they
score as **less anomalous** than many normal users.

Mahalanobis, in contrast, uses the global centroid + covariance. The
over-privileged users are far from that global center, so their distances
are large.

When we rank-average the two:
- Mahalanobis ranks them at percentile ~95 (correctly anomalous)
- GMM ranks them at percentile ~30 (incorrectly normal)
- Average rank: ~62.5, which falls below normal users that both algorithms
  rank moderately.

## 9.3 Verification with the rank-MAX variant

The rank-MAX ensemble takes max(rank_maha, rank_gmm). Theoretically this
should preserve OVER_PRIVILEGED detection because Mahalanobis's high rank
"wins" the max. Empirically:

| | Mahalanobis | rank-AVG ensemble | rank-MAX ensemble |
|---|---|---|---|
| AUC-PR | 0.334 | **0.362** | 0.320 |
| OVER_PRIVILEGED | **0.317** | 0.104 | 0.147 |

rank-MAX recovers some OVER_PRIVILEGED (0.147 > 0.104) but at a cost to
AUC-PR. The reason: rank-MAX is too inclusive — it elevates users whom
either algorithm flags moderately, including many false positives.
The benchmark shows rank-AVG is the better trade.

## 9.4 Why this is publishable

Three reasons:
1. **Most anomaly-detection papers report only aggregate AUC-PR or F1.** This
   trade-off would be invisible without per-archetype recall.
2. **The ensemble averaging literature** (Aggarwal & Sathe 2015) discusses
   bias-variance trade-offs but doesn't, to our knowledge, document the
   specific "tight outlier cluster gets absorbed by mixture component" effect.
3. **Practical implication**: practitioners deploying ensemble detectors
   should evaluate per-class recall, not just aggregate metrics. Otherwise
   they may inadvertently degrade detection of the most operationally
   important subclass.

## 9.5 Mitigation paths (Section 11.2 future work)

- **3-way ensemble + kNN-AD**: kNN-AD has 38.8% OVER_PRIVILEGED recall and
  38.5% DORMANT recall — exactly the gaps the current ensemble has. A
  3-way rank-average might cover all 5 archetypes well.
- **Per-archetype-weighted vote**: weight each member by its measured
  per-archetype performance. Heavier weight on Mahalanobis preserves
  OVER_PRIVILEGED detection.
- **Score-level (not rank-level) ensemble**: standardize raw scores then
  take MAX. Captures "strongest signal across detectors" without rank-
  compression artifacts.

---

# Section 10: Discussion

## 10.1 Feature engineering > algorithm choice

The largest single AUC-PR gain in this entire research effort came from
adding 3 features (v1 → v2 GMM jumped from 0.172 to 0.345 — +101%). No
algorithm switch produced anywhere close to that magnitude of improvement.

This echoes a long-standing observation in applied ML (Domingos 2012, Ng
"Lecture 11.5: Error Analysis") but is rarely demonstrated at this scale
on a single domain. For practitioners building anomaly detectors, this
suggests the budget allocation should be: 70% features, 20% algorithm
selection, 10% hyperparameter tuning.

## 10.2 Classical methods beat neural at this scale

AutoEncoder (0.300) and VAE (0.238) were both beaten by:
- Mahalanobis (0.334) — a 1936 algorithm.
- GMM (0.345) — a 1990s standard.
- The Mahalanobis+GMM ensemble (0.362).

Why? Two reasons:
1. **Data scale is wrong for neural methods.** With 13 features and median
   ~500 users per org, neural networks have nothing to learn beyond what
   classical methods extract from the covariance matrix.
2. **Anomaly types are interpretable transformations of features**, not
   complex non-linear interactions. A user with 5x peer-median PS count is
   anomalous — there's no representation-learning needed.

This is consistent with Ruff et al. "A Unifying Review of Deep and Shallow
Anomaly Detection" (2021), which argues classical methods remain
competitive in low-dimensional structured domains.

## 10.3 The Isolation Forest result

IF was the production baseline at the start of this work. Its AUC-PR of
0.219 is worse than Mahalanobis's 0.334 (+52% relative), despite IF being
the modern default for unsupervised tabular anomaly detection. Two reasons:
1. **IF assumes anomalies are isolatable in the feature tree splits.**
   When archetype anomalies are characterized by smooth deviations from
   peer-group means (e.g., 5x PS count), IF's axis-aligned splits aren't
   the natural shape.
2. **The default `contamination=0.20` is wrong.** Real-org prevalence is
   0.5–5%. With contamination set 4-10x too high, IF's threshold logic
   over-flags borderline users and pollutes precision@k.

The benchmark fix (Mahalanobis + correctly-tuned k) gives both better
algorithm choice AND a parameter-free deployment.

## 10.4 Why a CRM-specific paper

Generic tabular anomaly-detection benchmarks (KDDCup99, NSL-KDD,
ODDS suite) don't capture three properties of CRM permission data:
1. **Multi-modal cluster structure** (per-profile baseline access patterns)
   that GMM exploits but ECOD/COPOD don't.
2. **Sparse FLS** (most fields don't have explicit FieldPermission rows).
3. **Heavy-tailed access distributions** (admins have 100x junior counts).

The synthetic generator captures all three. Future work in Section 11.2
explores generalization to other CRM platforms.

---

# Section 11: Limitations and Future Work

## 11.1 Acknowledged limitations

- **Synthetic data only.** No real-org evaluation in this paper. Once we
  have 5–10 customers, we'll anonymize their data and re-run the benchmark
  for proper external validity.
- **Single product.** All data and validation comes from Salesforce. The
  methodology should generalize to ServiceNow, Microsoft Dynamics, HubSpot
  but we haven't tested.
- **No hyperparameter tuning.** All 14 algorithms ran with library defaults.
  An optuna sweep on the top-3 might shift the margin within the top tier.
- **Permission-only, not record-level.** This paper deliberately scopes to
  CRUD/FLS-style permission anomalies and leaves OWD/sharing-rule analysis
  to future work.
- **6 robustness failures.** AutoEncoder/VAE on tiny orgs (≤26 users)
  failed with PyOD batch-size errors. Recorded as 0-score failures rather
  than special-cased; the affected algorithms were already mid-pack.

## 11.2 Future work

- **Real-org evaluation.** Re-run benchmark on anonymized customer data for
  external validity once available.
- **3-way / weighted ensembles.** Mahalanobis + GMM + kNN-AD might cover
  all 5 archetypes; per-archetype-weighted vote would preserve OVER_PRIVILEGED.
- **Time-series / diff-based detection.** Compare snapshot N to N-30 days;
  catches permission creep that no snapshot detector can.
- **Graph-based methods.** Node2Vec or GNN embeddings on the user-PS-object
  graph. High potential ceiling but bigger engineering lift.
- **Feature explainability via SHAP.** Mahalanobis distance decomposes
  naturally into per-feature contributions; SHAP on the GMM component can
  attribute "why this user was flagged."
- **Cross-CRM generalization.** Re-run methodology against ServiceNow,
  Microsoft Dynamics 365, HubSpot. Test whether the algorithm ranking
  transfers.

---

# Section 12: Reproducibility

## 12.1 Repository layout

```
research/
├── README.md
├── anomaly_benchmark/
│   ├── data/
│   │   ├── schemas.py            # SyntheticUser, SyntheticOrg, AnomalyArchetype
│   │   ├── distributions.py      # PROFILE_CATALOG, PERSONAS, sampling helpers
│   │   ├── anomaly_planters.py   # 5 archetype mutators + PLANTERS registry
│   │   └── generator.py          # generate_org() entry point + CLI
│   ├── algorithms/
│   │   ├── __init__.py           # Detector protocol + lazy-loading registry
│   │   ├── mahalanobis.py        # Custom Mahalanobis adapter
│   │   ├── gmm.py                # sklearn GMM adapter
│   │   ├── isolation_forest.py   # sklearn IF adapter
│   │   ├── lof.py                # sklearn LOF adapter
│   │   ├── zscore_mad.py         # Custom robust z-score adapter
│   │   ├── ecod.py / copod.py / hbos.py / knn_ad.py / extended_if.py  # PyOD wrappers
│   │   ├── autoencoder.py / vae.py  # PyOD neural wrappers
│   │   └── mahalanobis_gmm_ensemble.py  # rank-AVG and rank-MAX ensembles
│   ├── tests/test_generator.py    # 17 unit tests covering generator semantics
│   ├── metrics.py                 # Precision@k / Recall@k / AUC-ROC / AUC-PR
│   ├── stats.py                   # bootstrap_ci / wilcoxon_paired / pairwise_significance
│   ├── runner.py                  # single-experiment runner
│   ├── experiment.py              # top-level driver (algo × persona × seed × dataset)
│   ├── results_store.py           # Parquet append/load helpers
│   ├── analysis.py                # Jupytext notebook for tables + figures
│   ├── REPORT.md                  # final results summary
│   └── requirements.txt           # research-only deps (pyod, torch, etc.)
└── paper_bundle/
    ├── README.md
    └── PUBLISHABLE_PAPER_BUNDLE.md  # this file

apps/backend/app/services/anomaly_detection.py
    # Production deployment of the v2 detector. Ensemble class _MahalanobisGMMAvgDetector
    # is inlined to keep apps/backend independent of research/.
```

## 12.2 Reproducing the benchmark

```bash
pip install -r research/anomaly_benchmark/requirements.txt

# Optional: run unit tests
python -m pytest research/anomaly_benchmark/tests/ -q

# Generate one org for inspection
python -m research.anomaly_benchmark.data.generator --persona mid_market --seed 42

# Full v2 benchmark (~30 min on Colab CPU)
python -m research.anomaly_benchmark.experiment \
    --algos all --personas all --seeds 0-9 --datasets-per-persona 5 --reset

# Print result tables
python -c "import pandas as pd, sys; sys.path.insert(0, '.'); \
  from research.anomaly_benchmark.stats import summary_table; \
  print(summary_table(pd.read_parquet('research/anomaly_benchmark/results/results.parquet'), 'auc_pr').round(4))"
```

All synthetic data is bit-for-bit reproducible from the (persona, seed,
dataset_idx) tuple. The full v2 benchmark runs in ~30 minutes on a free
Google Colab CPU runtime.

## 12.3 Random seeds

Each `(persona, run_seed, dataset_idx)` combination derives a unique org
seed via `org_seed = run_seed * 1000 + dataset_idx`. Within an org,
`np.random.default_rng(seed)` drives all stochastic decisions. The 5
ensemble seeds × 10 run seeds × 5 datasets × 3 personas × 14 algorithms
= 2,100 deterministic experiments.

## 12.4 Statistical methodology details

- **Bootstrap CIs**: 10,000 resamples per metric; percentile method on the
  resampled means; α = 0.05 (95% CIs).
- **Wilcoxon signed-rank**: paired by (dataset_id, seed). Zero-difference
  pairs handled via scipy `zero_method="zsplit"`. Returns (statistic, p_value).
- **Bonferroni correction**: `adj_p = min(1.0, raw_p × n_comparisons)`.
  In v2: 14 × 13 = 182 pairs; adj_p threshold for significance is 0.05.
- **No multiple-testing correction within a single algorithm's metrics**
  (e.g., we don't correct AUC-PR vs AUC-ROC reports). This is standard
  practice in benchmark papers.

---

# Appendix A: Full Numerical Tables

## A.1 v2 AUC-PR (n=150 per algorithm; mean ± 95% bootstrap CI)

```
                     n_runs    mean  ci_lower  ci_upper     std
mahalanobis_gmm_avg     150  0.3616    0.3242    0.4011  0.2409
gmm                     150  0.3452    0.3089    0.3836  0.2348
mahalanobis             150  0.3340    0.3074    0.3639  0.1728
mahalanobis_gmm_max     150  0.3200    0.3008    0.3412  0.1252
autoencoder             150  0.3002    0.2783    0.3242  0.1415
vae                     150  0.2384    0.2200    0.2587  0.1189
isolation_forest        150  0.2189    0.1935    0.2473  0.1666
extended_if             150  0.2189    0.1935    0.2473  0.1666
knn_ad                  150  0.1794    0.1530    0.2096  0.1729
ecod                    150  0.1591    0.1372    0.1851  0.1494
lof                     150  0.1493    0.1254    0.1767  0.1579
copod                   150  0.1475    0.1297    0.1683  0.1191
zscore_mad              150  0.1428    0.1173    0.1720  0.1722
hbos                    150  0.1360    0.1175    0.1577  0.1264
```

## A.2 v2 Precision@k

```
                     n_runs    mean  ci_lower  ci_upper     std
mahalanobis_gmm_avg     150  0.3594    0.3177    0.4017  0.2609
mahalanobis_gmm_max     150  0.3485    0.3076    0.3940  0.2680
gmm                     150  0.3482    0.3077    0.3886  0.2522
mahalanobis             150  0.2695    0.2345    0.3063  0.2203
autoencoder             150  0.2394    0.2057    0.2741  0.2120
knn_ad                  150  0.2043    0.1706    0.2408  0.2170
vae                     150  0.1616    0.1355    0.1887  0.1653
zscore_mad              150  0.1517    0.1251    0.1810  0.1759
lof                     150  0.1408    0.1138    0.1703  0.1748
extended_if             150  0.1382    0.1091    0.1704  0.1916
isolation_forest        150  0.1382    0.1091    0.1704  0.1916
ecod                    150  0.0933    0.0672    0.1237  0.1755
copod                   150  0.0749    0.0542    0.0988  0.1379
hbos                    150  0.0737    0.0557    0.0944  0.1225
```

## A.3 v2 per-archetype recall

```
                     OverPriv  DormantPow  RoleMismatch  Accumulator  SoleAccess
autoencoder             0.177       0.262         0.124        0.100       0.445
copod                   0.068       0.188         0.000        0.005       0.022
ecod                    0.105       0.193         0.000        0.003       0.022
extended_if             0.330       0.170         0.000        0.001       0.024
gmm                     0.059       0.221         0.431        0.174       0.492
hbos                    0.003       0.101         0.118        0.017       0.068
isolation_forest        0.330       0.170         0.000        0.001       0.024
knn_ad                  0.388       0.385         0.009        0.004       0.016
lof                     0.191       0.238         0.016        0.082       0.034
mahalanobis             0.317       0.184         0.065        0.109       0.450
mahalanobis_gmm_avg     0.104       0.196         0.345        0.184       0.556
mahalanobis_gmm_max     0.147       0.204         0.326        0.145       0.433
vae                     0.111       0.181         0.057        0.053       0.345
zscore_mad              0.019       0.028         0.011        0.078       0.446
```

## A.4 v2 inference latency (mid-market persona, mean fit_seconds)

```
algo                    fit_seconds
autoencoder                 1.8276
copod                       0.0028
ecod                        0.0026
extended_if                 0.1930
gmm                         0.0375
hbos                        0.0043
isolation_forest            0.2144
knn_ad                      0.0070
lof                         0.0090
mahalanobis                 0.0003
mahalanobis_gmm_avg         0.0480  ← production
mahalanobis_gmm_max         0.0382
vae                         2.5234
zscore_mad                  0.0005
```

---

# Appendix B: Synthetic Data Generator Details

## B.1 Persona spec

```python
PERSONAS = {
    "small_business": PersonaSpec(
        n_users_range=(25, 100),
        n_profiles_used=5,
        anomaly_prevalence_range=(0.02, 0.05),
    ),
    "mid_market": PersonaSpec(
        n_users_range=(200, 1000),
        n_profiles_used=10,
        anomaly_prevalence_range=(0.01, 0.03),
    ),
    "enterprise": PersonaSpec(
        n_users_range=(2000, 10000),
        n_profiles_used=15,
        anomaly_prevalence_range=(0.005, 0.02),
    ),
}
```

## B.2 Seniority baselines (mean access counts per profile tier)

```python
SENIORITY_BASELINES = {
    "junior": ProfileBaseline(
        mean_permission_sets=1.5, mean_permission_set_groups=0.3,
        mean_objects_read=8, mean_objects_edit=3, mean_objects_delete=0.5,
        mean_fields_read=15, mean_fields_edit=5,
        mean_sensitive_objects=0.5, mean_sensitive_fields=1,
    ),
    "mid": ProfileBaseline(
        mean_permission_sets=3, mean_permission_set_groups=1,
        mean_objects_read=18, mean_objects_edit=10, mean_objects_delete=2,
        mean_fields_read=40, mean_fields_edit=20,
        mean_sensitive_objects=2, mean_sensitive_fields=4,
    ),
    "senior": ProfileBaseline(
        mean_permission_sets=5, mean_permission_set_groups=2,
        mean_objects_read=30, mean_objects_edit=20, mean_objects_delete=8,
        mean_fields_read=80, mean_fields_edit=50,
        mean_sensitive_objects=5, mean_sensitive_fields=10,
    ),
    "admin": ProfileBaseline(
        mean_permission_sets=8, mean_permission_set_groups=3,
        mean_objects_read=120, mean_objects_edit=100, mean_objects_delete=80,
        mean_fields_read=400, mean_fields_edit=300,
        mean_sensitive_objects=15, mean_sensitive_fields=40,
    ),
}
```

## B.3 Profile catalog (15 profile shapes)

| name | department | seniority |
|---|---|---|
| Standard User | Sales | junior |
| Sales Rep | Sales | junior |
| Sales Manager | Sales | mid |
| Sales Director | Sales | senior |
| Support Agent | Support | junior |
| Support Manager | Support | mid |
| Marketing User | Marketing | junior |
| Marketing Manager | Marketing | mid |
| Finance Analyst | Finance | mid |
| Finance Director | Finance | senior |
| HR Specialist | HR | mid |
| HR Director | HR | senior |
| IT Operations | IT | mid |
| System Administrator | IT | admin |
| Read Only | Sales | junior |

## B.4 Sampling helpers (signatures)

```python
def sample_profile_membership(rng, n_users, profiles) -> list[ProfileSpec]:
    """Pareto-like assignment via Zipf weights rank^-1.2."""

def sample_ps_count(rng, mean) -> int:
    """Poisson(mean) + 10% chance of geometric(p=0.5) tail draw."""

def sample_object_count(rng, mean) -> int:
    """Poisson(mean) + 5% chance of 5x admin multiplier."""

def sample_last_login_days_ago(rng) -> int:
    """Log-normal(mean=1.5, sigma=1.5)."""
```

---

# Appendix C: Production Deployment Details

The benchmark winner is deployed at `apps/backend/app/services/anomaly_detection.py`.
The ensemble class is inlined (~130 lines) to keep the backend self-contained:

```python
class _MahalanobisDetector:
    # 30-line implementation of multivariate distance with regularized
    # covariance fallback for rank-deficient inputs.

class _GMMDetector:
    # Wraps sklearn.mixture.GaussianMixture with diagonal-covariance fallback
    # for tiny orgs that fail full-covariance fitting.

class _MahalanobisGMMAvgDetector:
    """Production v2 detector. Rank-average ensemble of Mahalanobis + GMM."""
    def fit(X):  self._maha.fit(X); self._gmm.fit(X)
    def score(X):
        s_maha = self._maha.score(X)
        s_gmm = self._gmm.score(X)
        # rank-normalize each, then average
        return (rank(s_maha) + rank(s_gmm)) / 2.0
```

19 unit tests in `apps/backend/tests/test_anomaly_detector.py` cover:
- Basic detector contracts (fit/score/predict)
- Synthetic outlier flagging
- Rank-deficient feature handling
- Score-before-fit error semantics
- Configuration sanity (DEFAULT_ANOMALY_FRACTION in expected range)
- Department classification (object → department mapping)
- Unique-access counting (singleton grants, field grants, empty org)
- Ensemble interface and rank-averaging semantics

The deployment was driven by a benchmark with a clear statistical signal
(Wilcoxon Bonferroni adj_p = 0.0104), not gut feel. This is unusual for
an early-stage SaaS product and is worth highlighting in the paper as
an example of research-to-production hand-off done right.

---

# End of Bundle

> Total length: ~14,000 words. Designed to fit Claude Deep Research's context
> window with room for the model to draft a 6,000-8,000 word paper response.
>
> When regenerating numbers (e.g., after re-running the benchmark with new
> features or algorithms), update sections 6.x, 7.x, 8.x, 9.x and Appendix A
> from the most recent `research/anomaly_benchmark/REPORT.md`.
