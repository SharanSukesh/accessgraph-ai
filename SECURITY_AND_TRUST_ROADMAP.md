# Newton: Security, Trust and Product Roadmap

Newton is our in-house tool for client Salesforce engagements. Clients let
us connect to their production orgs, so **client safety, data protection
and legal clarity come before features**. This file is the single list of
what is done, what must happen before the next client engagement, and
what comes after. Update it as items land.

Client-facing setup guide: [docs/CLIENT_ONBOARDING_SECURITY.md](docs/CLIENT_ONBOARDING_SECURITY.md)

## Positioning (guides every product decision)

Newton is built for **consultants**, not for a client's security team. One
read-only assessment covers **access, cost and health**, and ends in a
**client-ready, priced roadmap** that becomes paid work, plus **proof
afterwards** that the work succeeded. Native Salesforce tools, Security
Center, Config Workbook, Varonis and Arovy each cover a slice for a
different buyer. When choosing between items, prefer what strengthens
that consulting workflow: assess → prioritise and price → deliver → prove.

## Principles

1. **Least privilege everywhere.** Read-only integration user, minimal
   OAuth scopes, per-org access for our own staff.
2. **Nothing changes in a client org without explicit, recorded consent.**
3. **Hold as little client data as possible, for as short as possible,**
   and delete it provably when the engagement ends.
4. **Every action is attributable** to a named person and audit-logged.
5. **Our legal pages describe what the code actually does.** If they
   diverge, the code or the page is a bug.
6. **Never invent numbers.** A figure Newton can't measure is shown as
   unknown, sampled or estimated, with the reason.

## Owner: Sharan

| Item | Notes |
|------|-------|
| Make the repository private | |
| Rotate the encryption key if needed | See P0 item 7. |
| Product name | |
| Role export deploy-order test (35b) | In Sharan's developer org, before 35b's readme states a deploy order: can a parent and child role go in one deploy, and does parentRole take the parent's API name? This is a write to a Salesforce org, so Newton and Claude never run it. |
| Move Railway build settings out of railway.json into service settings before 1 Dec 2026 | Railway's docs call config-as-code files deprecated and say existing files work for legacy services until 2026-12-01. The root railway.json still names NIXPACKS, which Railway no longer lists as a builder. Proposal PR #32 was closed in favour of this. |

## Done (October 2026)

- Every API route requires a signed-in Newton user. Role, active status
  and org grants are re-checked against the database on each request.
  A test fails the build if any route is reachable anonymously.
- Multi-org access for consultants: admins see all client orgs; analysts,
  viewers and auditors only orgs explicitly granted. Viewers and auditors
  are read-only.
- Salesforce connection is an action by a signed-in user (OAuth with PKCE
  and a validated state), never a login. The connecting user is granted
  the org.
- OAuth scopes reduced from `full` to `api refresh_token`
  (`SALESFORCE_OAUTH_SCOPES`).
- Connection posture: Newton records which Salesforce user authorised the
  connection and flags elevated permissions or a non-integration licence.
- Write-back to Salesforce is off per org until an admin enables it on the
  Privacy & Data page, recording where the client approved it; who/when/why
  is audit-logged. Write-back routes also require an admin.
- Client org list shows who each org is connected as, with "Integration
  user" or "Elevated connection" badges and a "Write-back on" badge.
- Salesforce managed package authenticates with a per-org key.
- Sign-in rate limiting; debug endpoints removed; API docs off in
  production; startup refuses to run without `JWT_SECRET_KEY`.
- Erasure deletes every org-scoped table and revokes the OAuth grant.
  A daily job enforces retention per data class (test-enforced).
- Business record IDs stored only as keyed hashes; data-quality duplicate
  checks never return field values.
- Legal pages (privacy, security, terms, DPA) rewritten to match the code.
- Per-client privacy levels: Full, Masked users (aliases instead of
  names; Salesforce IDs kept for client-side lookup; no login location or
  audit text), Metadata only (no users, logins or audit trail; aggregate
  record statistics opt-in). Tightening a level purges or masks stored
  data immediately.
- Client report: two-logo letterhead (client + firm), severity-ordered
  findings, charts and cross-module insights.
- Demo hardening (PRs #2-#5): permission set group muting in effective
  access, explain and the graph; admin-only demo orgs from committed
  fixtures (synthetic 400-user "Lumenvale"), never connected to
  Salesforce and labelled on screen and in every export; anomaly flagging
  at exactly the top 2% with typed, ranked reasons; current list prices;
  Excel export; "Why?" access paths; access-graph redesign; analysis
  re-runs replace results instead of duplicating them.

## P0: before the next client engagement

| # | Item | Why |
|---|------|-----|
| 1 | Add "Manage user data via APIs (api)" to the Connected App's selected scopes and remove "Full access". | Newton now requests `api refresh_token`; Salesforce rejects scopes the app doesn't allow. |
| 2 | **MFA (TOTP) for all Newton accounts**, required for admins. | A stolen consultant password currently opens every granted client org. |
| 3 | Password reset flow, "sign out everywhere", and session revocation on password change or role change (token version on OrgUser). | Today sessions live 7 days and can't be revoked individually. |
| 4 | Shorter sessions: 12-hour absolute, 2-hour idle for admins. | Reduces the impact of a stolen session. |
| 5 | Deployable "Newton Read Only" permission set (metadata plus a one-command `sf` deploy) matching the onboarding guide. | Removes manual setup errors at the client. |
| 6 | Verify against a real org which features work with the read-only user (LoginHistory, View All Data trade-offs) and record it in the guide. | Set accurate expectations with clients. |
| 7 | Confirm `DATABASE_ENCRYPTION_KEY` is set in production and write a key-rotation runbook. Confirm production does not use the key that previously appeared in ENCRYPTION_SETUP.md; rotate if it does. **Owner: Sharan.** | Tokens must be encrypted at rest. |
| 8 | Staging environment (Railway preview or a second service) and a rule that `main` deploys only after staging passes. | A push to `main` currently goes straight to production. |

## P1: next quarter

**Engagement lifecycle**
- Engagement record per client org: start date, planned end date, client
  contacts, SOW reference.
- "Close engagement": revoke the OAuth grant, schedule erasure (e.g. after
  30 days), and generate a **deletion certificate** PDF (what was held,
  when it was deleted, by whom).
- Reminders for engagements past their end date that are still connected.

**Transparency for the client**
- Client-visible activity log: every Newton action on their org (syncs,
  exports, write-backs, who viewed which pages), exportable as CSV/PDF.
- Optional client viewer accounts (read-only, their org only) so the
  client can see exactly what we see.

**Data minimisation**
- Field-level encryption for stored personal data (user email, name,
  Setup Audit Trail text), not just OAuth tokens.
- Configurable per engagement: skip login history; skip Setup Audit
  Trail text (store counts only).
- Remove Neo4j and Redis if they stay unused (fewer services holding data,
  fewer subprocessors to disclose).

**Platform security**
- Dependency and secret scanning in CI (pip-audit, npm audit, gitleaks)
  plus Dependabot; fail the build on high-severity issues.
- Content-Security-Policy and security headers on the Next.js frontend.
- Security alerts (email or Slack) for repeated failed logins, new admin
  accounts, write-back enablement, erasures and package-key rotation.
- Global API rate limiting, not just sign-in.
- Backups: document what Railway keeps and for how long, test a restore,
  and state RPO/RTO in the DPA.
- Salesforce package: store the key in a protected custom setting or a
  Named Credential, and ship a new package version.

## P2: legal and process

- Standard **DPA** and an engagement-letter clause covering Newton (we are
  the processor; the client is the controller). Have counsel review the
  legal pages, especially contact details, entity names, backups, and the
  breach-notice and response-time commitments.
- Published subprocessor list (Railway, frontend host, Resend) with change
  notice.
- Incident response runbook: who does what, client notification within
  the DPA window, and a template notice.
- Quarterly review of Newton staff accounts and org grants (our own
  access review, using Newton's audit log).
- External penetration test before using Newton with regulated clients
  (healthcare, financial services).
- Optional EU data residency (separate deployment) for EU clients.
- Internal data-handling policy for consultants: no exports to personal
  devices, PDFs shared only through the client's channel.

---

# Product roadmap

## How to read an item

Each item lists:

- **Problem**: what it solves for the consultant or the client.
- **Approach**: how we'd build it.
- **Salesforce sources**: what we read. A ✓ means confirmed against
  current Salesforce documentation (see [Sources](#salesforce-sources-checked));
  **UNVERIFIED** means we couldn't confirm it from the docs and must test
  it in a sandbox before relying on it.
- **New permissions**: additions to the "Newton Read Only" permission set.
  Today that set has API Enabled, View Setup and Configuration, View All
  Users, View All Profiles, and (optionally) View All Data.
- **Privacy and demo**: behaviour at Full, Masked and Metadata only, and on
  demo orgs (which never call Salesforce; they read the fixture).
- **Fixture**: what the synthetic Lumenvale fixture needs so the feature
  can be demoed.
- **Depends on**, then **Effort**. Effort is in engineer-days:
  **S** = 1-2, **M** = 3-5, **L** = 6-10, **XL** = more than 10. These
  are estimates, not commitments.

Item numbers match the lead's list (A1-A5) and the agreed backlog
(B6 onwards). Merged items say so.

## Progress log

Newest last. For picking up where a session left off; each item's own
section has the detail.

- **17 Oct:** phase A merged to main (PRs #6-#19, fe5d81f). Sharan checked
  Lumenvale on production: Health 41 Concerning, 18 findings, $183,180.
- **17 Oct:** #20 (Lumenvale role hierarchy), #21 (roadmap item 35) and #22
  (empty-group fix) merged to main (c0ebf96). Main's CI passed (Backend,
  Frontend, Shared Packages) and both Railway deployments succeeded
  (api.accessgraphai.com and app.accessgraphai.com).
- **17 Oct:** dates in this roadmap corrected to their commit dates (all 17
  Oct); Sharan's developer-org check dated 17 Oct.
- **17-18 Oct, phase B (not merged; Sharan merges):** item 5 API usage
  (#23); item 3 image pack (#24, stacked on #23); 35a role view (#25);
  35b role design with its Lumenvale data (#26, stacked on #25); item 1
  phase 1, pages and automation (#28). Suggested merge order: #27 (this
  log), #23, #24, #25, #26, #28. #26 adds a migration (a9c3e5f7b2d4); #28
  stores its data with the sync job, so there's only one new alembic head.
- **18 Oct:** every phase B PR keeps Lumenvale at Health 41, 18 findings,
  $183,180 and License Fit $116,220 (tested in #26 and #28).
- **18 Oct, follow-ups (not merged):** #29 makes failing tests fail CI
  (backend was continue-on-error; frontend unit tests weren't run). #30
  applies the privacy level to demo syncs. #31 names the sharing rules that
  reach a changed role (stacked on #26). #28 gained profile API-name
  matching, the most-specific-first page order (UNVERIFIED) and the profile
  and permission set views. #32 (Railway builder proposal) was closed:
  Sharan sets the builders in Railway's service settings (Owner: Sharan).
- **18 Oct:** #41 adds a page per permission set group (stacked on #28).
  Lint counts on main, for deciding what to make blocking: Ruff 126 issues
  (51 auto-fixable), mypy 179 errors in 36 files, frontend lint 6 warnings
  and no errors.
- **Merge order:** #29, #27, #30, #23, #24, #25, #26, #31, #28, #41.
  Simulated clean; the combined tree passes all tests with one alembic head.
- **18 Oct, merged:** Sharan approved merging that list, in that order, for
  this round only. Each PR was rebased onto main and merged after its CI
  passed: #29 (bd00a5c), #27 (17da1ae), #30 (b5eaf99), #23 (8bdf1ac), #24
  (310e645), #25 (5f20a29), #26 (2699990), #31 (67e298b), #28 (d3ebe4c),
  #41 (92c2a16). After each merge, main's CI passed (Backend, Frontend,
  Shared Packages) and both Railway deployments succeeded. #26's API
  deployment succeeded and /health answered before #31 was merged; the
  server starts only after `alembic upgrade head` succeeds, so its
  migration ran (the deploy log itself wasn't read).
  Exception: #24's rebased head merged without its own PR CI run (the
  branch was pushed before the PR was retargeted to main); main's CI on
  310e645 passed. Main is at 92c2a16; api.accessgraphai.com/health is ok.
- **18 Oct:** lint PR (not merged): Ruff and frontend lint become blocking,
  and mypy fails CI only on errors that aren't in mypy-baseline.txt (208
  errors). Before it, main had Ruff 134 issues, mypy 209 errors in 44
  files, frontend lint 6 warnings.
- **18 Oct, review round (not merged; one PR per item, each from main):**
  #43 image pack (no logos or demo label on images; Summary slide); #44
  API usage card and page; #45 Pages & automation tab; #46 graph picker
  tabs for layouts, record pages, Apex classes and flows; #47 People view
  at 500 to 600 users (collapsed tree, focus, filters, tree table, flags;
  tested on a synthetic 600-user org, tests/people_scale.py); #48 role
  design Graph mode. Every one keeps Lumenvale at Health 41, 18 findings,
  $183,180 and License Fit $116,220. Found while building: Lumenvale has 4
  manager loops (11 people), now flagged "Manager loop" in #47; the
  requested "Apex and flows don't count against the API limit" line isn't
  supported by Salesforce's docs, so #44 doesn't show it.
- **Merge notes:** all seven open PRs (#42-#48) merge together and pass
  (backend 443 passed, frontend 83 tests, lint with no warnings, Ruff
  clean, no new mypy errors). The one conflict: #47 with #42 in the People
  page; take #47's version (it no longer has the code #42 changed).
- **18-19 Oct, merged:** after review fixes (#47: "No manager" leaves out
  people with direct reports; #43: no footer on images unless the org name
  is asked for), Sharan approved merging, for that round only: #42
  (d38a18a), #49 (f74099b), #43 (06ae85c), #44 (37dcf93), #45 (2c8bfca),
  #46 (5eae897), #47 (b5a62a0), #48 (02d8e55). Before #42, a throwaway
  draft (#50, closed) proved the lint gate: a Ruff violation, a new mypy
  error and a lint warning turned Backend and Frontend red while tests and
  the build still ran. #44's rebase was resolved to a tree identical to a
  plain merge of the reviewed PR; #47 took its own People page, as
  agreed. After each merge main's CI passed and both Railway deployments
  succeeded; no PR added a migration. Main is at 02d8e55.
- **19 Oct (not merged):** Salesforce doesn't allow manager loops (the
  Manager field prevents "selecting a user that directly or indirectly
  reports to themselves", Object Reference v68), so the 4 loops are taken
  out of the Lumenvale fixture; the runbook numbers hold. The tree keeps
  its loop handling as a safeguard and shows "Manager loop" only when one
  is found.
- **Next:** Sharan re-syncs Lumenvale on production and tests. Then item 7
  with 35c, then phase C. Item 1 phase 2 stays a plan.

## Build order

Revised 17 October 2026 after review, and again on 17 October to put the
Salesforce lead's requests first. Decisions taken are recorded in the items
below; progress is in the [Progress log](#progress-log).

| Phase | Items | Notes |
|-------|-------|-------|
| **A. Quick wins** | 23 (with base risk), 24, 25, 4, 2, 31, 32, 33, 34, and a PR for `fix-compare-search` | **Merged to main 17 Oct** (PRs #6-#19; see below). 26 and 27 are done (PRs #4, #5). |
| **B. The Salesforce lead's requests** | 5, then 3, then 35a, 35b, then 1 (phase 1) | Built ahead of phase C at Sharan's request (17 Oct). The image pack needs the critical objects, coverage and API usage visuals, so it follows 5. 35a and 35b need no foundations; 35b reuses 3's ZIP approach. 1 (phase 1) reads record types itself, so it doesn't wait for 8 (see the item). |
| **B2. Record access and the full role impact** | 7, with 35c | 7 is opt-in per org with per-object View All on Account, Opportunity, Case, Contact and Lead (no View All Data); its opt-in screen also holds Data Quality's object choice (2). 35c (Case, Contact, Lead and account-owner settings in the role impact preview) needs 7's per-object record data and coverage labels, so they ship together. |
| **C. Foundations** | API v68 (first), 8, 21, 20 + 10, 30 | The move from API v62 to v68 comes first: later items read through it. 21 before 20 (evidence points at a snapshot). 10 merges into 20. 30 (risk methodology) is decided alongside 20. |
| **C2. Priced roadmap** | P1 priced roadmap builder (with P2 playbooks) | Moved up from F: central to the positioning and depends on the evidence model (20). |
| **D. Access depth** | 6 | 6 is the first user of the comparison engine. 1 (phase 1), 7 and 35c moved up to B and B2 on 17 Oct. |
| **E. Config Workbook parity** | 9 (v1) first; then 11, 12, 13 in an order to be set | Order of 11, 12 and 13 held until Mike confirms which Config Workbook features he uses. |
| **F. Differentiators** | 15, 16, 17, 18 | |
| **G. Depth and scale** | 1 (phase 2), 19 (v1: downloadable ZIP), 22, 9 (v2), 28, 29 | The GitHub piece of 19 moved to the later backlog. |

## Phase A: quick wins

**Status (17 Oct): merged to main** in this order (PRs #6-#19), each
rebased onto main with CI passing before it merged. The order (later branches build on earlier ones; all merged together
pass 356 backend and 48 frontend tests):

| Order | PR | Branch | Items |
|---|---|---|---|
| 1 | #7 | `feat/anomaly-rank-display` | 23 (rank, reason, base risk; Priority Actions on base risk) |
| 2 | #8 | `feat/anomaly-methodology` | 34 (contains #7); figures from the IEEE TPS-ISA 2026 camera-ready, Fig. 4 |
| 3 | #9 | `feat/equity-no-disparity` | 24 |
| 4 | #10 | `chore/demo-fixture-parts` | per-feature fixture files (needed by 25, 31, 4, 2) |
| 5 | #11 | `feat/org-level-skus` | 25 |
| 6 | #12 | `fix/owned-record-counts` | 32 |
| 7 | #13 | `feat/record-access-coverage` | 31 |
| 8 | #14 | `feat/code-coverage` | 4 |
| 9 | #15 | `feat/critical-objects` | 2 (contains #13 and #14) |
| 10 | #16 | `fix/info-badge-dark` | 33, plus distinct High and Medium badge colours |
| 11 | #17 | `feat/health-score-cap` | each family of findings can lower the health score by at most 20 (decided 17 Oct) |
| 12 | #18 | `docs/phase-a-runbook` | runbook numbers for all of phase A; on conflict take this version |
| 13 | this roadmap | `roadmap-v2` | this file only |

Expected conflicts are small: `DEMO_NOTES.md` backlog lines (each branch
removes the item it fixed), two tests appended at the same place in
`test_report_html.py`, two adjacent demo lines in `orchestrator.py`, and
two adjacent imports on the Health Report page (keep both sides in each).

**Health score (decided 17 Oct):** findings are grouped into families
(licensing, configuration, automation, code coverage, access and sharing,
platform limits, data quality, predictive), and no family can lower the
score by more than 20 points. Lumenvale: 35 to 60 on main alone; 41
(Concerning) with all of phase A, where it was 16 uncapped. The planted
coverage and data problems needed no tuning. Revisit the weights and the
cap with item 30.

### 23. Anomaly severity for access anomalies: replaced by rank, reason and risk
- **Problem:** every top-2% user scored 0.986+ on the normalised scale, so all showed as "critical". Severity implies impact, which is the risk score's job; rank bands would label someone "medium" just for being 7th of 8.
- **Decision (17 Oct):** drop severity for **access** anomalies. Each one shows **rank, strongest reason and the user's risk level** side by side, e.g. "#3 of 400 · Permission accumulation · High risk", and lists sort by rank. The Dashboard tile is renamed **"Flagged anomalies"**. Session anomalies keep their rule-based severity, because there it describes the rule that fired.
- **Approach:** the API stops returning a severity for access anomalies (stored value kept for old rows, not shown). The Anomalies page, Dashboard, user page, CSV, Excel and PDF show rank · reason · risk level. Severity filters and counters apply to session anomalies only. The risk score's "peer deviation" factor no longer reads the anomaly severity: it uses "flagged or not" and the rank.
- **Salesforce sources:** none (computed).
- **New permissions:** none.
- **Privacy and demo:** unchanged; risk level is shown wherever the user is shown.
- **Fixture:** none.
- **Follow-up decision (17 Oct): base risk.** Being flagged feeds the risk score (the peer-deviation factor), so the risk level shown next to a rank partly repeated the flag. On Lumenvale all 8 flagged users showed High; without the flag 4 are High and 4 Medium. Wherever a risk level sits next to an anomaly rank, Newton now shows **"Base risk"**: the same noisy-OR score without the peer-deviation factor, i.e. the score the user would have if not flagged (tooltip: "Risk score calculated without the anomaly flag"). Base risk is also used by the "On high or critical-risk users" card and the compliance control, so neither counts a user just for being flagged. The risk formula itself is unchanged (see 30).
- **Priority Actions (17 Oct):** the two anomaly-driven rules (permission set consolidation, broad edit access) no longer read the detector's stored band. Each rule takes its higher severity when the user's base risk is High or Critical, or Medium with a rank in the top half of the flagged users; otherwise its lower severity.
- **Depends on:** nothing. **Effort: S-M** (touches several screens and exports).

### 24. Equity adds Priority Actions when there's no disparity
- **Problem:** on Lumenvale (equity index 1.0, disparity 0), running Equity added 20 Priority Actions. That's noise in a client deliverable.
- **Approach:** generate equity recommendations only when disparity exceeds a threshold (default above 0, configurable). Otherwise report "no disparity to close" and add nothing.
- **Salesforce sources:** none (computed from synced data).
- **New permissions:** none.
- **Privacy and demo:** Equity needs user records (off at Metadata only); it's already greyed out on demo orgs.
- **Fixture:** none.
- **Depends on:** nothing. **Effort: S.**

### 25. Pardot and Marketing Cloud priced per org, not per seat
- **Problem:** the price catalog stores them as per-seat monthly prices ($1,250 and $400), so any seat-based savings line overstates savings.
- **Approach:** mark them as org-level SKUs in the catalog. Seat findings skip them; if they are unused, a separate "org-level subscription" finding is created only from Price Book entries the consultant has filled in.
- **Salesforce sources:** UserLicense and PermissionSetLicense (already synced).
- **New permissions:** none.
- **Privacy and demo:** unchanged.
- **Fixture:** add a Pardot / Account Engagement licence row to `demo_live` so the org-level path shows.
- **Depends on:** nothing. **Effort: S.**

### 4. Org code coverage
- **Problem:** consultants need the deployment-readiness picture before quoting any change: org-wide coverage against the 75% gate, the weakest classes, triggers at 0%, and whether the numbers are current. Today the Health Report only lists classes under 75%.
- **Approach:** read coverage (never run tests). Show:
  - org-wide % against 75%;
  - per class and per trigger;
  - a list of classes and triggers at 0%;
  - the last test run date.

  A **staleness warning** appears when the last run is older than the latest Apex change. Salesforce says coverage isn't refreshed until tests rerun, and "Clear All Test History" wipes it. Managed-package code is excluded from the org-wide figure, as in Salesforce.

  Outputs: a Health Report section, a Priority Action when org-wide coverage is below 75%, and a chart for the image pack.
- **Salesforce sources:**
  - Tooling `ApexOrgWideCoverage.PercentCovered` ✓
  - Tooling `ApexCodeCoverageAggregate` (ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered) ✓
  - Tooling `ApexTestRunResult` (StartTime, EndTime, Status, MethodsFailed) ✓
  - `ApexClass` / `ApexTrigger` LastModifiedDate, to detect staleness.
  - The 75% rule ✓. "Every trigger needs some coverage" is widely cited but **UNVERIFIED** on the pages we read.
- **New permissions:** none (View Setup and Configuration covers coverage reads ✓).
- **Privacy and demo:** metadata only, so it's the same at every level. Demo orgs read coverage from `demo_live`.
- **Fixture:** org-wide 71% (below the gate), about 60 classes and 12 triggers with a realistic spread, 4 classes and 2 triggers at 0%, a last test run 40 days ago, and one class changed after it, to show the staleness warning.
- **Depends on:** nothing. **Effort: S-M.**

### 2. Critical objects in Schema
- **Problem:** consultants need a quick, defensible list of objects whose data is unhealthy: stale, mostly empty, or with fields nobody fills in. Each needs a stated reason, because cleanup is billable work.
- **Approach:** extend the existing Data Quality run rather than adding a new crawler.
  - **Flags per object**, each with its reason and the numbers behind it:
    - stale: share of records not modified within N days;
    - high missing-value share: average fill rate below a threshold;
    - fields never populated: 0 populated in the counted set.
  - **Thresholds:** adjustable per org, stored with the run so results can be reproduced.
  - **Large objects:** sized with the cached approximate record count. Above a size limit we count over the first n records by Id: Ids are read (keyset paging) only to find where the sample ends, then one aggregate query bounded by that Id. Results are labelled **"estimated (sampled n of N)"**. No record contents are read.
  - **Fields SOQL can't aggregate** (long text, rich text, multi-select): counting them would mean reading record contents, which the DPA, privacy, terms and security pages say Newton never does. **Decided (17 Oct):** they stay "not counted, to keep our promise of never reading record contents"; the legal pages don't change. Opt-in content checks are in the later backlog (H).
  - **Outputs:** a "Critical objects" panel in Schema, Health Report findings, and Priority Actions.
- **Salesforce sources:**
  - Describe `filterable` / type ✓
  - SOQL `COUNT()` with WHERE ✓
  - REST `/limits/recordCount` (approximate, cached) ✓
  - LastModifiedDate ✓
  - The WHERE limits for long text, encrypted and base64 fields ✓
- **New permissions (decided 17 Oct):** View All Data is no longer a requirement for Data Quality. The client chooses **per-object View All** for the objects being scored (default set: Account, Contact, Opportunity, Lead, Case), or View All Data if they prefer. When an object's counts are partial, the screen and exports label them "Based on records the integration user can see". The choice lives on the same opt-in screen as record access (7), and the onboarding guide lists permissions only for the features turned on. In phase A, item 2 adds the partial-count labels and drops View All Data from the guide's requirements; the opt-in screen itself arrives with 7.
- **Privacy and demo:**
  - Needs aggregate record statistics: on at Full and Masked, opt-in at Metadata only (existing capability). Values are never stored, only counts.
  - Today Data Quality is refused on demo orgs. This item adds a fixture-backed path, so Lumenvale can demo Data Quality and critical objects without calling Salesforce.
- **Fixture:** per-object record counts, per-field populated counts, last-modified distributions, and one large object (2M records) that triggers sampling. Plants:
  - a stale custom object (`Legacy_Order__c`, 92% untouched in 2 years);
  - a mostly empty object;
  - three never-populated fields on Account;
  - one long-text field that can't be filtered.
- **Depends on:** nothing (13 builds on it). **Effort: M.**

### 31. Record access says when it's partial
- **Problem:** without View All on Account and Opportunity, the sync sees only the share rows of records the integration user can see, and the Record Access tab under-reports without saying so (see 7).
- **Approach:** at sync, record whether the integration user holds View All on each analysed object (or View All Data). When it doesn't, every record-access view (user tab, PDF, workbook) says **"Based on records the integration user can see"**. Full opt-in and per-object View All follow in 7.
- **Salesforce sources:** the connected user's permission set assignments (View All Data) and ObjectPermissions (`PermissionsViewAllRecords`) ✓. The connection posture doesn't record these (corrected 17 Oct), so each sync checks them, read-only.
- **New permissions:** none.
- **Privacy and demo:** unchanged. Demo orgs read the flag from the fixture.
- **Fixture:** Lumenvale's integration user has no View All, so the label shows.
- **Depends on:** nothing. **Effort: S.**

### 32. Owned-record counts are always 0 on live orgs (bug)
- **Problem:** the sync skips `RowCause = 'Owner'` share rows, while the owned-records count looks only for those rows, so a live org always shows 0 owned Accounts and Opportunities. The demo path hides it because the fixture includes owner rows.
- **Approach:** count owned records from the owner field with aggregate SOQL (`SELECT OwnerId, COUNT(Id) ... GROUP BY OwnerId`), stored per user; never from share rows. A test runs the live extraction path (mocked client) and checks the count.
- **Salesforce sources:** aggregate SOQL on Account and Opportunity `OwnerId` ✓.
- **New permissions:** none.
- **Privacy and demo:** counts only; no record IDs stored.
- **Fixture:** owner counts in `demo_live` match the share rows.
- **Depends on:** nothing. **Effort: S.**

### 33. Dark-mode outline on info badges
- **Problem:** the blue "info" badge's outline almost disappears on the dark surface, app-wide.
- **Approach:** raise the dark-mode ring and fill contrast for the info variant; check each badge variant against the dark surface. **Effort: XS.**

### 34. Anomaly methodology a client can read
- **Problem:** the user page's "How this was detected" cites a file path in our repository that a client can't open.
- **Approach:** replace it with an in-app methodology explanation: peer groups, the 13 signals, the ensemble, top 2% flagging, rank, strongest reason, base risk, and the limits of the method. Linked from the user page and the Anomalies page. **Effort: S.**

### Merge `fix-compare-search`
The compare page's search results were clipped by their card. The fix is pushed on `fix-compare-search` with no PR yet. **Effort: S** (PR, CI, merge).

## Phase B: client-facing

### 5. API usage breakdown
**Status: merged 18 Oct (#23). Redesign built in #44 (not merged):** the Health Report card becomes a compact summary (headline, four figures, the daily chart against the limit, the top 3 sources, "View full breakdown"), and an API Usage page (Overview, Callers, What's called, Daily) holds everything else; the image pack draws the card. #44 also counts the log's API_RESOURCE and ENTITY_NAME per day (resources without query strings, record ids or values; an Apex REST request only as the `@RestResource` mapping and class it resolves to, by the Apex guide's rules) and reads Apex class bodies for the mappings, keeping only name and mapping (UNVERIFIED: readable with the current permissions). UNVERIFIED in the docs: API_RESOURCE's form for Apex REST and how ENTITY_NAME lists several objects. "Apex and flows inside Salesforce don't count against the daily limit" isn't shown: the Apex guide says most ConnectApi calls from Apex count, and the log's API_CLIENT_CATEGORY lists internal callers; the page says only what the limits quick reference and the Apex guide state. Originally: a Health Report card and PDF section; no new findings, so Lumenvale's Health Report is unchanged (41, 18 findings, $183,180). Checked against the Object Reference and REST API guide (v68) while building:
- `USER_ID` in the log is the 15-character id, so users are matched on the first 15 characters. `USER_NAME` is in the log too; Newton never reads it.
- API_FAMILY values are REST, SOAP, Bulk, ApexREST, DirectApexREST and DirectAura (mixed case) ✓. A composite request is logged once (its parent) ✓.
- A later daily file can replace the earlier one for the same date with the full set ✓, so only the newest file per date is read.
- Retention (24 hours, daily files) is stated on Trailhead, not in the reference guides.
- There is no count column ✓, but "one row = one request" isn't stated in the docs; the screen says counts are log rows. Salesforce notes latent files can contain duplicate rows; Newton doesn't de-duplicate (REQUEST_ID can repeat within a transaction). UNVERIFIED how often this happens.
- COUNTS_AGAINST_API_LIMIT is a Boolean ✓; its literal CSV form (true/false or 1/0) isn't documented, so both are accepted.
- Each Health Report run adds the days it finds to the days earlier runs kept (last 30, in the snapshot); until P3, a single run shows yesterday only and says so.
- Fixture: the limit is the fixture's existing 1,015,000 (not 1,000,000), so the Health Report's limits stay as they were.

- **Problem:** clients hit their daily API limit, or pay for more, without knowing which integration is responsible. Consultants need calls per connected app, integration user and API type, the top consumers and a daily trend.
- **Approach:**
  1. Read the **API Total Usage event log**. It is available **without the Event Monitoring add-on**: free, daily files, **1-day retention** ✓. Each row is one request, so Newton aggregates on ingest and stores only counts per app, user, API type and day, never the raw rows.
  2. Because retention is one day, a trend only exists if we **collect daily**. That needs the scheduled collector in Proposal P3. Until then the screen shows "yesterday only" and says so.
  3. Show org totals against the limit from `/limits` (`DailyApiRequests`) ✓ alongside.
  4. **Fallback** when the user lacks "View Event Log Files": the screen says why, and shows the org total plus connected apps with last-used dates where readable.
  - We do **not** propose `OauthToken.UseCount`. Seeing all tokens requires **Customize Application** ✓, an elevated permission our own posture check flags. The count is cumulative per token, and Salesforce documents its Id as always null, so it can't drive a daily breakdown.
  - Coverage, stated on screen: the log covers the API families above (REST, SOAP, Bulk, Apex REST and Aura) ✓.
- **Salesforce sources:**
  - `EventLogFile` with `EventType='ApiTotalUsage'` ✓. Fields include CONNECTED_APP_ID, CONNECTED_APP_NAME, USER_ID, API_FAMILY, COUNTS_AGAINST_API_LIMIT and TIMESTAMP. There is no count field; each row is a request.
  - `/limits` ✓
  - `ConnectedApplication` (already synced by Integration Sprawl).
  - The "API Usage Last 7 Days" admin report can't be confirmed as readable through the Reports API, so treat it as **UNVERIFIED and not used**.
- **New permissions:** **View Event Log Files** ✓ (plus API Enabled, already held). Optional; the feature degrades without it. Listed as optional in docs/CLIENT_ONBOARDING_SECURITY.md; whether the Salesforce Integration licence allows it is UNVERIFIED.
- **Privacy and demo:**
  - Full: user names shown. Masked: integration users shown as aliases.
  - Metadata only: per-user rows dropped, with per-app and per-API-type rows kept, because user records are off.
  - Demo: read from the fixture.
- **Fixture:** 30 days of daily aggregates for 6 connected apps and 4 integration users. One app (a nightly ETL) takes 58% of calls, with a spike that nearly hits the limit, plus an org limit of 1,000,000 a day.
- **Depends on:** Proposal P3 for the trend (v1 works without it, as "yesterday only"). **Effort: M.**

### 3. Image pack and per-visual downloads
**Status: merged 18 Oct (#24). Changed in #43 (not merged):** images carry no logos and no "Demo data" label (the consultant's own branded slides; demo files keep the demo- prefix and DEMO-DATA.txt, and the app its badge), the logo options are gone, and a **Summary** slide puts the key figures on one 16:9 slide (its own download and an option in the dialog). The bullets below describe the first version.
- Slides are laid out at 800×450 and rendered at 3840×2160. Tight crops are laid out 680 wide, rendered at the same scale and cropped to their content.
- The PowerPoint file always uses the slide layout (one 16:9 slide per visual, title in the slide notes).
- The ZIP lists skipped visuals in skipped.txt and, on demo orgs, carries DEMO-DATA.txt.
- "Savings breakdown" is drawn as the findings behind the estimate (largest first), with the total.
- Both dependencies are pinned (pypdfium2 4.30.0, python-pptx 1.0.2), installed and rendered in a local build of `apps/backend/Dockerfile`. Licences are in `apps/backend/THIRD_PARTY_NOTICES.md`, with PDFium's third-party texts in `apps/backend/licenses/`.
- UNVERIFIED: which builder the Railway backend service uses (Dockerfile or Nixpacks).

- **Problem:** consultants rebuild charts by hand in PowerPoint. They need ready-to-drop visuals in the client's and firm's branding, one at a time or as a set.
- **Approach:** one HTML page per visual at 2x resolution, rendered by the existing WeasyPrint pipeline, then rasterised with `pypdfium2`. A `.pptx` is built with `python-pptx`, one image per slide.
  - **Visuals:** health score, savings breakdown, risk distribution, top anomalies (ranked), license fit, compliance summary, critical objects, code coverage, API usage.
  - **Per-visual download:** a download button on each of those charts and cards in the app saves just that visual.
  - **Image pack dialog:** tick the visuals to include, then download a ZIP, a `.pptx`, or both.
  - **Format:** PNG or JPEG. PNG has a **transparent background** option so the image sits on the client's own template. JPEG is always opaque.
  - **Two layouts per visual:** a **16:9 slide** (3840x2160 at 2x) with a title and a short caption, and a **tight crop** with no slide frame, for pasting into existing slides.
  - **Logos:** optional toggles for our logo and the client's. (Removed in #43: no logos on images.)
  - **Labels:** masked orgs stay masked; demo orgs always carry the "Demo data" label, on every image, whatever the toggles say. (Changed in #43: no label on images.) User-level visuals are left out at Metadata only, and a visual whose module hasn't run is skipped with a note.
  - **Tests:** every format (PNG, transparent PNG, JPEG, ZIP, PPTX) and both layouts: size, transparency, demo label present, masked names absent. (#43: no logo or label on any image, and the Summary's figures.)
- **Dependencies (approved 17 Oct):** `pypdfium2` (Apache-2.0 or BSD-3-Clause, plus PDFium's third-party notices; a self-contained wheel, no system packages) and `python-pptx` (MIT; its dependencies lxml, XlsxWriter and Pillow are BSD or MIT). Both must be confirmed in the Docker build, and the PDFium notices added to our licence notices.
- **Salesforce sources:** none new (reads Newton's stored results).
- **New permissions:** none.
- **Fixture:** none beyond what 2, 4 and 5 add.
- **Depends on:** 2, 4 and 5 for their visuals. **Effort: L** (was M; per-visual downloads, the dialog and the two layouts add work).

### 35a. Role hierarchy view (read-only)
Requested by the Salesforce lead (17 Oct): turn the org chart tab into a role hierarchy tool. Split into 35a (view, phase B), 35b (design mode v1: drafts, Account and Opportunity impact, ZIP export, phase B), 35c (full impact preview, phase D after 7) and 35d (write-back, plan only, phase H). Mike's core ask, editing the hierarchy, lands in phase B.

- **Problem:** consultants redesign role hierarchies on almost every engagement, but the org chart tab shows only users and managers. Roles, who sits in them and what each role rolls up to aren't visible anywhere in Newton.
- **Approach:**
  - The org chart tab gets a **Roles / People** toggle. People is today's user and manager view, kept because approvals and the Manager field still use it (and its existing, opt-in Manager write-back is unchanged).
  - Roles view: nodes are roles (UserRole), not users. Selecting a role shows its users (name, profile, risk score, last login), the user count, and what rolls up to its ancestors: records owned by users in the role and below, per object, from the owner counts the sync already takes (32). Without View All on the object, counts carry the "Based on records the integration user can see" label (31).
  - Flags, each with its threshold shown: empty roles, roles with one user, branches deeper or wider than a threshold (defaults to be set from real orgs; no Salesforce depth limit is documented, only "minimise the number of levels" ✓). Portal and community roles (PortalType Partner or CustomerPortal ✓) sit in their own section, hidden by default.
  - The sync reads more of UserRole: DeveloperName, RollupDescription, PortalType, PortalRole, PortalAccountId and the three access-for-account-owner fields ✓ (today it reads Id, Name and ParentRoleId only).
- **Salesforce sources:** UserRole fields and properties ✓; reading UserRole needs "View Roles and Role Hierarchy" ✓ (already in the onboarding guide's Newton Read Only set); role limits: up to 5,000 roles for orgs created in Spring '21 or later, 500 before (Support can raise) ✓.
- **New permissions:** none.
- **Privacy and demo:** users in a role follow the org's privacy level (aliases when masked; no user list at Metadata only, roles and counts still shown). Demo orgs read roles from the fixture.
- **Fixture:** done in PR #20: Lumenvale has 33 roles (regional sales, department heads, single-user and empty roles, depth 5, a partner portal branch) with no change to its Health Report.
- **Depends on:** nothing new (uses 31 and 32). **Effort: M.**

**35a status: built (branch feat/role-hierarchy-view), not merged.**
- Default thresholds: deep = more than 5 levels, wide = more than 6 roles directly below. They're adjustable on screen and labelled as defaults, to be revisited with real-org data.
- No migration: the extra UserRole fields go into the role snapshot's existing raw_data. If the org rejects the extended query, the sync falls back to Id, Name and ParentRoleId.
- The tab opens on Roles; People (the editable manager view) is one click away and keeps its privacy gate.
- At Metadata only, roles are shown without user or record counts: with no user records there's nothing to count them from.
- Lumenvale's Account owner counts come with 35b's demo data (#26); on this branch alone Account shows "Unknown".

### 35b. Role design mode v1: drafts, Account and Opportunity impact, export
**Status: merged 18 Oct (#26, #31). #48 (not merged) adds a Graph mode beside the Tree: both edit the same draft; draw a role to its parent (one parent, replacing asks first, loops refused), drop users onto roles, auto-layout, zoom, fit, search.** Mike's core ask. Moved up from phase D on 17 Oct: the parts that needed phase C (a stored snapshot for the diff and rollback) are designed out, and the impact preview starts with the objects whose record access already works.
- **Problem:** consultants design hierarchy changes in spreadsheets and can't say, before go-live, who gains or loses access. A bad reparent triggers a long sharing recalculation and access surprises.
- **Approach:**
  - **Drafts, stored in Newton, never sent to Salesforce:** drag a role onto another to reparent it, drag users between roles, create, rename and delete roles. Cycles are blocked (a role can't move under its own descendant). Undo and redo, named drafts.
  - **Each draft saves its starting hierarchy** (roles, parents, user assignments) when it's created, and the diff compares the draft with that, so no phase C snapshot is needed. When the org has been synced since, Newton compares the saved start with the current hierarchy and warns that the draft is stale, listing what changed in Salesforce, before it can be exported.
  - **Impact preview, Account and Opportunity only, counts only, never record contents:**
    - which users gain and which lose visibility through the hierarchy, and how many in total: the ancestors of each moved role before and after the change, and the records owned by users in the moved branch (owner counts from the sync, 32);
    - for each object it says **what** changes, not just how many: users above a role can view and edit what's owned by or shared with users below them ✓, so with a **Private** org-wide default a move changes both who can see and who can edit; with **Public Read Only** everyone can already see the records, so only edit access changes; with **Public Read/Write** nothing changes;
    - records shared to users in the moved branch (manual, team and rule shares, from the Account and Opportunity share rows the sync already reads) are counted separately;
    - the figures are an upper bound: some ancestors may still see the same records through other sharing, and counts carry the "Based on records the integration user can see" label without View All (31). Account and Opportunity both use hierarchies: confirmed 17 Oct in Sharan's developer org, where Sharing Settings shows Grant Access Using Hierarchies checked and greyed out (not changeable) for both;
    - sharing rules (SharedTo role, roleAndSubordinatesInternal, roleAndSubordinates, portal role types ✓) and public groups that reference the moved roles, by name;
    - a warning that applying the change recalculates sharing automatically ✓, that large changes can hit "could not acquire lock" errors and should be applied leaf-first, serially and off-peak ✓, and should go to a sandbox first.
    - Case, Contact, Lead, custom objects and the account-owner settings follow in 35c.
  - **Export (v1), the same ZIP approach as 3:**
    - Role metadata (`.role` files in `roles/`, type Role, wildcard supported ✓) with package.xml: name, API name (fullName), parentRole, description and the three access levels ✓;
    - a Data Loader CSV of user-to-role assignments (User Id, UserRoleId; setting it needs Manage Internal Users ✓);
    - the draft's starting hierarchy in the same two forms, so the client can put it back by hand if needed (a manual way back, not Newton rollback, which belongs to 35d);
    - a readme with prerequisites and deploy steps. The deploy order (whether a parent and child role can go in one deploy, and whether parentRole takes the parent's API name) is UNVERIFIED and is tested by Sharan in his developer org before the readme states it; Newton never deploys anything.
    - Portal roles are left out: the Role type has no portal fields and portal roles can't be updated through the API ✓.
  - **Implementation Advisor:** the same design mode starting from an empty hierarchy, so a new client's roles can be designed from scratch and exported (no impact preview there; there is no org yet).
- **Salesforce sources:** as 35a, plus Role metadata type ✓; Group Type values for roles and Group.RelatedId ✓; sharing recalculation on hierarchy changes ✓; org-wide defaults and Account/Opportunity share rows (already synced).
- **New permissions:** none (read only; nothing is written to Salesforce).
- **Privacy and demo:** drafts are Newton data, follow the org's privacy level and are erased with the org. On demo orgs drafts work normally and exports are marked demo.
- **Fixture (measured 17 Oct in a scratch prototype on top of PR #20; not yet added):**
  - **Account owner counts:** total 5,200 (the Account count Data Quality reports), given only to users who already own Opportunities, Leads, Cases or Contacts. License Fit only looks at Account ownership when a user owns nothing at all, so no License Fit result can change. Measured: Health Report 41, 18 findings, $183,180; License Fit $116,220; risk, anomalies and Priority Actions all unchanged.
  - **Org-wide defaults, all Private** (Contact Controlled by Parent): measured, nothing changes.
  - **A role-based sharing rule and a public group:** blocked until PR #22 merges. The Health Report's empty-group rule counted every group with no member rows, including role groups (in the fixture they have none), so adding them raised "5 Public Groups / Queues have zero members" (measured 40, 19 findings). PR #22 makes it check only public groups and queues.
  - **Edit-only case (decided 17 Oct): not demoed on Lumenvale; every org-wide default stays Private.** Opportunity Public Read Only adds a genuine High finding ("sensitive objects have Public OWD"; measured 32, 20 findings with the empty-group issue). The common setup, Account Public Read Only with Opportunity Private, is flagged the same way (measured 33, 19 findings; License Fit and savings unchanged).
  - Nothing goes into the fixture or the runbook until Sharan approves any change to these numbers.
- **Depends on:** 35a, 3 (ZIP export). Not on phase C. **Effort: L.**

**35b status: built (branch feat/role-design, on top of 35a), not merged.** Notes from building it:
- Drafts are stored in a new table, `role_design_drafts` (migration a9c3e5f7b2d4, tested up and down on a throwaway database). Each draft keeps its starting hierarchy and a list of changes; undo and redo move through that list.
- The draft is validated on every save.
- An existing role's API name can't change in a draft: the export identifies roles by API name, so a changed name would deploy as a new role.
- Deleting a role needs it to have no users and no roles below it. Deletions go in the readme as manual steps; no destructive metadata is exported.
- Sharing rules (follow-up PR, checked against the v68 Object Reference):
  - Group.RelatedId is "the ID of the associated UserRole" for groups of type Role (confirmed). For the subordinate types (RoleAndSubordinates, RoleAndSubordinatesInternal) it's assumed the same: UNVERIFIED.
  - A share row with RowCause Rule means "access via a sharing rule", and its UserOrGroupId is the group shared to. So rule-based share rows can be tied to roles through their role group, but they don't say which rule made them; the preview counts them per object.
  - Rules are named from AccountOwnerSharingRule / OpportunityOwnerSharingRule (UserOrGroupId = target group, GroupId = source group), when readable: the Object Reference says Salesforce Support enables access to these objects. Criteria-based rules have no queryable target object we found, so they stay "target not read".
- Public groups are matched through the role groups (Group.RelatedId) they contain.
- A count the sync didn't take is shown as unknown ("records not counted", "at least N"), never as zero.
- The export's `.role` element names and order, and the access-level values, follow the Role metadata fields checked earlier; whether a deploy accepts them is part of Sharan's developer-org test, along with the deploy order.
- The Implementation Advisor's design-from-scratch draft lives in the browser, like the rest of the advisor's answers, and exports through an endpoint that needs a signed-in user but no org.
- **Fixture (added 18 Oct, `06-role-design.json`, generated by `research/demo_fixture/build_role_design_part.py`):** Account owner counts (5,200 in all, only for users who already own records), all-Private org-wide defaults, and a role-based sharing rule with a public group of the regional director role groups. Measured after PR #22 and tested: Health 41, 18 findings, $183,180; License Fit $116,220; risk levels, anomalies and Priority Actions unchanged.

## Phase C: foundations

### Salesforce API v68 (first in phase C)
- **Problem:** Newton pins API v62 (Winter '25): the REST and Tooling client and the Metadata (SOAP) client default to `v62.0`, and the 35b export writes `62.0` into package.xml. The current version is v68 (Winter '27). Apex sharing reasons on standard objects exist only from v68, so at v62 Newton may not see or label those share rows correctly (UNVERIFIED how v62 queries return them).
- **Approach:**
  1. One version setting instead of three (client, metadata client, export package.xml).
  2. Use the lower of v68 and each org's highest supported version, read from `GET /services/data/` at connect or sync. During Salesforce's release weekends an org still on the previous release would reject a v68 call.
  3. Compare a full read-only sync at v62 and at v68 in Sharan's developer org, object by object, before switching.
  4. Read the API change notes for v63 to v68 (Spring '25 to Winter '27) for every object and field Newton queries.
- **What could break (all UNVERIFIED until step 3):** renamed or removed fields in the queries Newton runs (permission flags, FlowDefinitionView, coverage objects); the API Total Usage log's columns (Salesforce says to check LogFileFieldNames before relying on them); describe output #28 depends on (actionOverrides, share RowCause values).
- **New permissions:** none. **Depends on:** Sharan's developer-org comparison. **Effort: M.**

### 8. Field metadata sync
- **Problem:** several features need to know what a field is: its type, encryption, and whether it is a lookup or master-detail (ERD, documentation export, comparison, impact analysis, sensitive-data maps). Today the app shows field type and encryption as unknown.
- **Approach:** sync describe metadata per object: field type, length, required, formula (and its formula), references and relationship name, master-detail status and cascade delete. Encryption is recorded as **Shield** or **Classic** separately.

  For orgs with hundreds of objects, describe calls are batched and cached between syncs. A field's describe is refreshed only when its object's `LastModifiedDate` changes, **UNVERIFIED** that this is reliable for standard objects.
- **Salesforce sources:**
  - Describe field attributes: type, length, nillable, calculated / calculatedFormula, referenceTo, relationshipName ✓
  - Classic encrypted text has type `encryptedstring` ✓
  - Shield: describe `encrypted` (Shield Platform Encryption, returned only when true) ✓; Metadata `CustomField.encryptionScheme` ✓
  - Tooling `EntityParticle.IsEncrypted` (Classic) ✓
  - `cascadeDelete` / `relationshipOrder` on the parent's `ChildRelationship` ✓
- **New permissions:** none.
- **Privacy and demo:** metadata only, so it's the same at every level. Demo reads from the fixture.
- **Fixture:** describe-shaped metadata for the fixture's objects. Plants:
  - two master-detail relationships;
  - a Shield-encrypted `Compensation__c.Salary__c`;
  - a Classic encrypted field;
  - formula fields.
- **Depends on:** nothing. **Effort: M.**

### 21. Shared, versioned data model with snapshots
- **Problem:** comparison (6, 9), simulation (15), verification (17), drift and reports each need "the org as it was at time T". Today a sync overwrites the previous one.
- **Approach:** each sync becomes an immutable **snapshot** (id, org, taken_at, source = live / fixture, coverage). Permission, assignment, share and metadata rows get a `snapshot_id`; only changed rows are written as new versions (copy-on-change), so storage stays proportional to change.
  - Every module reads "latest" by default and can read any snapshot.
  - Retention and erasure cover snapshots: the deletion certificate lists them.
  - Old snapshots past retention are pruned, except approved baselines (see 9 and 17).
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:** a snapshot is purged or masked under the privacy level in force, exactly as today's rows are.
  - Tightening the level rewrites all snapshots.
  - On demo orgs, the fixture can provide two dated snapshots, "kickoff" and "today", to demo drift and verification.
- **Fixture:** a second fixture state ("today") with 14 changes from "kickoff":
  - assignments removed and added;
  - a muting set added;
  - a profile permission removed;
  - a new connected app.
- **Depends on:** nothing, but it touches most services. **Effort: XL.** It's the largest foundation item; do it before 15-17 so they never build their own history.

### 20 + 10. Evidence on every finding, reviewer feedback and validation
- **Problem:**
  - Consultants need to defend every finding in front of a client: where it came from, when, how complete the data was, and how sure we are.
  - "No observed usage", "no access" and "no issue" are different claims and must never be merged.
  - To validate the model on a real, consenting org, reviewers need to mark findings useful, not useful or expected, and we need to report how many proved useful.
- **Approach:** a common **evidence block** on every finding, anomaly and recommendation:
  - source (object or API), collection time and snapshot;
  - coverage (e.g. "412 of 412 users", "sampled 50k of 2M");
  - confidence: **confirmed / inferred / sampled / unknown**;
  - required permission or licence, and whether we had it;
  - methodology version.

  **Review** (10): status and reason per finding (useful / not useful / expected), approved exceptions, reviewer and date. A **validation report** gives precision overall, by module and by anomaly type, with counts, never a single score. Its title states which org and period it covers. Every module shows "not measured" separately from "nothing found".
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:**
  - Review data is Newton's own, but reviewer comments can mention people. They follow the org's privacy level and are erased with the org.
  - On demo orgs, review is allowed and labelled demo. It never counts towards validation.
- **Fixture:** none (reviews are entered in the app). Optionally, pre-seed a few demo reviews for the validation screen.
- **Depends on:** 21 (evidence points at a snapshot). **Effort: L.**

### 30. Should the anomaly flag feed the risk score?
- **Problem:** the risk score includes a peer-deviation factor (weight 0.35) that is driven by the anomaly flag. A flagged user's risk level therefore partly restates the flag, so "rank" and "risk" aren't independent. Phase A works around it with **base risk** next to every rank (23); the formula is unchanged until this is decided.
- **Options:**
  1. **Keep the flag in the score and show both** overall risk and base risk everywhere a user's risk appears. No score changes; two numbers on every screen.
  2. **Remove peer deviation from the risk score.** Risk measures impact only (privileges, sensitive data, breadth, dormancy, sole access); anomalies stay a separate signal. Simplest to explain to a client.
  3. **Keep it at a lower weight** (e.g. 0.15) so being unusual nudges the score without moving a level on its own. Needs a rationale for the number, which is hard to defend.
  4. **Keep it only as a tie-breaker** for sorting users within a level, never changing the level.
- **Effect on Lumenvale** (400 users, measured 17 Oct; only the 8 flagged users change, because unflagged users have no peer-deviation points):
  - Today (flag in score): Critical 5, High 35, Medium 197, Low 163. All 8 flagged users are High.
  - Without the flag (options 2 and 4; also what base risk shows): Critical 5, High 31, Medium 201, Low 163. Flagged #2-#5 stay High (base 51-53); #1, #6, #7 and #8 become Medium (base 27-43).
  - Option 3 needs a recalculation at the chosen weight before quoting numbers.
- **Decide with:** 20 (methodology version on every score) so a change is versioned and old reports stay reproducible.
- **Depends on:** 20. **Effort: S** to implement once decided; the decision is the work.

## Phase C2: priced roadmap

### P1 (+ P2). Priced roadmap builder with remediation playbooks
- **Problem:** the positioning promises an assessment that ends in a client-ready, priced roadmap. Today consultants build it by hand after every assessment.
- **Decision (17 Oct):** build it right after phase C. It depends on the evidence model (20).
- **Approach:**
  - **Work packages:** findings are grouped into packages (e.g. "permission set consolidation", "dormant licence reclaim", "critical object cleanup"), each with its findings and evidence, dependencies and sequencing.
  - **Effort as editable ranges** (low to high, in days), never single exact estimates. Each range starts from a firm-level **playbook** for that finding type (P2: steps, prerequisites, risks, typical range, versioned). The consultant can override it.
  - **Inferred vs confirmed:** inferred effort (from the playbook and the finding's size) is shown separately from consultant-confirmed effort, and the deliverable shows which is which.
  - **Configurable rate card** per firm (roles and day rates; optional per-engagement override). Prices are ranges derived from effort ranges and the rate card.
  - **Output:** closing slides (via 3's renderer), an Excel workbook and an SOW appendix. Savings use the savings ledger (18) once it exists, and are labelled "estimated" until then.
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:**
  - Work packages reference findings, so they inherit their visibility (aliases when masked; counts only at Metadata only).
  - Demo roadmaps carry the demo label.
  - The rate card is the firm's data, not the client's.
- **Fixture:** a demo rate card and playbooks for Lumenvale's main finding types.
- **Depends on:** 20 (evidence and review status). **Effort: L.**

## Phase D: access depth

### 1. Page layouts and Lightning pages, plus access through Apex and Flows

**Phase 1: assignments and "who can run".**
**Status: merged 18 Oct (#28, #41). Follow-ups (not merged):** #45 makes every section of the Pages & automation tab a searchable card with one table style, object groups and "granted through" chips in the graph's node colours; #46 replaces the graph's checkbox with picker tabs (Page layouts, Record pages, Apex classes, Flows), drawing each picked item with the edges that reach it (no cap of 12) in distinct shapes. Checked against the v68 (Winter '27) guides while building:
- Record type visibility per profile is read from Tooling Profile.Metadata (one profile per query, capped at 150). Record types granted by permission sets have no queryable source we found, so they aren't read; the screen says so.
- The org default record page comes from the object's describe (actionOverrides with a pageId). That field isn't described in the guides we could reach: UNVERIFIED.
- Precedence used, most specific first (Sharan's expectation, 18 Oct): app + record type + profile, then app + record type, then app + profile, then app default, then org default. Only "a profile assignment beats the app default" is documented (Metadata API, CustomApplication); the full order stays UNVERIFIED until tested in Sharan's developer org. Where app + profile (no record type) ranks against app + record type is a guess.
- Apex sharing reasons: the user's assumption was "custom objects only". From API version 68.0 they're also available on standard objects that have a share object and a Private or Public Read Only default (up to 10 per object), although parts of the Apex guide still say "custom objects only". A share that Apex creates without a reason has RowCause Manual, the same as a user's manual share, so those can't be told apart. Newton labels shares with a reason (RowCause ending __c) "Granted by Apex" with the reason's label from the share object's describe, and says Manual may include Apex. Newton reads Account and Opportunity shares only; other objects come with item 7.
- Flows: "Run Flows" or the user's Flow User setting lets a user run any flow that isn't restricted; restricted flows (isAdditionalPermissionRequiredToRun) need explicit access. Only record-triggered flows are documented as not depending on the user's flow permissions; scheduled and platform-event flows are marked UNVERIFIED. The field name PermissionsRunFlow wasn't found in the PDFs: UNVERIFIED, read with a fallback.
- Apex class access covers entry points: a class may still run when called from one the user can run (Apex guide).
- Stored with the sync job (sync_metadata["ui_access"]), so no migration.
- App assignments name profiles by API name: the Metadata API guide's CustomApplication example uses `<profile>Admin</profile>` for System Administrator. Newton reads each profile's API name (Tooling `Profile.FullName`, one profile per query) and matches on it, case-insensitively, never on the label; when the API name wasn't read it falls back to the label and says so. Tested with Admin and Standard.
- Per-profile view (Profiles page and each profile's page) and Apex and flow access on the permission set page: configuration only, so they work at Metadata only, where there's no user page.
- Item 8 isn't needed: record types are read directly.

- **Problem:** "Why does this user see this layout or page?" and "Which code and automation can this user run, and why?" Today the graph shows object and field access only.
- **Approach:** for a user and an object:
  - **Page layout:** the layout from their **profile + record type** (with the record types available to them). Layouts are assigned to **profiles only**. Salesforce cancelled moving this to permission sets ✓, so there is no permission-set path to show.
  - **Lightning record page:** the resolved page and the rule that won, evaluated in Salesforce's precedence order: **app + record type + profile**, then **app default**, then **org default**, per form factor (desktop or phone). The precedence order is **UNVERIFIED** as an exact rule in the docs and must be tested in a sandbox. Shown as an explanation, like Why?.
  - Stated on screen: **component visibility rules on a page aren't evaluated**.
  - **Apex classes and Flows the user can run:** permission sets, profiles and groups that grant each class or flow, with the path, as in Why?. Flows that **require explicit access** (the "restrict access" override) are flagged. "Run Flows" is shown as a separate system permission, with Salesforce's rule that record-triggered, scheduled and platform-event flows don't need it ✓. The org's status for the "Restrict User Access to Run Flows" release update is shown when readable, **UNVERIFIED** how to read it via API.
  - The graph gets layout, page, Apex and Flow nodes behind a filter (off by default to avoid clutter).
- **Salesforce sources:**
  - Layouts and record types:
    - Tooling `ProfileLayout` (ProfileId, LayoutId, RecordTypeId, TableEnumOrId) ✓
    - Tooling `Layout` ✓
    - `RecordType` ✓
    - Record-type visibility per profile: Metadata `Profile.recordTypeVisibilities`, **UNVERIFIED** how to read it without a Metadata retrieve. Fallback: describeLayout record-type mappings for the integration user only, which isn't enough. Needs a sandbox test.
  - Lightning page assignments:
    - Org default: describe `actionOverrides` (formFactor, pageId) ✓. Whether describe reflects app or profile assignments is not documented, so we use it for the org default only.
    - App default and app + record type + profile: Tooling `CustomApplication.Metadata` → `actionOverrides`, `profileActionOverrides` ✓. Plan one query per app; whether the one-record rule applies is **UNVERIFIED**.
    - Managed-package org defaults can't be retrieved ✓, so those are shown as unknown.
  - Apex and Flow access:
    - `SetupEntityAccess` (SetupEntityType `ApexClass` ✓, `FlowDefinition` from API 58 ✓)
    - Flow `isAdditionalPermissionRequiredToRun` ✓ (Tooling `Flow.Metadata`, one record per query ✓, so one query per flow)
    - `PermissionsRunFlow` ✓
- **New permissions:** none (View Setup and Configuration covers SetupEntityAccess and the Tooling objects ✓). We avoid Metadata API retrieve, which would need extra permissions (**UNVERIFIED** which).
- **Privacy and demo:** configuration only, so it works at every level. Per-user views follow user visibility (aliases when masked; no per-user view at Metadata only, but per-profile views still work). Demo reads from the fixture.
- **Fixture:**
  - 3 record types on Opportunity and 2 on Case;
  - page layouts per profile and record type;
  - 4 Lightning record pages: an org default, a Sales app default, and an app + record type + profile override for Sales Manager;
  - about 20 Apex classes;
  - about 15 flows with run modes;
  - SetupEntityAccess grants through profiles, sets and groups;
  - two flows with "restrict access" on, one of them granted only through the Sales Manager Bundle.
- **Depends on:** 8 (record-type and relationship context). **Effort: L.**

**Phase 2: what that Apex or Flow can reach in system context.** Planned in phase G.
- **Approach:**
  - For each class: its sharing mode, from Tooling `ApexClass.SymbolTable` modifiers ("with / without / inherited sharing") ✓, no Body parsing needed.
  - For each flow: its run mode, from Tooling `Flow.RunInMode` (DefaultMode, SystemModeWithSharing, SystemModeWithoutSharing) ✓.
  - Objects and fields touched: Salesforce's dependency data (Tooling `MetadataComponentDependency`, **Beta** ✓) plus static analysis of the Apex body and flow metadata. Dynamic SOQL and string-built references aren't caught.
  - Every result is labelled **"potential exposure: code that runs without sharing and touches X"**, never as a confirmed access issue.
  - Managed-package classes are opaque (source hidden ✓). Whether SymbolTable is returned for them is **UNVERIFIED**; shown as "managed: not analysable".
- **Effort: L.**

### 7. Record-level access: opt-in, per-object View All, adds Cases, Contacts and Leads
- **Problem:** record access covers Accounts and Opportunities only. It also depends on access we don't ask for. Today the sync queries `AccountShare`, `OpportunityShare` and the team tables with whatever records the integration user can see. View All Data is only "optional" in the onboarding guide, which ties it to Data Quality. So in a private-sharing org the Record Access tab under-reports **without saying so**. Separately, the sync skips `RowCause = 'Owner'` share rows while the owned-records count looks for exactly those rows, so live orgs always show 0 owned Accounts and Opportunities (bug).
- **Decision (17 Oct):** View All Data is **not** requested: too broad for a third-party integration user, and contrary to our least-privilege position. Instead:
  - **Opt-in per org.** Record-access analysis is off by default. An admin turns it on per org on the Privacy & Data page, recording that the client agreed. The extra permissions are listed **only** when it's on.
  - **Per-object "View All"** (the object permission, not View All Data) on exactly the objects being analysed: **Account, Opportunity, Case, Contact and Lead** (Account and Opportunity confirmed 17 Oct). When it isn't granted, every record-access view says "Based on records the integration user can see"; that labelling ships early, in phase A (31).
  - **Contact controlled by parent:** when Contact's org-wide default is "Controlled by Parent", Contact access follows the parent Account. Newton reads it from the Account side (`AccountShare.ContactAccessLevel` and Account visibility), not `ContactShare`, which may be unavailable (**UNVERIFIED**; handled defensively). View All on Account is then what's needed, not on Contact.
- **Approach:** sync `CaseShare`, `ContactShare` and `LeadShare` the same way as Account and Opportunity, with each object's org-wide default. The owner-row bug is fixed in phase A (32). The screen states what share tables **can't show** ✓ (sharing sets, `ImplicitChild` with faster recalculation, rows Salesforce stops storing). The claim is "explicit and stored shares", never "everyone with access".
- **Salesforce sources:** `CaseShare` / `ContactShare` / `LeadShare` (UserOrGroupId, *AccessLevel, RowCause) ✓; reading them needs read access to the parent ✓. Whether per-object View All is assignable under the *Salesforce Integration* user licence for each object: **UNVERIFIED**, test in a sandbox.
- **New permissions:** only when the org opts in: View All on Account, Opportunity, Case, Contact and Lead. The onboarding guide lists these under "only if you turn on record-access analysis".
- **Opt-in screen:** one screen on the Privacy & Data page for record-level features: record-access analysis (this item) and Data Quality's scored objects (2), with the permissions each one needs listed only when it's on.
- **Privacy and demo:** needs the Record shares capability (off at Metadata only). Opt-in sits on top of the privacy level. Record IDs are stored only as keyed hashes. Demo orgs read from the fixture, with the opt-in shown as on.
- **Fixture:** share rows for Cases, Contacts and Leads (team, rule, manual), one user who reaches 3,000 Cases through a criteria-based sharing rule, and Contact set to "Controlled by Parent" so that path is demoed.
- **Depends on:** nothing. **Effort: M-L** (opt-in setting, guide changes and the owner-count fix add to it).
- **Related (decided 17 Oct):** Data Quality uses the same per-object, opt-in pattern instead of View All Data (see 2).

### 35c. Role impact preview: all objects
- **Problem:** 35b's impact preview covers Account and Opportunity only. Clients also need the effect on Cases, Contacts and Leads, and on the access account owners get to related records.
- **Approach:** extend 35b's preview to Case, Contact and Lead using 7's per-object share and owner data and coverage labels. Add the account-owner settings the moved roles carry (opportunity, case and contact access for account owners ✓). Add custom objects, where Grant Access Using Hierarchies can be off: the per-object setting isn't exposed in any documented API ✓, so the consultant confirms it per object and the result says "assumes Grant Access Using Hierarchies is on" until they do.
- **Salesforce sources:** as 35b, plus 7's sources.
- **New permissions:** none beyond 7's opt-in per-object View All.
- **Privacy and demo:** as 35b.
- **Fixture:** 7's Case, Contact and Lead share data on Lumenvale.
- **Depends on:** 7. **Effort: M.**

### 6. Profile and permission set comparison (first user of the comparison engine)
- **Problem:** "What's different between these two profiles or sets, and who would gain or lose access if we merged them?" This underpins most cleanup quotes.
- **Approach:**
  - **Engine:** build a generic **comparison engine** (left side, right side, matching keys, typed differences), shared later by 9.
  - **Inputs:** 2-4 profiles (via their profile-owned set) or permission sets.
  - **Compared:**
    - object CRUD, View All and Modify All;
    - field read and edit;
    - system permissions;
    - Apex, Flow and custom-permission grants (once 1 lands);
    - assigned user counts.
  - **Controls:** a "differences only" toggle, search, and CSV export.
  - **Entry point:** a "Compare" button on the permission set page.
- **Salesforce sources:** none new (synced permission data). System permission flags are already on PermissionSet ✓.
- **New permissions:** none.
- **Privacy and demo:** configuration only, so it works at every level. Assigned user counts are counts, not names. Demo works from the fixture.
- **Fixture:** add two near-duplicate sets ("Sales Ops" and "Sales Operations", differing in 3 permissions) to show a merge candidate.
- **Depends on:** 21 for comparing versions over time (works on latest without it). **Effort: M.**

## Phase E: Config Workbook parity

Config Workbook is a third-party AppExchange app (CWB Software Tools), not a Salesforce product ✓. Its vendor documents an Excel documentation export, object ERDs, impact analysis and a dependency explorer, an audit trail explorer with risk scoring, and org and profile comparators. **Our parity bar is what Mike uses day to day, not the full vendor list.** Sharan is confirming with Mike which features he uses; until then **9 (v1) goes first** in this phase and the order of 11, 12 and 13 is held.

### 9 (v1). Org-to-org comparison
- **Problem:** before a release, a merge or a sandbox refresh, consultants need to know what differs between two orgs, or within one org between two dates, and **what that difference means**: who gains or loses access, and what depends on it.
- **Approach:** reuse the comparison engine (6) on two snapshots (21): production vs sandbox, any two orgs, or the same org on different dates.
  - **v1 compares:** permissions and assignments, objects and fields, automations, packages and integrations, all from data we already sync.
  - **Matching:** by API name and namespace, not by Salesforce ID. IDs differ between orgs; sandboxes keep them after a refresh but drift afterwards. An **explicit mapping screen** handles renames and namespace changes, and its decisions are saved per org pair.
  - **Consequences, not just differences:**
    - users who gain or lose object or field access (via effective access on each side);
    - automations and integrations that depend on a changed object or field (via 13's dependency data);
    - **expected vs unexpected**: a baseline lists approved differences, e.g. sandbox email deliverability off, and everything else is drift.
  - **Baselines:** approved and stored per org (shared with 17).
- **Salesforce sources:** none new for v1.
- **New permissions:** none. Each org uses its own connection.
- **Privacy and demo:**
  - Comparing two orgs with different privacy levels uses the **stricter** level for the whole comparison.
  - User-level consequences are hidden at Metadata only; counts remain.
  - Demo: compare Lumenvale's two fixture snapshots ("kickoff" and "today") from 21, plus a "Lumenvale UAT" sandbox fixture.
- **Fixture:** a small "Lumenvale UAT" sandbox fixture with 20 planted differences: renamed field, extra permission set, deactivated flow, a different package version. One namespace difference needs mapping.
- **Depends on:** 21, 6, 8; 13 for dependency consequences. **Effort: XL.**

### 12. ERDs from object relationships
- **Problem:** consultants draw data-model diagrams by hand for discovery and design.
- **Approach:** an interactive ERD reusing the access-graph renderer (chips, layered layout). Lookups are drawn as plain edges and master-detail as bold. Each diagram has a chosen focus object and depth (1-3). Options: hide system objects; export to PNG or SVG and into the image pack.
- **Salesforce sources:** from 8 (referenceTo, relationshipName, child relationships) ✓.
- **New permissions:** none.
- **Privacy and demo:** metadata only, so it works at every level, including demo.
- **Fixture:** covered by 8.
- **Depends on:** 8. **Effort: M.**

### 11. Documentation export
- **Problem:** clients ask for "the org documented" as a deliverable.
- **Approach:** add sheets to the existing Excel export:
  - Objects and Fields (from 8);
  - Page Layouts and Record Types (from 1);
  - Validation Rules, with their formulas;
  - Picklist values, including values per record type;
  - Flows (type, trigger, active version, run mode);
  - Apex classes and triggers (sharing mode, coverage from 4, API version).

  Validation formulas need one Tooling query per rule ✓. They are fetched in the background with a progress count, and the sheet says so if any are skipped.
- **Salesforce sources:**
  - Tooling `ValidationRule` ✓, with the formula only in `Metadata`, one record per query ✓.
  - Describe `picklistValues` ✓.
  - Values per record type from describeLayout `recordTypeMappings` ✓.
  - `FlowDefinitionView` (ApiName, ProcessType, TriggerType, IsActive, ActiveVersionId…) ✓.
  - `ApexClass` / `ApexTrigger` (Body has no one-record limit) ✓.
- **New permissions:** none.
- **Privacy and demo:** configuration only, so it works at every level. Validation messages and formulas can contain client text but are configuration, not personal data. Demo uses the fixture.
- **Fixture:** about 25 validation rules with formulas, picklists with record-type-specific values, and the flows and classes from 1.
- **Depends on:** 8, 1. **Effort: M.**

### 13. Impact analysis for cleanup
- **Problem:** "Can we delete this field?" is a frequent, billable question, and the wrong answer breaks production.
- **Approach:** combine
  1. **Salesforce's dependency data** (`MetadataComponentDependency`): Beta ✓, 2,000 rows per Tooling query ✓, 100,000 via Bulk API 2.0 ✓, no ORDER BY / COUNT / OFFSET ✓, reports excluded from Tooling queries ✓. There's no official list of supported types ✓, so coverage is **UNVERIFIED** by type.
  2. **Our own scans:** validation rule formulas, formula fields, flow metadata, Apex bodies, layouts (from 1), report filters where readable. Package sprawl already does supplemental scans because the index is incomplete.
  3. **Field population** (from 2).

  The verdict is **never "safe to delete"**. It is "no references found in: [list of sources checked]; not checked: [list]; populated in 0 of N records (sampled)". It comes with a confidence level, plus a standing note on what isn't checkable: dynamic Apex, string references, external integrations, reports where the index excludes them.
- **Salesforce sources:** as above; Bulk API 2.0 for large orgs ✓.
- **New permissions:** none, **UNVERIFIED** for Bulk API 2.0 query on the Tooling dependency object with our permission set (test in a sandbox).
- **Privacy and demo:** metadata plus aggregate counts, so population needs the aggregates capability at Metadata only. Demo uses the fixture.
- **Fixture:** three cleanup candidates on Account:
  - `Legacy_Region__c`: unused and unreferenced, a strong candidate;
  - `Old_Score__c`: unpopulated but referenced by a validation rule, so not safe;
  - `Fax_Ext__c`: referenced only by an inactive flow.
- **Depends on:** 2, 8, 1. **Effort: L.**

### 14. Change history: Change Risk Radar gaps against Config Workbook
- **Status:** Change Risk Radar already ingests the Setup Audit Trail with blast-radius scoring. Salesforce keeps it **at least 180 days** ✓; `Section` and `Display` can't be filtered in SOQL ✓.
- **Gaps:**
  1. **History beyond 180 days** needs Newton to keep pulled rows. Only snapshots taken while connected (21) extend it, and it's subject to our retention.
  2. **Field-level "what changed"** (old and new value) isn't in the audit trail. Snapshot diffs (21, 9) supply it for synced metadata.
  3. **Export:** the change-history sheet joins the Excel export (11).
  4. Config Workbook's audit trail explorer and risk levels are vendor-documented; any deeper feature parity is **UNVERIFIED**.
- **Effort: S** (export sheet). Everything else is covered by 21 and 9.

## Phase F: differentiators

These four share one **access-delta engine** built on snapshots (21) and effective access: given a set of proposed or observed changes, it computes access gained, lost and kept per user and per object or field.

### 15. What-if simulator (extends Restructure Studio)
- **Problem:** clients won't approve permission changes without knowing who breaks. Today Restructure Studio reports one "access preserved %", which hides who loses what.
- **Approach:**
  - **Staged changes:** assignments, group membership, muting sets, roles and sharing rules, never applied.
  - **Output:**
    - access **gained / lost / kept** per user and per object or field;
    - **users affected**, each with a reason;
    - **remaining paths** that undermine the intended restriction, e.g. removing a set while a group still grants the same access;
    - **effects we can't predict**, stated plainly: Apex in system context, record-level effects of role changes beyond stored shares, managed packages.
  - Replaces the single percentage with this breakdown.
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:** per-user detail hidden at Metadata only (counts by profile and role remain); aliases when masked. Demo works.
- **Fixture:** none beyond 21. Scenario presets for Lumenvale: "remove Legacy Integration Admin", "split Sales Manager Bundle".
- **Depends on:** 21, effective access. **Effort: L.**

### 16. Repair planner (extends Why?)
- **Problem:** "Why can't this user do X, and what's the smallest appropriate change?" Consultants answer this daily, by hand.
- **Approach:**
  - **Options**, ranked by blast radius:
    - reuse an existing set that grants exactly X;
    - create a narrow new set;
    - add to or change a group;
    - remove redundant assignments.
  - **Each option shows:** users affected (via 15), licence requirements, and permission dependencies (e.g. Edit needs Read).
  - **Constraints:** Salesforce's licence and permission-dependency rules aren't fully published as data. The planner uses the dependencies Salesforce exposes and marks the rest **UNVERIFIED**, e.g. a permission set licence a set requires.
  - **Output:** feeds 19 (bundles) and 17 (verification goals).
- **Salesforce sources:**
  - PermissionSetLicense / PermissionSetLicenseAssign (already synced).
  - A permission-dependency source, **UNVERIFIED** (candidates: Tooling `PermissionDependency`; test in a sandbox).
- **New permissions:** none.
- **Privacy and demo:** as 15.
- **Fixture:** a user missing Edit on Opportunity, with three candidate fixes of different blast radius.
- **Depends on:** 15. **Effort: L.**

### 17. Post-change verification and evidence pack
- **Problem:** the positioning promises proof that the work succeeded: excess removed, no alternative path left, required access kept, nothing unexpected added, savings realised. Today none of that is shown.
- **Approach:**
  - **Approved goal:** from 15 or 16, or a manual list, stored as a baseline.
  - **Re-scan:** a new snapshot, then checked against the goal.
  - **Pass / fail per goal line**, with evidence:
    - access removed or kept;
    - no remaining path;
    - unexpected additions, from a diff of everything outside the goal;
    - savings realised, from licence counts before and after, using the savings ledger from 18.
  - **Evidence pack:** a before/after PDF with both snapshot dates. It replaces the old "before/after engagement scorecard" idea.
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:** as 15. The demo uses the "kickoff" and "today" fixture snapshots.
- **Fixture:** the "today" snapshot from 21 implements two goals and misses one: a group still grants the removed access, to show a fail.
- **Depends on:** 21, 15; 18 for savings realised. **Effort: L.**

### 18. License renewal planner
- **Problem:** savings estimates only become money at renewal. Clients need to know what to cut, when, and what's real vs reshuffled.
- **Approach:**
  - **Inputs:** contract rates and **renewal dates** entered per SKU in the Price Book. Salesforce doesn't expose contract terms, so this is manual entry by design.
  - **Usage:** seasonal usage from login history, while available (UNVERIFIED retention; LoginHistory is commonly cited as 6 months). The scheduled collector (P3) extends it.
  - **Reassignment vs reduction:** a freed seat that is needed elsewhere is not a saving.
  - **Savings ledger:** each saving moves from **estimated → approved → realised**, with a single owner per user and licence so no saving is counted twice across recommendations. This fixes today's overlap between the Health Report and License Fit.
  - **Output:** a renewal calendar with recommended counts per SKU.
- **Salesforce sources:**
  - UserLicense / PermissionSetLicense (synced)
  - LoginHistory (synced, subject to privacy)
- **New permissions:** none.
- **Privacy and demo:**
  - Login-based seasonality is unavailable at Metadata only; the planner then uses licence counts only and says so.
  - Demo works from the fixture.
- **Fixture:** renewal dates per SKU, a seasonal pattern (support seats peaking in Q4) and a reassignment case.
- **Depends on:** 25; 21 for realised savings. **Effort: L.**

## Phase G: depth and scale

### 1 (phase 2). Apex and Flow system-context reach
See item 1 above. **Effort: L.**

### 19. Remediation bundles
- **Problem:** approved fixes are re-keyed by hand into the client's release process.
- **Decision (17 Oct):** version 1 is a **downloadable ZIP**, with no GitHub integration.
- **Approach (v1):** for fixes approved in 16 or 17, starting with **permission set changes only**, the ZIP contains:
  - the deployment manifest (`package.xml`, and `destructiveChanges.xml` where needed);
  - the metadata changes;
  - a README with steps, prerequisites (e.g. permission set licences), a rollback note per change, and the before/after access delta from 15.

  It stays behind our approval model (admin-only, recorded consent), and Newton never deploys to Salesforce.
- **Salesforce sources:** Metadata API file formats for PermissionSet and package manifests (generation only, no API call).
- **New permissions:** none.
- **Privacy and demo:** configuration only. Demo bundles carry the demo label in the README and the file name.
- **Fixture:** none beyond 16.
- **Depends on:** 16, 17. **Effort: M.**
- **Later (backlog):** an opt-in GitHub App, see Phase H.

### 22. Anomaly engine
- **Problem:** consultants need anomalies that hold up in front of a client.
- **Approach:**
  - **Peer groups by business role:** department and title families from synced data, with role and profile as fallbacks.
  - **Reviewer feedback and approved exceptions** (from 20 + 10): approved exceptions are **suppressed on repeat**.
  - **Alert-to-action tracking:** the share of anomalies that led to a change in a later snapshot.
  - **"No actionable anomaly found"** is allowed as a result.
  - **Ranking:** the top-2% ranking stays as a ranking aid, not as an alert threshold.
- **Salesforce sources:** none new.
- **New permissions:** none.
- **Privacy and demo:** unchanged.
- **Fixture:** department and title families already exist; add two approved exceptions.
- **Depends on:** 20 + 10, 21. **Effort: L.**

### 9 (v2). Org comparison: layouts, validation rules, picklists, record types
Extends 9 using 1 and 11's metadata. **Effort: L.**

### 28. Security review pack for client security teams
- **Problem:** client security teams block engagements without documentation.
- **Approach:** a generated pack covering:
  - data flow diagram;
  - what is collected at each privacy level;
  - retention and erasure (with the deletion certificate);
  - exact permissions requested, generated from the "Newton Read Only" definition so it can't drift;
  - subprocessors;
  - encryption;
  - a **SOC 2 readiness checklist** stating honestly what's in place and what isn't. **We don't claim SOC 2 compliance.**
  - future, optional integrations and their controls, starting with the GitHub App for remediation bundles (Phase H).
- **Effort: M.** Depends on P1 and P2 security items for its content.

### 29. Large-org sync performance and engagement roles
- **Problem:** sync runs extractions one after another, and every query is single-threaded. Large orgs are slow, and multiple consultants on one engagement share one undifferentiated access level.
- **Approach:**
  - **Sync:** extraction runs in parallel within Salesforce's concurrency limits, with Bulk API 2.0 for large tables (PK chunking is automatic ✓) and incremental sync on snapshots (21).
  - **Engagement roles:** lead, analyst and reviewer, scoped to an engagement. They extend today's org grants.
- **Effort: L.** Depends on 21 for incremental sync.

## Phase H: later backlog (one line each; no detailed plan yet)

| Item | Approach | Effort |
|------|----------|--------|
| Engagement workspace | Comments on findings, evidence requests to the client, sign-off, and versioned deliverables, on top of 20. | L |
| Finding-to-scope builder | **Promoted to Proposal P1** (now phase C2). | — |
| Opt-in content checks | Per-engagement opt-in, recorded like write-back, letting Data Quality read long and rich text fields in transit to count which are populated (values never stored). Needs counsel to update the DPA, privacy, terms and security pages first; until then these fields stay "not counted" (decided 17 Oct). | M |
| 35d. Role hierarchy write-back (plan only) | A separate, opt-in, write-enabled connection per org (never the read-only integration user), needing Manage Roles and Manage Internal Users ✓. An admin approves each apply, recorded in the audit log with the draft's diff. Before applying, Newton snapshots the current hierarchy for rollback (rollback belongs here, not in 35b; it uses 21's snapshots). Sandbox first, then production. Applied leaf-first and serially, off-peak ✓. Portal roles are excluded (not updatable through the API ✓). Nothing is built until this plan is approved. | L |
| GitHub App for remediation bundles | Opt-in per client, scoped to **one repository**; opens **draft pull requests only**, never pushes to the default branch; short-lived installation tokens, never stored in plain text; listed in the security review pack (28) as a future, optional integration. | M |
| Configurable policy packs | Org-specific rules (e.g. "no Modify All Data outside IT") evaluated on each snapshot, versioned per engagement. | M |
| Access review campaigns | Managers attest to their team's access in Newton. Evidence exports for auditors (old roadmap item 4). | L |
| Conflicting-permission checks | Separation-of-duties pairs (e.g. Modify All Data + Author Apex), mapped into SOX and SOC 2 indicators (old item 2). | M |
| Impact graph tied to business processes and owners | Tag objects, flows and integrations with a process and an owner, then show change impact by process. | L |
| Guest and external user assessment | Guest and portal profiles, sharing to guests, public sites, external OWD. | M |
| Integration identity inventory | Every integration user and connected app: owner, scopes, permissions, last use (from 5). | M |
| Agentforce readiness assessment | Data quality, permissions and knowledge coverage for agent use cases; scope after Salesforce's agent APIs settle (UNVERIFIED). | L |
| Package retirement planner | From package sprawl: usage, dependencies (13), licence cost, retirement steps. | M |
| Automation modernization planner | Workflow and Process Builder to Flow migration list with dependencies and risk. | M |
| Org consolidation planner | Multi-org overlap and conflicts from 9, mapping and merge sequence. | XL |
| Capacity forecasting | Storage, API and licence trends from snapshots and P3, with limit dates. | M |
| Performance investigation | Slow pages, triggers and flows from free event logs where available (UNVERIFIED which). | L |
| Natural-language questions | Answers drawn only from collected evidence, citing the finding, snapshot and source; refuses when the evidence doesn't cover the question. | L |
| Cross-engagement benchmarks | Anonymised aggregates only, with opt-in in the engagement letter (old item 9). | M |

---

# Proposals

## Better approaches to items above

1. **Item 3, image pack: rasterise with `pypdfium2` instead of a browser or Poppler.** It's a self-contained wheel, so the Dockerfile needs no system packages, and it keeps the WeasyPrint pipeline as the single renderer: one source of truth for the PDF report and the slides.
2. **Item 5, API usage: don't request Customize Application for OauthToken.** It's elevated, our posture check flags it, and the data it unlocks is a cumulative count per token. The free API Total Usage log plus daily collection (P3) gives a better breakdown with a lower-risk permission (View Event Log Files).
3. **Item 1, Lightning pages: avoid Metadata API retrieve.** Describe and Tooling `CustomApplication.Metadata` cover org defaults and app and profile overrides without extra permissions. A retrieve would push the integration user towards Customize Application-level access.
4. **Item 1 phase 2: use `SymbolTable` for the Apex sharing mode, not Body parsing.** It's structured and reports implicit modifiers ✓. Parse Body only for objects and fields touched, and label those results "potential".
5. **Item 13: never output "safe to delete".** Salesforce's dependency index is Beta with no published type list ✓. Report what was checked, what wasn't, and the population count, with a confidence level. That protects the consultant as well as the client.
6. **Items 6, 9, 15, 16, 17: build two shared engines, not five features.** A **comparison engine** (6 and 9) and an **access-delta engine** (15, 16 and 17), both on snapshots (21). It halves the work and makes results consistent across screens.
7. **Item 18: fix savings double counting now, in the ledger.** The overlap between the Health Report's $59K user lines and License Fit's underused users was found during demo prep. One owner per user and licence, with estimated → approved → realised states, removes the "don't add these two numbers" caveat from every deck.
8. **Item 7: require View All Data only for record access, and say so in onboarding.** Share rows are visible only for parents the integration user can read ✓. Making that explicit avoids a partial tab that looks complete.

## Additional features recommended (8)

| # | Feature | Consulting value | Effort |
|---|---------|------------------|--------|
| **P1** | **Priced roadmap builder** (promoted from "finding-to-scope builder"; **accepted, now phase C2**). Group findings into work packages (e.g. "permission set consolidation", "dormant licence reclaim"). Each package gets an effort range from a firm-level playbook (P2), a price from the firm's rate card, dependencies and sequencing. Export as the closing slides and an SOW appendix. | It's the deliverable the positioning promises: the assessment ends in priced, scoped paid work. Today it's built by hand after every assessment. | L |
| **P2** | **Remediation playbooks per finding type** (**accepted, built with P1**): steps, typical effort range, prerequisites and risks, maintained by the firm and versioned. | Makes P1's pricing consistent across consultants, and turns findings into repeatable delivery. | M |
| **P3** | **Scheduled daily collector ("pulse")** for sources with short retention: API Total Usage (1 day ✓), login history, the Setup Audit Trail (180 days ✓). Runs with client consent during the engagement and stops when it closes. | Trends for API usage and seasonality become possible. The old "ongoing monitoring" item becomes a paid retainer. | M |
| **P4** | **Salesforce Health Check import**: the native security-settings score and risks. Candidate sources: Tooling `SecurityHealthCheck` / `SecurityHealthCheckRisks`, UNVERIFIED. Shown beside our access findings. | One report covers settings (Salesforce's view) and access (ours); clients already know the Health Check score (old item 7). | S-M |
| **P5** | **Target access model designer**: cluster users by actual access and role into personas, propose permission set groups per persona, and show the delta (15) and licence impact (18). | The most valuable design deliverable in access cleanups; today it's done in spreadsheets over weeks. | L |
| **P6** | **Sensitive data exposure map**: for fields flagged sensitive or encrypted (8), how many users can read or edit them and through what. Combined with population (2) and usage, it shows "broadly readable but unused" fields. | A concrete, board-level risk story with a clear fix (tighten field-level security or delete), and it feeds P1. | M |
| **P7** | **Multi-org portfolio view**: for clients with several orgs, one page of health, cost and risk per org, with cross-org licence pooling opportunities. | Opens enterprise and consolidation work; reuses 9 and 18. | M |
| **P8** | **Engagement narrative deck**: extends 3 from images to a full branded deck (executive summary, findings, priced roadmap from P1, next steps) with speaker notes drawn from the evidence. | Cuts the last manual step between assessment and the client meeting. | M |

---

# Salesforce sources checked

Checked in October 2026 against current documentation: API v62 to v68 developer guides, Tooling API and Object Reference PDFs (Winter '27), and the Metadata API, SOQL and REST guides. developer.salesforce.com blocks automated access, so pages were read through the official PDF guides and document endpoints. Anything not found is marked **UNVERIFIED** in the item text and must be tested in a sandbox before we rely on it.

| Topic | Status | Notes |
|-------|--------|-------|
| UserRole object | Confirmed | Fields and create/update properties per the Object Reference (v68). Read needs View Roles and Role Hierarchy; edit needs Manage Roles. Portal roles can't be updated. The doc's properties for ContactAccessForAccountOwner and PortalAccountId are internally inconsistent. Picklist values for the access-for-account-owner fields not listed (UNVERIFIED). |
| User.UserRoleId | Confirmed | Create and update; needs Manage Internal Users (portal users: Manage Customer or External Users). |
| Role metadata type | Partly | `.role`, `roles/`, wildcard; fullName, parentRole, name, description, three access levels, mayForecastManagerShare; no users or portal fields. parentRole's format, in-deploy ordering and description mapping UNVERIFIED. |
| Grant Access Using Hierarchies | Confirmed (not exposed) | Custom objects only; not in CustomObject metadata, the Object Reference or the Tooling API. Group DoesIncludeBosses is a different, group-level setting. Account and Opportunity: checked and greyed out in Sharing Settings (Sharan's developer org, 17 Oct). Which other standard objects don't use hierarchies is still UNVERIFIED. |
| Role limits and recalculation | Confirmed | 5,000 roles (orgs from Spring '21), 500 before; sharing recalculates on hierarchy changes; deferral optional and Support-enabled; large changes: leaf-first, serial, off-peak. |
| API Total Usage event log free tier | Confirmed | Free in supported editions; daily files; 1-day retention; no count field (one row per request); covers REST, SOAP and Bulk. Needs View Event Log Files. |
| OauthToken | Partly | UseCount, LastUsedDate, AppName, UserId documented; Id always null; all tokens visible only with Customize Application; CreatedDate not documented. |
| `/limits` DailyApiRequests | Confirmed | No per-app breakdown. |
| "API Usage Last 7 Days" report via Reports API | **UNVERIFIED** | Not used. |
| ApexOrgWideCoverage, ApexCodeCoverageAggregate, ApexTestRunResult | Confirmed | View Setup and Configuration; coverage refreshes only when tests rerun. |
| SetupEntityAccess for ApexClass and FlowDefinition | Confirmed | FlowDefinition from API 58. |
| Flow `isAdditionalPermissionRequiredToRun`, `RunInMode`; "Run Flows" | Confirmed | Tooling Flow Metadata is one record per query. |
| ApexClass SymbolTable sharing modifiers | Confirmed | Managed-package availability **UNVERIFIED**. |
| MetadataComponentDependency | Confirmed (Beta) | 2,000 rows via Tooling; 100,000 via Bulk API 2.0; reports excluded from Tooling; no supported-type list. |
| ProfileLayout, Layout | Confirmed | Layout assignment is profile-only (move to permission sets cancelled). |
| Lightning page assignments | Partly | Describe actionOverrides (org default); Tooling CustomApplication.Metadata (app and profile overrides); precedence order **UNVERIFIED**; managed-package org defaults not retrievable. |
| CaseShare, ContactShare, LeadShare | Confirmed | Need parent access; sharing sets store no rows; ImplicitChild omitted with faster recalculation; ContactShare under "Controlled by Parent" **UNVERIFIED**. |
| Field describe (type, encrypted, referenceTo, cascadeDelete via ChildRelationship) | Confirmed | Shield vs Classic encryption distinguished. |
| SOQL filter and aggregate limits; `/limits/recordCount` | Confirmed | Long text, encrypted and base64 can't be filtered; recordCount is cached and approximate. |
| SetupAuditTrail | Confirmed | At least 180 days; Section and Display not filterable. |
| ValidationRule, FlowDefinitionView, RecordType, picklists | Confirmed | ValidationRule formula only via one-record Metadata queries. |
| Config Workbook | Confirmed | Third-party AppExchange app (CWB Software Tools); feature list from the vendor's guide. |
| Profile record-type visibility via API without retrieve | **UNVERIFIED** | |
| Permission dependency data | **UNVERIFIED** | |
| Security Health Check via API | **UNVERIFIED** | |
| LoginHistory retention | **UNVERIFIED** | Commonly cited as 6 months. |

## Known technical debt

- Record-level access covers Account and Opportunity only (item 7), and under-reports without saying so until 31 lands.
- The risk score includes the anomaly flag (peer deviation); base risk works around it until 30 is decided.
- Deactivated users remain "active" in snapshots (the User query pulls
  active users only and never marks the rest inactive). Fix with 21.
- Sync runs extractions sequentially; large orgs are slow (item 29).
- The Health Report's "predictive" findings function is a stub.
- Data Quality is refused on demo orgs (fixed by item 2's fixture path).
- Field type and encryption are shown as unknown until item 8.
- The empty-group rule (GROUP_EMPTY) counted every group the sync reads, including role groups. Role, manager and territory groups get their members implicitly, so the check now looks only at public groups (Regular) and queues: PR #22, to merge before phase B. That fix is right either way. Still unconfirmed: whether Salesforce stores GroupMember rows for role groups (and so whether live orgs were actually affected). The read-only GroupMember query wasn't run: Developer Console is retired in Sharan's org.
