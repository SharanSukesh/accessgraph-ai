# AccessGraph AI Salesforce Package

Salesforce package that integrates with [AccessGraph AI](https://accessgraph-ai-production.up.railway.app) for permission analysis and security insights.

## Package Contents

- **Lightning App** (`AccessGraph_AI`) — adds the AccessGraph AI app to App Launcher
- **Custom Tab** (`AccessGraph_Home`) — entry point inside the app
- **Lightning Web Component** (`accessGraphHome`) — status dashboard with sync trigger
- **Apex Classes** — `AccessGraphConnector` (HTTP layer + LWC API), `AccessGraphPostInstall` (install handler)
- **Custom Hierarchy Setting** (`AccessGraph_Settings__c`) — stores API endpoint, Org ID, sync state
- **Connected App** — OAuth integration with the AccessGraph AI backend (full package only)
- **Permission Set** (`AccessGraph_Admin`) — grants access to the app, tab, and Apex
- **Custom Notification Type** (`AccessGraph_Welcome`) — bell-icon welcome on install
- **Remote Site Setting** — whitelists the AccessGraph AI backend URL

## What Customers See After Install

1. Bell-icon notification: "Welcome to AccessGraph AI"
2. Welcome email with link to the web dashboard
3. App Launcher → "AccessGraph AI" tab (auto-assigned via PermissionSet)
4. Tab opens to a single page showing connection status, anomaly/recommendation counts, last sync info, "Sync Now" button, and "Open Full Dashboard" link out to the web app

The web app at `accessgraph-ai-production.up.railway.app` is where the deep work happens — this package is a launchpad inside Salesforce.

---

## Development Setup

### Prerequisites

- Salesforce CLI (`sf`) v2+ installed
- Authenticated Dev Hub: `sf org login web --set-default-dev-hub --alias devhub`
- Dev Hub has "Unlocked Packages and Second-Generation Managed Packages" enabled

### Two-Manifest Approach (important!)

This package uses **two manifest files** because the Connected App can't be deployed to scratch orgs without special permission:

| Manifest | Use For |
|----------|---------|
| `manifest/package.xml` | Full package version creation (`sf package version create`) — includes Connected App |
| `manifest/scratch-package.xml` | Scratch org deploys — excludes Connected App |

### Deploy to Scratch Org

```bash
# Create a scratch org
sf org create scratch --definition-file config/project-scratch-def.json --alias accessgraph-test --duration-days 7 --no-track-source

# Deploy using scratch manifest (excludes Connected App)
sf project deploy start --manifest manifest/scratch-package.xml --target-org accessgraph-test

# Assign permission set so you can see the app
sf org assign permset --name AccessGraph_Admin --target-org accessgraph-test

# Open the org
sf org open --target-org accessgraph-test
```

Then in the open org: App Launcher → AccessGraph AI.

### One-Time Manual Step: Email Deliverability

Scratch orgs default to "system email only" deliverability, which prevents the welcome email from being sent. To enable email testing:

1. In the scratch org: **Setup → Email → Deliverability**
2. Set **Access level** to **All email**
3. Click **Save**

This is per-scratch-org and not something we can configure via package metadata.

The bell-icon notification works regardless of email deliverability settings.

### Run Apex Tests

```bash
sf apex run test --target-org accessgraph-test --code-coverage --result-format human --wait 10
```

Expected: 20 tests pass, ≥75% org-wide coverage.

### Manual Smoke Test

After deploy, verify in the scratch org:

1. Open App Launcher → "AccessGraph AI" tab loads
2. Page renders: connection badge, last sync info, three count tiles, two buttons
3. Click "Sync Now" → spinner → toast → counts refresh
4. Click "Open Full Dashboard" → opens the web app in a new tab
5. Set `AccessGraph_Settings__c.API_Endpoint__c` to an invalid URL → page shows "Backend not reachable" banner instead of crashing

### Create Package Version

```bash
sf package version create --package "AccessGraph AI" --installation-key-bypass --code-coverage --wait 30 --target-dev-hub devhub
```

This uses the full `package.xml` (via `sfdx-project.json`) which includes the Connected App.

The output gives you a Subscriber Package Version Id (`04t...`) and an installation URL.

### Test the Created Package Version

```bash
# Fresh scratch org for clean install test
sf org create scratch --definition-file config/project-scratch-def.json --alias accessgraph-fresh --duration-days 7 --no-track-source

# Install the new package version
sf package install --package <04t-id-from-above> --target-org accessgraph-fresh --no-prompt --wait 10

# Verify Apex tests pass in the installed package
sf apex run test --target-org accessgraph-fresh --code-coverage --result-format human --wait 10
```

After install, the post-install handler should:
- Create the `AccessGraph_Settings__c` org default record
- Auto-assign the `AccessGraph_Admin` permission set to the installer (queued via `@future`)
- Send a bell-icon notification
- Send a welcome email (if deliverability is enabled)

---

## Migrating to Managed Package (for AppExchange)

The current package is **Unlocked** (no namespace). For AppExchange distribution, it must become a **Managed Package** with a registered namespace.

### Steps

1. Create a separate Developer Edition org (NOT a Dev Hub) at https://developer.salesforce.com/signup
2. In that new org: Setup → Package Manager → Namespace Settings → register your namespace
3. Authorize the namespace org with the CLI: `sf org login web --alias namespace-org`
4. Update `sfdx-project.json` with the registered namespace
5. Create a managed package: `sf package create --name "AccessGraph AI" --description "..." --package-type Managed --path force-app --target-dev-hub devhub`
6. Create a version: `sf package version create --package "AccessGraph AI" --installation-key-bypass --wait 30 --target-dev-hub devhub`

**No code or metadata changes needed** — the namespace is auto-applied by Salesforce when the package is created. LWC Apex imports (`@salesforce/apex/AccessGraphConnector.getOrgSummary`) work in both unlocked and managed packages.
