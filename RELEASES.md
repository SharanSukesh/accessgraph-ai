# Releases

Tagged milestones of Newton / AccessGraph AI. Each release is an
annotated git tag on `main` — permanent, immutable, and pushed to
`origin` so the checkpoint is safe from any local branch shenanigans.

## v1.0.0 — first stable release

**Tag:** `v1.0.0`
**Commit:** `de19f77`
**Date:** 2026-07-17

### What's in v1

**Roadmap features shipped:**
1. GAEA Optimal Org Restructure — Restructure Studio
2. Report & Dashboard Sprawl — Sprawl (Reports tab)
3. Automation Zombie Detection — Sprawl (Automations tab)
4. License-to-Persona Fit — License Fit
5. Integration Blast Radius — Sprawl (Integrations tab)
6. Session / Login Anomalies — Anomalies (Session category)
8. Compliance Scorecards — SOX / SOC 2 / HIPAA / GDPR / PCI

**Deferred to v2:**
7. Access Certification / Review Automation (heavy workflow feature)

**Non-roadmap work also in v1:**
- Auth system: `/login`, admin-invited accounts, email activation via Resend
- App-wide IA restructure: 4-section sidebar
  (ATTENTION / EXPLORE / OPTIMIZE / ADMIN)
- Data Quality: aggregate-SOQL methodology
  (COUNT / GROUP BY / SF Duplicate Rules) — fully metadata-only,
  no record content read
- Legal audit: privacy / security / DPA / terms updated to match

---

## How to revert to v1

The tag `v1.0.0` is a permanent pointer at commit `de19f77`. New commits
on `main` never touch it, so you can always come back.

### 1. Look at v1 without changing anything

Detached checkout — inspects v1 read-only, doesn't move `main`:

```sh
git checkout v1.0.0
# ...browse, run, verify...
git switch main            # return to the latest work
```

### 2. Roll `main` back to v1 (destructive)

Use when v1 is the "good known state" and everything after it should
be discarded on this branch.

```sh
git status                 # confirm no uncommitted work you want to keep
git stash -u               # stash anything untracked/modified you DO want
git switch main
git reset --hard v1.0.0
git push --force-with-lease origin main   # only if the remote is safe to rewind
```

**Notes:**
- `--force-with-lease` refuses the push if someone else has moved the
  remote — safer than `--force`. Newton is currently a single-author
  repo so this is a formality, but the habit is worth keeping.
- If v1 is deployed to Railway / Vercel, this alone doesn't roll them
  back — trigger a redeploy of the `v1.0.0` commit in their dashboards
  (or wait for the auto-deploy on the reset push).

### 3. Branch off v1 for a hotfix

Use when you want to patch v1 without disturbing the newer work on
`main`.

```sh
git switch -c hotfix/v1 v1.0.0
# make changes, commit
git push -u origin hotfix/v1
```

Later, if the hotfix should also land on `main`, cherry-pick it:

```sh
git switch main
git cherry-pick <hotfix-commit-sha>
```

### 4. Undo a single bad commit without a full revert

If everything is fine except one commit, prefer this to a hard reset —
it doesn't rewrite shared history:

```sh
git revert <bad-commit-sha>
git push origin main
```

---

## Verifying the tag is intact

Any time you want to confirm v1 is still where it should be:

```sh
# Local
git tag -l -n1 v1.0.0
git show --stat --no-patch v1.0.0

# Remote (GitHub)
git ls-remote --tags origin v1.0.0
```

Both commands should print `de19f77...` as the commit the tag points at.
If they diverge, something rewrote history — investigate before doing
anything else.

---

## Future releases

When a new stable version is cut, add it here as a new top-level
section, tag `main` with `vN.M.P`, and push the tag:

```sh
git tag -a v1.1.0 -m "Release notes here..."
git push origin v1.1.0
```

Keep the revert recipes above unchanged — they generalize to any tag by
substituting the version.
