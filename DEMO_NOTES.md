# Demo hardening notes (branch `demo-hardening`)

## Baseline (before any changes, 2026-10-14)

| Check | Result |
|---|---|
| Backend `pytest` (apps/backend) | 266 passed, 9 skipped |
| Frontend `npm run type-check` | clean |
| Frontend `npm run lint` | 0 errors, 6 warnings (pre-existing) |
| Frontend `npx vitest run --passWithNoTests` | no test files, exit 0 |
| Frontend `npm run build` | compiled successfully |

## 0. Local demo seed

`apps/backend/scripts/seed_local_demo.py` creates a local admin login and a
demo org (`is_demo`) from a committed fixture, then runs the sync, analysis,
Health Report and License Fit. It refuses to run unless
`NEWTON_LOCAL_SEED=1` and `DATABASE_URL` is SQLite or a localhost database.
`SEED_FIXTURE=synthetic_mid_market` (default, Lumenvale, 400 users) or
`SEED_FIXTURE=acme` (8 users).

```bash
docker run -d --rm --name newton-pg-local -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=newton -p 55439:5432 postgres:16-alpine
cd apps/backend
export DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton JWT_SECRET_KEY=local NEWTON_LOCAL_SEED=1
.venv/bin/alembic upgrade head
.venv/bin/python scripts/seed_local_demo.py
# API (PDF needs Homebrew Pango; don't start it with nohup, which drops DYLD_*):
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib .venv/bin/python -m uvicorn app.main:app --port 8000
# Frontend: cd apps/frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 npx next dev -p 3000
```

Login: `admin@newton-demo.com` / `Local-demo-only-1` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

## 1. PDF health report

Verified two ways on 2026-10-14:
- Local API (macOS, WeasyPrint with Homebrew Pango): log in, then
  `GET /orgs/{id}/org-analyzer/report.pdf` gives a 6-page PDF for the seeded demo org.
- Production-style container: built `apps/backend/Dockerfile` from a `git archive`
  of this branch (what Railway sees), ran it against Postgres. It ran migrations on
  boot, served the API, accepted a login and returned the same 6-page PDF with
  DejaVu fonts embedded.

Fixed while checking: the cover's health band now uses the analyzer's labels
(Excellent / Good / Needs attention / Concerning / Critical), and the executive
summary no longer calls an org "production" when its type is unknown.

### What production needs
- Backend service builder = **Dockerfile** (Railway: backend service, Settings,
  Build, Builder), root directory `apps/backend`, Dockerfile path `Dockerfile`.
- **No custom start command** (clear it if one was set for Nixpacks). The
  Dockerfile CMD runs `scripts/run_migrations.py` (alembic upgrade head) then
  uvicorn on `$PORT`.
- System libraries, already in the Dockerfile: `libpango-1.0-0`,
  `libpangoft2-1.0-0`, `libharfbuzz0b`, `fonts-dejavu-core`. Nothing else needed.
- No new environment variables.
- Not viable: the repo's `nixpacks.toml` fails to build locally (`pip: command
  not found`), even before any of these changes, and installs no Pango/fonts.
  Railpack would need `RAILPACK_DEPLOY_APT_PACKAGES` for the same libraries
  (untested).
- How to tell it's broken: Download PDF returns 503 "PDF generation
  unavailable", and the logs say "PDF rendering libraries missing" or that
  WeasyPrint could not load `libgobject`/Pango.

**Railway build settings (handled by the owner on `main` before Thursday's merge):** backend service, Settings, Build: Builder = Dockerfile, root directory `apps/backend`, Dockerfile path `Dockerfile`, no custom start command. Rollback: switch the builder back to its previous value and redeploy.

## 2. Permission set group muting (item 1)

- `effective_access.py` now evaluates each grant source separately: the
  profile, each directly assigned permission set, and each group. A group
  contributes the union of its non-muting components minus what its muting set
  mutes; muting never removes a permission granted by another source.
  This mirrors `risk_scoring.py`'s `bundle()`.
- Explain (`/users/{id}/explain/object/{obj}`): a muting set is never a grant
  source. Each path has `granted_via` and `muted: [{permission, muted_by}]`,
  and the steps end with "Muted: Edit by muting permission set ...".
- Tests: `tests/test_effective_access_muting.py` (group mute removes edit;
  the profile's edit survives; field read muting; explain reporting).
- Demo fixture: "Sales Manager PSG Muting" mutes Account Edit and Delete in
  Sales Manager PSG. Alice keeps Account Edit (from her profile) and loses
  Account Delete (it came only from the group).
- Also fixed: the Health Report's "permission sets with zero assignees" rule
  counted sets used through groups, muting sets and group aggregate sets as
  unused. On the fixture this removes a false finding (3 to 2 findings).
- Shift on the fixture, old code vs new: only Alice's access changes (objects
  she can delete, 4 to 3). Anomaly scores and flagged users are unchanged.
  Risk scores are unchanged, because the risk scorer already applied muting.
- To verify on real data: create a permission set group with a muting
  permission set in the dev org and sync. The code assumes Salesforce reports
  muting sets as PermissionSet with Type "Muting", like the rest of the
  codebase. Unverified against a live org.

## Anomaly flagging (after step 3 review)

The detector flags exactly the top 2% of active users by ensemble score
(k = max(1, int(0.02 × users))). The old `score > 0.5` path is gone; on
min-max-normalised rank averages it admitted about half the org, and the
reason templates had been acting as the real filter. A top-k user is
never dropped: users with no role or profile peers are compared against
the whole org, and a fallback reason names the features that put them in
the top 2%. New reason templates: exclusive access, last login,
cross-department access.

## 4. Demo org in production (admin only)

- Admin → **Demo orgs** (`/admin/demo-orgs`): create "Lumenvale Systems
  (Demo)" from `fixtures/synthetic_mid_market.json`, or the 8-user Acme
  fixture. Creating it runs the normal sync on the fixture. Then run the
  Health Report and License Fit from the org as usual.
- Guardrails:
  - `is_demo=True` plus `settings.demo_fixture`. Sync always loads the
    fixture for a demo org, whatever `DEMO_MODE` says.
  - The OAuth callback refuses a connection linked to a demo org; new
    connections always create real orgs.
  - Health Report and License Fit read licences, edition, limits and
    ownership from the fixture's `demo_live` section. Data Quality, the
    four Sprawl tabs and Change Risk refuse demo orgs (greyed out in the
    sidebar). Every Salesforce write refuses.
  - "Demo data" badge in the top bar and the org list. The PDF has a cover
    banner, "DEMO DATA" in every page footer, and a `demo-` filename prefix.
  - Delete from the same admin page. It refuses non-demo orgs and uses the
    same erasure as Privacy → delete all data.
- Fallback (local): `NEWTON_LOCAL_SEED=1 JWT_SECRET_KEY=local
  DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton
  .venv/bin/python scripts/seed_local_demo.py` (from `apps/backend`;
  `SEED_FIXTURE=acme` for the small one). `DEMO_MODE` is no longer needed.
- Before the demo, the Demo orgs page also lists any older `is_demo` orgs
  already in production, so check it once after the merge.

## Graph, exports, explain, Excel (step 6)

- Access graph: a group assignment shows the group node (its edges are the
  group's net access) with its component sets ("includes") and its muting
  set (red, "mutes"). Production groups need a **re-sync after deploy**:
  the sync now reads `PermissionSetAssignment.PermissionSetGroupId`, which
  links Salesforce's aggregate permission set back to its group. Until
  then the dev org shows the group node without its components.
- Object cards show effective access across all sources; a field's Edit
  is greyed out (with a tooltip) when the object is Read only.
- CSV export on Anomalies, Users and Priority Actions; PNG and JSON on the
  Graph Explorer and the user Graph tab.
- "Why?" on each Object Access row shows the access paths, including what
  a muting set removed.
- Health Report → **Download Excel**: Summary, Findings, License Fit,
  Anomalies, User Risk, Sprawl Summary, Data Quality. Sheets for modules
  that haven't run say "not run yet". Needs `openpyxl` (in requirements).

## Verification (2026-10-14, local, Lumenvale, headless Chrome)

Checked: Dashboard, Users, Anomalies, Noor Whitlock's graph (Sales Manager
Bundle with its muting set) and Why? on Opportunity, graph PNG, Health
Report, License Fit, Compliance, Sprawl, Admin → Demo orgs, user compare,
Record Access, the PDF (9 pages) and the Excel workbook. No browser console
errors after login.

Fixed after the first pass: the Users list returns every user, highest
risk first (risk badge and score shown, sort, search and risk filter work);
the Dashboard counts all users and the high/critical ones; user pages show
Last Login; anomalies are typed by their strongest reason (Exclusive
access, Role mismatch, Permission accumulation, Over-privilege, Dormant
access) with their rank ("#1 of 400") next to the score; the anomaly type
filter and search work; Record Access and Equity are greyed out for demo
orgs.

Still worth knowing live:
- Graph: object cards appear only after ticking objects in the right panel.
- Access anomalies have no severity: each shows rank, strongest reason and
  base risk (the risk score without the anomaly flag; hover for the
  tooltip). All 8 are High overall partly because being flagged adds to
  the risk score; base risk leaves that out (roadmap item 30).
- Mina Tanaka, Oskar Holloway and Freya Castellan (planted over-privileged /
  role mismatch) are typed Permission accumulation: their strongest signal
  in the data is 5-6 permission sets against a median of 1.
- Sprawl, Data Quality, Change Risk, Equity and Record Access are greyed out
  for the demo org; show them on the dev org.

## Thursday runbook

No migrations in this branch: alembic head is `f2c8d4a6b1e9` on both `main`
and `demo-hardening`, and `app/domain/models.py` is unchanged. New data is
JSON only (`organizations.settings.demo_fixture`, `PermissionSetGroupId` in
assignment `raw_data`), which the old code ignores, so rolling back to the
previous deploy needs no database step. Only new dependency: `openpyxl`.
No new environment variables; leave `NEXT_PUBLIC_ENABLE_V2` unset.

**Before merging**
1. Note the current production deployment of both Railway services
   (Deployments tab) for rollback.
2. Tag what's live: `git fetch origin && git tag -a pre-demo-2026-10-15 origin/main -m "Production before demo-hardening" && git push origin pre-demo-2026-10-15`.
3. Backend service, Settings, Build: Builder = **Dockerfile**, root directory
   `apps/backend`, Dockerfile path `Dockerfile`, no custom start command.
   Confirm the last deploy of `main` built with it and Download PDF works on
   an existing org.

**Merge and deploy**
4. Merge `demo-hardening` into `main` (PR, then merge) and push. Both
   services redeploy. In the backend build log, check `openpyxl` installs and
   migrations report nothing to do.
5. Smoke test: `/health`, log in, open a client org, open the Health Report.

**Set up the demo**
6. Admin → Demo orgs → Create **Lumenvale Systems (Demo)**. Creating it
   runs the sync, and the sync runs anomaly detection, risk scoring and
   recommendations at its end. Wait until the sidebar spinner stops and
   the Dashboard shows "Completed" with 400 users / 40 high-risk / 8
   flagged anomalies. Never click "Analyze Access", "Reload demo data" or "Sync"
   while a sync is running (the button is now hidden and the API refuses,
   but don't rely on it).
7. On Lumenvale, one at a time, each after the previous finishes:
   Health Report → Run analysis; License Fit → Re-analyse; Compliance →
   Run indicators for SOX, SOC 2, HIPAA, GDPR and PCI DSS. Do not run
   Equity on Lumenvale (greyed out; the fixture has no sharing data).
   Expected: Dashboard 400 users, 40 high-risk, 8 flagged anomalies,
   7 recommendations (2 High, 4 Medium, 1 Low: Freya Castellan's
   permission set review); Health 35 (Critical), 12 findings,
   $183,180/yr; License Fit $116,220/yr; anomalies #1 Jun Jovanovic
   (Exclusive access) to #8, with "At high or critical base risk" 4
   (#2-#5; #1, #6, #7 and #8 are Medium base risk); SOX control
   "Flagged access anomalies on high base-risk users are triaged" fails
   with 4.
8. Dev org: **Sync from Salesforce** first (needed for the group/muting
   graph) and wait for it to finish; it includes the anomaly, risk and
   recommendation analysis, so don't click "Analyze Access" afterwards.
   Then, one at a time: Health Report, Data Quality, the four Sprawl tabs,
   License Fit, Compliance (five frameworks), Equity, Change Risk.
9. Logos: Admin → Users → firm branding (firm logo); Health Report → Report
   branding on each demo org (client logo).
10. Download the PDF and the Excel once per org and open both. Lumenvale's
    PDF has the Demo data banner and DEMO DATA in each footer.
11. Walk the demo path: Anomalies (Jun Jovanovic first, Fatima Abernathy sixth: the
    two sole-access users), Noor Whitlock → Graph (tick Opportunity and Account), Object
    Access → Why? on Opportunity (Delete muted), Health Report, License Fit,
    Download PDF / Excel.

**Rollback**
- Fast: Railway → each service → Deployments → the deployment noted in
  step 1 → Redeploy. No database step.
- Code: `git revert -m 1 <merge commit>` on `main` and push (redeploys).
  Don't force-push `main`; the tag from step 2 marks the old state.
- Before rolling back, delete Lumenvale (Admin → Demo orgs): the old code
  doesn't recognise demo orgs and would print its PDF without the banner.
- Builder trouble: switch the builder back and redeploy the step-1
  deployment; PDF download is then unavailable.

## Backlog (not before Friday)

Nothing open: the earlier items were fixed in phase A. The product backlog is in
SECURITY_AND_TRUST_ROADMAP.md.
