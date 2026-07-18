/**
 * v2 UI — shared mock dataset.
 *
 * One fictional client org ("Meridian Industries") whose numbers are
 * consistent across every v2 mock page, so clicking through the site
 * feels like a real engagement, not lorem ipsum. No API calls — the
 * v2 tree is a visual prototype; when the design is approved these
 * constants get swapped for the real hooks.
 *
 * Numbers deliberately mirror the product's deal-winning hooks:
 *   "9,203 of 12,847 reports are zombies", "$186K/yr license savings",
 *   "3 users had impossible-travel logins — one is your VP of Finance".
 */

export const ORG = {
  id: 'demo',
  name: 'Meridian Industries',
  edition: 'Enterprise Edition',
  instance: 'NA224',
  connectedAt: '2026-06-02',
  lastSync: '2026-07-17 06:40 UTC',
  users: 1247,
  activeUsers: 1180,
  profiles: 89,
  permissionSets: 412,
  permissionSetGroups: 36,
  roles: 57,
  objects: 438,
  customObjects: 112,
  fields: 9840,
}

// ---------------------------------------------------------------- people

export const PEOPLE = [
  { id: 'u01', name: 'Priya Sharma', title: 'VP of Finance', dept: 'Finance', profile: 'Finance Manager', risk: 87, lastLogin: '2h ago', licenses: 'Sales Cloud', anomaly: true },
  { id: 'u02', name: 'Marcus Webb', title: 'Sales Director', dept: 'Sales', profile: 'Sales Manager', risk: 42, lastLogin: '31m ago', licenses: 'Sales Cloud', anomaly: false },
  { id: 'u03', name: 'Elena Vasquez', title: 'Systems Admin', dept: 'IT', profile: 'System Administrator', risk: 91, lastLogin: '12m ago', licenses: 'Salesforce', anomaly: true },
  { id: 'u04', name: 'Tomás Ribeiro', title: 'Support Lead', dept: 'Support', profile: 'Service Agent', risk: 28, lastLogin: '1h ago', licenses: 'Service Cloud', anomaly: false },
  { id: 'u05', name: 'Aisha Okafor', title: 'RevOps Analyst', dept: 'Operations', profile: 'Operations Analyst', risk: 55, lastLogin: '3h ago', licenses: 'Sales Cloud', anomaly: false },
  { id: 'u06', name: 'Dan Kowalski', title: 'Marketing Manager', dept: 'Marketing', profile: 'Marketing User', risk: 33, lastLogin: '2d ago', licenses: 'Marketing Cloud', anomaly: false },
  { id: 'u07', name: 'Grace Liu', title: 'CS Manager', dept: 'Customer Success', profile: 'Success Manager', risk: 24, lastLogin: '4h ago', licenses: 'Service Cloud', anomaly: false },
  { id: 'u08', name: 'Robert Fields', title: 'Contract Admin', dept: 'Legal', profile: 'Contract Manager', risk: 68, lastLogin: '94d ago', licenses: 'Salesforce', anomaly: true },
]

// ---------------------------------------------------------------- overview

export const OVERVIEW = {
  healthScore: 68,
  healthTrend: [61, 62, 60, 64, 66, 65, 68],
  totalSavings: 214800,
  criticalFindings: 3,
  openAnomalies: 24,
  syncFreshnessHours: 14,
  quickStats: {
    zombieReports: 9203,
    dormantAutomations: 87,
    unusedPackages: 9,
    staleIntegrations: 12,
  },
}

// ---------------------------------------------------------------- attention

export const PRIORITY_ACTIONS = [
  { id: 'pa1', track: 'security', severity: 'critical', title: 'Revoke Modify All Data from 3 non-admin users', detail: 'Elena Vasquez, Robert Fields + 1 more hold Modify All Data via the legacy "Data Migration" permission set.', source: 'Anomaly engine', effort: 'Low', impact: 'High' },
  { id: 'pa2', track: 'security', severity: 'high', title: 'Investigate impossible-travel login for VP of Finance', detail: 'Priya Sharma logged in from Frankfurt and Singapore 2.1h apart on Jul 14.', source: 'Session anomalies', effort: 'Low', impact: 'High' },
  { id: 'pa3', track: 'right-size', severity: 'high', title: 'Downgrade 34 Sales Cloud licenses to Platform', detail: '34 users only touch custom objects — $89,760/yr recoverable.', source: 'License Fit', effort: 'Medium', impact: 'High' },
  { id: 'pa4', track: 'equity', severity: 'medium', title: 'Grant Case read to Customer Success team', detail: 'CS is the most access-disadvantaged group (equity 0.31 vs org 0.61).', source: 'Equity engine', effort: 'Low', impact: 'Medium' },
  { id: 'pa5', track: 'hygiene', severity: 'medium', title: 'Deactivate 12 broken automations', detail: 'Flows referencing deleted fields are failing silently on Opportunity saves.', source: 'Automation sprawl', effort: 'Medium', impact: 'Medium' },
  { id: 'pa6', track: 'hygiene', severity: 'low', title: 'Archive 9,203 zombie reports', detail: 'Unviewed in 12+ months. Reduces sprawl and speeds folder search.', source: 'Report sprawl', effort: 'High', impact: 'Low' },
]

export const ANOMALIES = {
  total: 24,
  critical: 2,
  high: 7,
  affectedUsers: 19,
  access: [
    { id: 'an1', user: 'Elena Vasquez', severity: 'critical', score: 0.96, category: 'access', type: 'OVER_PRIVILEGED', reason: 'Holds 3.4× the object-edit breadth of peer admins; includes 14 finance objects outside IT scope.' },
    { id: 'an2', user: 'Robert Fields', severity: 'critical', score: 0.93, category: 'access', type: 'DORMANT_POWERFUL', reason: 'No login for 94 days while retaining Modify All Data + API Enabled.' },
    { id: 'an3', user: 'Aisha Okafor', severity: 'high', score: 0.81, category: 'access', type: 'ROLE_MISMATCH', reason: 'Operations analyst with delete access on Campaign hierarchy — 0 peers share this grant.' },
    { id: 'an4', user: 'Dan Kowalski', severity: 'medium', score: 0.64, category: 'access', type: 'SOLE_ACCESS_RISK', reason: 'Only user with edit on Invoice__c approval fields.' },
  ],
  session: [
    { id: 'sn1', user: 'Priya Sharma', severity: 'high', score: 0.95, category: 'session', type: 'IMPOSSIBLE_TRAVEL', reason: 'Frankfurt → Singapore in 2.1h (Jul 14). Both sessions authenticated successfully.' },
    { id: 'sn2', user: 'Marcus Webb', severity: 'high', score: 0.9, category: 'session', type: 'BRUTE_FORCE_SUCCESS', reason: '7 failed logins in 22 minutes followed by a success (Jul 11, 03:14 UTC).' },
    { id: 'sn3', user: 'Robert Fields', severity: 'medium', score: 0.7, category: 'session', type: 'DORMANT_REACTIVATION', reason: 'First login in 94 days, from a previously unseen device.' },
    { id: 'sn4', user: 'Tomás Ribeiro', severity: 'low', score: 0.55, category: 'session', type: 'NEW_COUNTRY', reason: 'First login from Portugal in 30 days; prior activity only from Brazil.' },
  ],
}

export const CHANGE_RISK = {
  windowDays: 30,
  totalChanges: 156,
  tiers: { critical: 4, high: 18, medium: 51, low: 83 },
  topChanges: [
    { id: 'cr1', action: 'Changed OWD on Opportunity from Private to Public Read/Write', actor: 'evasquez@meridian.com', when: 'Jul 15, 14:02', blast: 92, tier: 'critical', touches: '1,247 users · 84K records' },
    { id: 'cr2', action: 'Added "Modify All Data" to Data Migration permission set', actor: 'evasquez@meridian.com', when: 'Jul 12, 09:44', blast: 88, tier: 'critical', touches: '3 assignees' },
    { id: 'cr3', action: 'Deactivated validation rule Opportunity.Amount_Required', actor: 'mwebb@meridian.com', when: 'Jul 10, 16:20', blast: 71, tier: 'high', touches: 'All Opportunity writes' },
    { id: 'cr4', action: 'Installed package "DocuSign eSignature" v12.4', actor: 'evasquez@meridian.com', when: 'Jul 8, 11:03', blast: 66, tier: 'high', touches: '19 objects · 4 profiles' },
    { id: 'cr5', action: 'Created new Connected App "Zapier Integration"', actor: 'aokafor@meridian.com', when: 'Jul 5, 13:37', blast: 58, tier: 'medium', touches: 'API scope: full' },
  ],
  dailyActivity: [3, 7, 4, 12, 8, 5, 2, 9, 14, 6, 4, 8, 3, 5, 11, 7, 2, 4, 6, 9, 3, 5, 8, 12, 4, 2, 7, 5, 3, 6],
}

// ---------------------------------------------------------------- optimize

export const HEALTH = {
  score: 68,
  categories: [
    { name: 'License Waste', score: 54, findings: 9, savings: 186300 },
    { name: 'Config Bloat', score: 61, findings: 12, savings: 0 },
    { name: 'Automation Hygiene', score: 58, findings: 8, savings: 0 },
    { name: 'Sharing Posture', score: 72, findings: 6, savings: 0 },
    { name: 'Storage & Limits', score: 81, findings: 3, savings: 12400 },
    { name: 'Data Quality', score: 74, findings: 5, savings: 0 },
    { name: 'User Activity', score: 66, findings: 3, savings: 16100 },
    { name: 'Predictive', score: 77, findings: 1, savings: 0 },
  ],
  topFindings: [
    { id: 'f1', severity: 'critical', category: 'Sharing Posture', title: 'Opportunity OWD is Public Read/Write', description: 'Every user can edit every opportunity — including closed-won records feeding commission calcs.', action: 'Set OWD to Private + add role-based sharing rules', savings: null },
    { id: 'f2', severity: 'critical', category: 'License Waste', title: '67 users inactive 90+ days still hold full licenses', description: 'Combined annual spend of $114,900 on seats with zero logins this quarter.', action: 'Freeze accounts, reclaim licenses at renewal', savings: 114900 },
    { id: 'f3', severity: 'critical', category: 'Automation Hygiene', title: '12 flows failing silently on Opportunity saves', description: 'Reference deleted fields; errors are swallowed by fault paths.', action: 'Fix references or deactivate flows', savings: null },
    { id: 'f4', severity: 'high', category: 'Config Bloat', title: '214 permission sets assigned to zero users', description: 'Orphaned grants from the 2024 org merge still reference retired teams.', action: 'Archive unassigned permission sets', savings: null },
    { id: 'f5', severity: 'high', category: 'License Waste', title: '34 Sales Cloud seats used only for custom objects', description: 'Platform licenses cover this usage at 1/3 the cost.', action: 'Downgrade to Platform at renewal', savings: 89760 },
  ],
}

export const EQUITY = {
  index: 0.61,
  potential: 0.78,
  disparity: 0.42,
  vips: 14,
  disadvantaged: 'Customer Success',
  groups: [
    { name: 'IT', utility: 0.92, users: 34 },
    { name: 'Sales', utility: 0.81, users: 412 },
    { name: 'Finance', utility: 0.74, users: 96 },
    { name: 'Operations', utility: 0.66, users: 121 },
    { name: 'Marketing', utility: 0.52, users: 88 },
    { name: 'Support', utility: 0.44, users: 265 },
    { name: 'Customer Success', utility: 0.31, users: 164 },
  ],
  recommendations: [
    { id: 'eq1', action: 'Grant Case read+edit to Customer Success via new PS "CS Core"', gain: '+0.09 index', users: 164 },
    { id: 'eq2', action: 'Add Support to Knowledge sharing rule', gain: '+0.05 index', users: 265 },
    { id: 'eq3', action: 'Extend Report folder access to Marketing analysts', gain: '+0.03 index', users: 31 },
  ],
}

export const RESTRUCTURE = {
  moves: 38,
  simulated: { equityBefore: 0.61, equityAfter: 0.78, psBefore: 412, psAfter: 289, rolesBefore: 57, rolesAfter: 44 },
  sampleMoves: [
    { id: 'm1', type: 'MERGE_PERMISSION_SETS', title: 'Merge "Sales Ops 2023" + "Sales Ops Legacy" into "Sales Ops"', score: 94, blast: 'Low', users: 89 },
    { id: 'm2', type: 'RETIRE_PS', title: 'Retire 214 zero-assignment permission sets', score: 91, blast: 'None', users: 0 },
    { id: 'm3', type: 'ROLE_FLATTEN', title: 'Collapse 4 single-child role chains under Sales', score: 82, blast: 'Medium', users: 156 },
    { id: 'm4', type: 'ROLE_MERGE', title: 'Merge "Support T1 East" + "Support T1 West"', score: 76, blast: 'Medium', users: 118 },
  ],
}

export const SPRAWL = {
  packages: { total: 28, active: 14, underused: 5, unused: 9, items: [
    { name: 'DocuSign eSignature', tier: 'active', usage: '412 users · daily', installed: '2024-03' },
    { name: 'Conga Composer', tier: 'underused', usage: '3 users · monthly', installed: '2022-11' },
    { name: 'MapAnything', tier: 'unused', usage: '0 opens in 14 months', installed: '2021-06' },
    { name: 'Pardot Connector (legacy)', tier: 'unused', usage: 'Superseded by MC connector', installed: '2019-02' },
  ]},
  reports: { total: 12847, live: 2914, zombie: 9203, orphaned: 512, duplicate: 218, items: [
    { name: 'Monthly Pipeline Review', tier: 'duplicate', usage: '6 near-identical copies across 4 folders', owner: 'Marcus Webb' },
    { name: 'Q3 2022 Forecast — FINAL v7', tier: 'zombie', usage: 'Last viewed 14 months ago', owner: 'departed user' },
    { name: 'Exec Dashboard — Daily', tier: 'live', usage: '52 subscribers · viewed hourly', owner: 'Aisha Okafor' },
    { name: 'Lead Source ROI (orphaned)', tier: 'orphaned', usage: 'Owner deactivated 2024-08', owner: '—' },
  ]},
  automations: { total: 340, active: 201, dormant: 87, broken: 12, orphaned: 40, items: [
    { name: 'Opportunity Stage Sync', tier: 'broken', usage: 'References deleted field Stage_Detail__c', type: 'Flow' },
    { name: 'Lead Assignment Round-Robin', tier: 'active', usage: 'Fires ~400×/day', type: 'Flow' },
    { name: 'Case Escalation (2021)', tier: 'dormant', usage: '0 fires in 6 months', type: 'Workflow Rule' },
    { name: 'Territory Realignment Batch', tier: 'orphaned', usage: 'Owner left in 2024', type: 'Apex Trigger' },
  ]},
  integrations: { total: 47, healthy: 29, stale: 12, broken: 3, unknown: 3, items: [
    { name: 'Zapier Integration', tier: 'stale', usage: 'No API calls in 6 months · full scope', type: 'Connected App' },
    { name: 'Snowflake Sync', tier: 'healthy', usage: '2.1M calls/mo · scoped', type: 'Named Credential' },
    { name: 'Legacy SOAP Endpoint', tier: 'broken', usage: 'Cert expired 2026-05', type: 'Remote Site' },
    { name: 'Okta SSO', tier: 'healthy', usage: 'All logins', type: 'Auth Provider' },
  ]},
}

export const LICENSE_FIT = {
  annualSavings: 186300,
  candidates: 87,
  skus: [
    { sku: 'Sales Cloud EE', seats: 620, monthly: 165, overbuilt: 34, inactive: 41, savings: 138360 },
    { sku: 'Service Cloud EE', seats: 429, monthly: 165, overbuilt: 11, inactive: 18, savings: 35640 },
    { sku: 'Platform Plus', seats: 138, monthly: 100, overbuilt: 0, inactive: 8, savings: 9600 },
    { sku: 'Marketing Cloud', seats: 60, monthly: 400, overbuilt: 2, inactive: 0, savings: 2700 },
  ],
  personas: [
    { persona: 'Right-sized', count: 1005, pct: 81 },
    { persona: 'Overbuilt', count: 47, pct: 4 },
    { persona: 'Wrong cloud', count: 21, pct: 2 },
    { persona: 'Underused', count: 40, pct: 3 },
    { persona: 'Inactive but billed', count: 67, pct: 5 },
    { persona: 'Unknown', count: 67, pct: 5 },
  ],
}

export const COMPLIANCE = {
  frameworks: [
    { key: 'SOX', label: 'SOX 404', score: 78, passed: 18, failed: 5, na: 0, blurb: 'IT General Controls — Access Management' },
    { key: 'SOC2', label: 'SOC 2', score: 81, passed: 13, failed: 3, na: 1, blurb: 'Trust Services — CC6 Logical Access' },
    { key: 'HIPAA', label: 'HIPAA', score: 64, passed: 9, failed: 5, na: 2, blurb: 'Security Rule §164.308 / §164.312' },
    { key: 'GDPR', label: 'GDPR', score: 88, passed: 15, failed: 2, na: 0, blurb: 'Article 32 — Security of Processing' },
    { key: 'PCI', label: 'PCI DSS', score: 71, passed: 12, failed: 5, na: 1, blurb: 'Requirements 7 / 8 / 10' },
  ],
  sampleControls: [
    { id: 'SOX-404-ITGC-3.1', name: 'Terminated user access is revoked', status: 'failed', metric: '67 inactive users still hold access', section: 'Access Management' },
    { id: 'SOX-404-ITGC-3.2', name: 'Critical access anomalies are triaged', status: 'failed', metric: '2 critical anomalies unresolved', section: 'Access Management' },
    { id: 'SOX-404-ITGC-3.3', name: 'Access authorised by documented approver', status: 'passed', metric: 'All 1,180 active users have a manager', section: 'Access Management' },
    { id: 'SOX-404-ITGC-3.4', name: 'Least-privilege maintained', status: 'passed', metric: '1.9% over-permissioned (≤5% tolerance)', section: 'Access Management' },
    { id: 'SOX-404-ITGC-3.5', name: 'Evidence refreshed within 30 days', status: 'passed', metric: 'Health Report refreshed 2 days ago', section: 'Evidence Freshness' },
  ],
}

// ---------------------------------------------------------------- schema & permissions

export const SCHEMA_OBJECTS = [
  { name: 'Account', label: 'Account', custom: false, records: 84200, fields: 142, quality: 81 },
  { name: 'Opportunity', label: 'Opportunity', custom: false, records: 156800, fields: 168, quality: 62 },
  { name: 'Contact', label: 'Contact', custom: false, records: 231400, fields: 129, quality: 77 },
  { name: 'Case', label: 'Case', custom: false, records: 412600, fields: 96, quality: 84 },
  { name: 'Invoice__c', label: 'Invoice', custom: true, records: 96400, fields: 61, quality: 71 },
  { name: 'Project__c', label: 'Project', custom: true, records: 12800, fields: 88, quality: 58 },
]

export const PERMISSION_SETS = [
  { id: 'ps1', label: 'Sales Ops', api: 'Sales_Ops', type: 'Regular', assignees: 89, profileOwned: false },
  { id: 'ps2', label: 'Data Migration', api: 'Data_Migration', type: 'Regular', assignees: 3, profileOwned: false, risky: true },
  { id: 'ps3', label: 'CS Core (proposed)', api: 'CS_Core', type: 'Regular', assignees: 0, profileOwned: false },
  { id: 'ps4', label: 'Finance Reporting', api: 'Finance_Reporting', type: 'Group', assignees: 96, profileOwned: false },
  { id: 'ps5', label: 'API Integration User', api: 'API_Integration', type: 'Regular', assignees: 7, profileOwned: false },
]

export const DATA_QUALITY = {
  avg: 74,
  objects: SCHEMA_OBJECTS.map(o => ({ name: o.label, score: o.quality })),
}

// ---------------------------------------------------------------- helpers

export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return `$${Math.round(cents).toLocaleString('en-US')}`
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`
  return `${n}`
}
