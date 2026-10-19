# Config Workbook parity matrix

**Purpose.** The Salesforce practice lead wants Newton to replace Config Workbook in our engagements: anything Config Workbook does that we can rebuild well, we build. This matrix lists every feature Config Workbook documents publicly, what Newton already has, and what we'd build, with effort, the Salesforce data needed and any new permission.

**Sources (public only; nothing installed or signed up for), read 19 Oct 2026:**
- **[Site]** the vendor site, configworkbook.com: the features, pricing and product tour pages.
- **[Listing]** the AppExchange listing (v9.15.0, updated 19 Sep 2026).
- **[Guide]** the vendor's public user guide (CWBGuide.pdf).

Config Workbook is a third-party AppExchange app by CWB Software Tools, not a Salesforce product. Feature names below are descriptive, not the vendor's labels. Our designs are our own.

**Salesforce checks.** Object and field names were checked against Salesforce's Object Reference and Tooling API guides (v68, Winter '27). Anything not confirmed is marked UNVERIFIED.

**How the two products differ.** Config Workbook is a native managed package: its data stays in the client org, and it can edit metadata. Newton is a hosted, read-only service with a metadata-only promise, privacy levels and per-client encryption. So:
- we don't build its edit features (Newton never writes metadata; we hand over deployable files instead, in item 19);
- we don't build its debug-log features (they need trace flags, which are writes, and the logs hold record data).

Where both products show the same thing, Newton's version also says **who can reach it**. That's the access analysis Config Workbook doesn't do.

**Legend**
- **Have:** **Yes**, **Partial** or **No**, with where it lives in Newton.
- **Effort:** S (days), M (1-2 weeks), L (2-4 weeks), XL (more than 4 weeks).
- **Decision:**
  - **Build** means a roadmap item, shown in brackets, or new in this doc.
  - **Skip** comes with the reason.
- **New permission:** "none" means Newton's current read-only permission set (API Enabled, View Setup and Configuration, View Roles, View All Users) is enough.

## 1. Documentation exports (Config Workbook: Excel downloads)

| # | Feature [source] | What it does | Have (where) | Decision | Effort | Salesforce data | New permission |
|---|---|---|---|---|---|---|---|
| 1 | Object report with field security by profile [Guide] | Fields per object, with read/edit per profile, buttons and links, formula fields, record types | **Partial.** Field access per profile and permission set is synced (Schema › Fields, user and permission set pages); not in the Excel export; field types unknown | **Build** (8, 11): "Field access matrix" sheet, profiles *and* permission sets *and* groups, plus effective access per user on request | M | FieldPermissions ✓, describe ✓ | none |
| 2 | Object field list [Guide] | Label, API name, data type per field | **Partial.** Fields listed in Schema; type, length, required unknown | **Build** (8, 11) | M | describe (type, length, nillable, calculatedFormula, referenceTo) ✓ | none |
| 3 | Object full detail [Guide][Site] | Picklists, formulas, validation rules, buttons and links, action overrides, list views, field sets, record types, layouts | **Partial.** Record types and layouts per profile (Pages & automation); count of validation rules only | **Build** (11): picklists (incl. per record type), formulas, validation rules with formulas, buttons and links, overrides, list views, field sets | L | describe picklistValues ✓; Tooling ValidationRule (formula in Metadata, one per query) ✓; WebLink ✓; ListView ✓; Tooling FieldSet ✓; describeLayout recordTypeMappings ✓ | none |
| 4 | Field visibility on layouts [Guide] | Which fields appear on which layout | **No** | **Build** (new, joins 11): field × layout matrix, combined with "who gets this layout" so it shows which *people* see a field on screen | M | Tooling Layout ✓ (layout items in Metadata, one per query; UNVERIFIED cap for large orgs) | none |
| 5 | Layout assignments by profile and record type; unused layouts [Guide] | Layout per profile and record type; layouts nobody gets | **Yes** for assignments (Pages & automation, profile pages). **No** for unused layouts | **Build** (S, joins 11/13): "Unused layouts" list | S | ProfileLayout (Tooling) ✓ | none |
| 6 | Who created or last changed objects, fields, validation rules, flows, permission sets, profiles [Guide] | Created by / last modified by, with dates, per component | **Partial.** Setup Audit Trail in Change Risk (180 days) | **Build** (14): per-component created and last-changed, from Tooling CreatedBy/LastModified fields, plus our own snapshot history (21) beyond 180 days. Names follow the privacy level | S | Tooling CustomObject, CustomField, ValidationRule, Flow ✓ (CreatedById, LastModifiedById, LastModifiedDate) | none |
| 7 | Custom metadata records [Guide] | Download records of a custom metadata type | **No** | **Build, opt-in per type** (new): values can hold configuration secrets, so it's off by default and listed in the trust docs | S | Custom metadata types are queryable like sObjects (`__mdt`) ✓ | none |
| 8 | Lightning component code [Guide] | Download component bundles, code in one file | **No** | **Partial build:** inventory only (name, type, API version, last changed). **Skip** code bodies: Newton keeps metadata, not source | S | Tooling AuraDefinitionBundle ✓, LightningComponentBundle ✓ | none |
| 9 | Flow detail [Guide] | Every element of a flow: variables, decisions, record operations, screens, subflows, waits | **Partial.** Flow list with type, trigger, active state and who can run it (Pages & automation, Automation sprawl) | **Build** (11): flow sheet with element counts and the objects and fields each flow reads or writes. That also feeds impact analysis (13) | M | Tooling Flow (Metadata, one per query) ✓; FlowDefinitionView ✓ | none |
| 10 | Permission set field access [Guide] | Read/edit per field across permission sets | **Yes** (permission set pages, Schema › Fields) | **Build** the Excel sheet (11) | S | synced | none |
| 11 | Permission set full detail [Guide] | App visibility, Apex class access, custom permissions, external data sources, field and object permissions, Visualforce page access, record type visibility, tabs, licence | **Partial.** Object, field and system permissions, Apex class and flow access, licence. Missing: app visibility, custom permissions, Visualforce pages, external data sources, record types and tabs per set | **Build** (6, 11): the missing grants, on the permission set page and in the export | M | SetupEntityAccess ✓ (ApexPage, CustomPermission, ConnectedApplication, ExternalDataSource; UNVERIFIED full list of SetupEntityType values); PermissionSetTabSetting ✓; record type visibility per permission set: UNVERIFIED source (none found yet) | none |
| 12 | Permission set assignments [Guide] | Who has each set | **Yes** (permission set and group pages, user pages) | Export sheet only (11) | S | synced | none |
| 13 | Tab visibility per profile and permission set [Guide] | Default on / off / hidden per tab | **No** | **Build** (11) | S | PermissionSetTabSetting ✓ (profiles via their owned permission set) | none |
| 14 | App detail [Guide] | App components, allowed domains, workspace mappings, shortcuts, chat settings, push notifications | **Partial.** Apps read for record page overrides | **Build** a lighter app sheet (11): name, type, navigation, tabs, record page overrides, who can see it. **Skip** the niche console settings (low engagement value) | S | Tooling CustomApplication ✓; AppMenuItem ✓ (UNVERIFIED field coverage) | none |
| 15 | Apex and Visualforce inventory [Guide][Site] | Classes and triggers with coverage, namespace, API version, validity, length, created/modified; Visualforce pages and components | **Partial.** Classes, triggers and coverage (Health Report code coverage). No Visualforce, no API version in the export | **Build** (11): Apex, trigger and Visualforce sheets, plus who can run each class or page | S | ApexClass, ApexTrigger ✓, ApexPage ✓, ApexComponent ✓, ApexCodeCoverageAggregate ✓ | none |
| 16 | Profile detail [Guide] | Object and system permissions, field security, record type and layout assignments, record type visibility, tabs, login IP ranges | **Partial.** Everything but tabs and login IP ranges (Profiles, Pages & automation) | **Build** (11): tabs, login hours and login IP ranges | S | Tooling Profile Metadata (already read for record type visibility) ✓ | none |
| 17 | Profile users and their permission sets [Guide] | Users per profile with their sets | **Yes** (Users, profile pages) | Export sheet (11) | S | synced | none |
| 18 | Approval processes [Guide] | Approval process detail | **No** | **Build** (11, 13): steps, entry criteria and approvers, and which fields they reference | M | ProcessDefinition ✓; full detail via Metadata API ApprovalProcess (UNVERIFIED read path with our permissions) | none (UNVERIFIED) |
| 19 | Static resources [Guide] | Inventory | **No** | **Build** inventory only (11) | S | StaticResource ✓ | none |

## 2. Diagrams and analysis

| # | Feature [source] | What it does | Have (where) | Decision | Effort | Salesforce data | New permission |
|---|---|---|---|---|---|---|---|
| 20 | Object relationship diagram [Site][Listing] | Lookups and master-detail between objects, chosen depth, layouts | **No** | **Build** (12): reuse the access graph's renderer. Focus object and depth; master-detail drawn bold; optional overlay of who can read each object; PNG/SVG and into the image pack | M | describe referenceTo, relationshipName, childRelationships (cascadeDelete) ✓ | none |
| 21 | Dependency explorer [Site] | What a component uses and what uses it, as report, diagram or tree; CSV | **Partial.** Package sprawl's supplemental scans | **Build** (13): dependency view on every object, field, class and flow page, with CSV, and the sources checked and not checked | L | Tooling MetadataComponentDependency (Beta) ✓, 2,000 rows per query ✓ | none (UNVERIFIED: Bulk API 2.0 on it for large orgs) |
| 22 | Field impact analysis [Site][Listing] | Where a field is referenced: workflow, validation rules, approvals, sharing rules, layouts, formulas, Apex, Visualforce | **No** | **Build** (13): dependency index plus our own scans (validation formulas, formula fields, flow metadata, Apex bodies, layouts), plus field population. The verdict lists what was checked and never says "safe to delete" | L | as 21, plus Tooling ValidationRule, Flow, Layout ✓; ApexClass Body ✓ | none |
| 23 | Process map from a debug log or Event Monitoring CSV [Site][Listing] | Visualises a transaction; governor-limit summary | **No** | **Skip.** Debug logs need trace flags (a write) and contain record data; Event Monitoring is a paid add-on. Both break the read-only, metadata-only promise | n/a | n/a | n/a |
| 24 | Debug log analyzer [Listing] | Finds slow steps, silent errors and limit risks in logs | **No** | **Skip**, as 23 | n/a | n/a | n/a |

## 3. Monitoring

| # | Feature [source] | What it does | Have (where) | Decision | Effort | Salesforce data | New permission |
|---|---|---|---|---|---|---|---|
| 25 | Audit trail explorer with risk levels [Site] | Setup Audit Trail with High/Medium/Low risk and filters | **Yes** (Change Risk: blast-radius scoring, filters) | **Build** the export and history gaps (14) | S | SetupAuditTrail ✓ | none |
| 26 | Security and compliance summary [Site] | Failed logins, admin users, public objects, high-risk changes | **Partial.** Login anomalies, compliance scorecards, org-wide defaults, Change Risk, elevated-permission warning on connect | **Build** a one-screen security summary (new, S) linking to the existing modules | S | LoginHistory ✓ (optional, as today), synced data | none |
| 27 | Org limits with health status [Site] | Storage, API, permission sets, platform events, with healthy/warning/critical | **Partial.** Storage findings and API usage in the Health Report | **Build** a full limits table with thresholds (new, S) | S | REST `/limits` ✓ | none |
| 28 | Home dashboard [Site] | Login behaviour, login IP ranges, logins by profile, metadata counts | **Partial.** Overview page; login history in anomalies; metadata counts in the Health Report | **Build** logins by profile and component counts on Overview (S) | S | LoginHistory ✓ (optional), synced | none |
| 29 | Central monitoring [Listing] | Active users, profiles, identity settings, auth providers, code coverage, recent deployments | **Partial.** Users, profiles, auth providers (Integration sprawl), code coverage | **Build** deployments from the Setup Audit Trail's deployment entries. **Skip** DeployRequest: Salesforce requires Modify Metadata or Modify All Data to query it ✓, which we won't ask for | S | SetupAuditTrail ✓ | none |

## 4. Comparison and editing

| # | Feature [source] | What it does | Have (where) | Decision | Effort | Salesforce data | New permission |
|---|---|---|---|---|---|---|---|
| 30 | Org comparator [Site] | Apex, triggers, objects, Visualforce across two orgs | **No** | **Build** (9 v1 and v2): permissions, objects and fields, automation, packages; then layouts, validation rules, picklists, record types. Matched by API name with a mapping screen; shows *consequences* (who gains or loses access), not just differences | XL | snapshots (21) of each org, each through its own connection | none |
| 31 | Profile comparator [Site] | One profile against another, in or across orgs | **No** | **Build** (6, then 9 for across orgs): 2-4 profiles or permission sets, differences only, users affected, CSV | M | synced | none |
| 32 | Metadata update [Site] | Edit validation rules, workflow, object permissions and field security in place | **No** | **Skip** editing: Newton is read-only. We produce deploy-ready bundles and Data Loader files for the client to apply (19), with before-and-after checks (17) | n/a | n/a | n/a |
| 33 | Mass enable/disable of validation and workflow rules [Site] | Bulk switch on or off | **No** | **Skip**, as 32; a bundle (19) can carry the change | n/a | n/a | n/a |

## 5. Platform

| # | Feature [source] | Newton's position |
|---|---|---|
| 34 | Native app; metadata stays in the org [Site][Listing] | Not something to rebuild. Newton's answer is the metadata-only promise, privacy levels (full, masked, metadata only), per-client encryption, audit logs and deletion on request. The security review pack (28) makes that case to client security teams. |
| 35 | Priced per org, unlimited admins [Site] | Commercial, not a feature. |

## Summary

- **35 items** in the public material: 33 features plus 2 platform points.
- **Already have:** 5 Yes, 14 Partial, 14 No. Partial mostly means "we have the data, but not the export or one or two attributes".
- **Build:** 29 of the 33 features, all under the read-only, metadata-only rules. Three of those are lighter by design (#8 inventory without code, #14 without console settings, #29 deployments from the audit trail).
- **Skip:** 4. Debug-log process maps and the debug log analyzer (#23, #24) need writes and record data. Metadata edits and mass enable/disable (#32, #33): Newton is read-only and hands over deployable changes instead.
- **No new integration-user permission** for anything we'd build. Two reads are UNVERIFIED with our current permissions and will be tested in a developer org:
  - the full approval process detail (#18);
  - Bulk API 2.0 on the dependency object for large orgs (#21).

  The opt-in custom metadata export (#7) is off by default and listed in the trust docs when built.

**Where Newton goes further:**
- every sheet and diagram can show who can reach the thing documented;
- cleanup verdicts list what was checked, never "safe to delete";
- comparisons show consequences;
- changes are designed and previewed in Newton, then handed over, with a before-and-after evidence pack.

**Build order** (from the roadmap):
- **Foundations:** API v68, then field metadata (8).
- **Parity:**
  - documentation export (11), which takes #1-#19 here;
  - ERD (12), #20;
  - impact analysis (13), #21-#22;
  - change history (14), #6, #25 and #29;
  - security summary, limits and dashboard additions, #26-#28.
- **Comparison:** snapshots (21), then org comparison v1 (9), #30. Profile comparison (6), #31, follows in its roadmap position.
