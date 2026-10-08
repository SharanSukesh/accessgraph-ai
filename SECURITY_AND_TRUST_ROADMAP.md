# Newton: Security, Trust and Product Roadmap

Newton is our in-house tool for client Salesforce engagements. Clients let
us connect to their production orgs, so **client safety, data protection
and legal clarity come before features**. This file is the single list of
what is done, what must happen before the next client engagement, and
what comes after. Update it as items land.

Client-facing setup guide: [docs/CLIENT_ONBOARDING_SECURITY.md](docs/CLIENT_ONBOARDING_SECURITY.md)

## Principles

1. **Least privilege everywhere.** Read-only integration user, minimal
   OAuth scopes, per-org access for our own staff.
2. **Nothing changes in a client org without explicit, recorded consent.**
3. **Hold as little client data as possible, for as short as possible,**
   and delete it provably when the engagement ends.
4. **Every action is attributable** to a named person and audit-logged.
5. **Our legal pages describe what the code actually does.** If they
   diverge, the code or the page is a bug.

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

## P0: before the next client engagement

| # | Item | Why |
|---|------|-----|
| 1 | Add "Manage user data via APIs (api)" to the Connected App's selected scopes and remove "Full access". | Newton now requests `api refresh_token`; Salesforce rejects scopes the app doesn't allow. |
| 2 | **MFA (TOTP) for all Newton accounts**, required for admins. | A stolen consultant password currently opens every granted client org. |
| 3 | Password reset flow, "sign out everywhere", and session revocation on password change or role change (token version on OrgUser). | Today sessions live 7 days and can't be revoked individually. |
| 4 | Shorter sessions: 12-hour absolute, 2-hour idle for admins. | Reduces the impact of a stolen session. |
| 5 | Deployable "Newton Read Only" permission set (metadata plus a one-command `sf` deploy) matching the onboarding guide. | Removes manual setup errors at the client. |
| 6 | Verify against a real org which features work with the read-only user (LoginHistory, View All Data trade-offs) and record it in the guide. | Set accurate expectations with clients. |
| 7 | Confirm `DATABASE_ENCRYPTION_KEY` is set in production and write a key-rotation runbook. | Tokens must be encrypted at rest. |
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

## Product roadmap (client value; none of this is native to Salesforce)

1. **Access drift:** "who gained what since the last sync, through which
   permission set or profile". Requires versioned snapshots.
2. **Separation-of-duties rules:** toxic permission combinations (e.g.
   Modify All Data + Author Apex, Export Reports + View All Data), mapped
   into the SOX and SOC 2 scorecards.
3. **What-if impact:** preview who loses or gains access before changing
   a permission set, group or profile (extends Restructure Studio).
4. **Access reviews and certification:** managers attest to their team's
   access; evidence exports for auditors.
5. **Fixes as deployable metadata:** generate `package.xml`,
   `destructiveChanges.xml` and permission-set changes for the client's
   own release process, instead of writing directly.
6. **Before/after engagement scorecard:** baseline at kickoff compared
   with the end of the engagement, to show the value delivered.
7. **Salesforce Health Check score pulled in,** so one report covers
   security settings and who has access.
8. **Ongoing monitoring:** scheduled syncs with an email digest of new
   risk (new admin grants, new connected apps, off-hours changes).
9. **Cross-engagement benchmarks:** anonymised aggregates only, with
   explicit client opt-in in the engagement letter.

## Known technical debt

- Record-level access covers Account and Opportunity only.
- Deactivated users remain "active" in snapshots (the User query pulls
  active users only and never marks the rest inactive).
- Sync runs extractions sequentially; large orgs are slow.
- The Health Report's "predictive" findings function is a stub.
- Effective access ignores permission-set-group muting (the risk scorer
  handles it separately).
