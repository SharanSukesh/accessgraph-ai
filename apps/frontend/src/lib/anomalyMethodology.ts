/**
 * How Newton detects anomalies, in words a client can read. Shown on the
 * Anomalies methodology page and summarised on each user's Anomalies tab.
 * Keep in step with apps/backend/app/services/anomaly_detection.py and
 * risk_scoring.py (base risk).
 */

/** Share of active users flagged as access anomalies (DEFAULT_ANOMALY_FRACTION). */
export const FLAGGED_SHARE = 0.02

export function flaggedCount(activeUsers: number): number {
  return Math.max(1, Math.floor(activeUsers * FLAGGED_SHARE))
}

export const ACCESS_SIGNALS: { name: string; detail: string }[] = [
  { name: 'Permission sets', detail: 'How many permission sets are assigned to the user.' },
  { name: 'Permission set groups', detail: 'How many permission set groups are assigned to the user.' },
  { name: 'Objects they can read', detail: 'Objects the user can read, from all their profile and permission set grants.' },
  { name: 'Objects they can edit', detail: 'Objects the user can edit.' },
  { name: 'Objects they can delete', detail: 'Objects the user can delete.' },
  { name: 'Fields they can read', detail: 'Fields the user can read.' },
  { name: 'Fields they can edit', detail: 'Fields the user can edit.' },
  { name: 'Sensitive objects', detail: 'Objects holding personal or financial data the user can access, recognised by name.' },
  { name: 'Sensitive fields', detail: 'Fields such as national ID, date of birth or salary the user can access, recognised by name.' },
  {
    name: 'Permission breadth',
    detail: 'One number for how much the user can change: editable objects, plus deletable objects counted twice, plus editable fields, plus sensitive fields counted three times.',
  },
  { name: 'Days since last login', detail: 'A user who has never logged in counts as dormant for a very long time.' },
  {
    name: 'Access outside their department',
    detail: "The share of the user's objects and fields that belong to another department (Sales, Service, Finance and so on), judged from object names.",
  },
  { name: 'Permissions no one else holds', detail: 'Grants (for example Delete on an object) that only this user has.' },
]

export const ANOMALY_TYPES: { name: string; meaning: string }[] = [
  { name: 'Exclusive access', meaning: 'The user is the only person who holds certain permissions. If the account is lost or disabled, nobody else can do that work.' },
  { name: 'Role mismatch', meaning: "Much of the user's access belongs to another department." },
  { name: 'Permission accumulation', meaning: 'Far more permission sets than peers, often left over from earlier roles.' },
  { name: 'Over-privilege', meaning: 'More edit, delete or sensitive access than peers.' },
  { name: 'Dormant access', meaning: 'Elevated access on an account that has not logged in for a long time.' },
  { name: 'Unusual access', meaning: 'An unusual combination none of the descriptions above fits; the reasons name the signals that stand out.' },
]

export const SESSION_RULES: string[] = [
  'Impossible travel: two successful logins from different countries within 4 hours.',
  'New country: a first login from a country in the last 30 days, for a user who has logged in from other countries before.',
  'New device: a browser and platform combination the user has never logged in from before.',
  'Dormant reactivation: a successful login in the last 7 days after 60 days or more without one.',
  'Brute force followed by success: 5 or more failed logins within 30 minutes, then a successful login.',
]

export const LIMITS: string[] = [
  'Unusual is not the same as wrong. A sole administrator or a deliberately broad integration account will often be flagged; the review confirms whether the access is intended.',
  'A fixed share of users is always flagged, so there is a list even in a well-run org. Rank says how unusual a user is compared with everyone else in this org, not against a fixed standard.',
  'The list is a review queue, not a complete list of risky users. A single, highly privileged user can look ordinary to the detector; the risk score checks privileged permissions, sensitive data, dormancy and sole access separately.',
  'Departments and sensitive data are recognised from object and field names, so custom names that don\'t follow common conventions can be missed.',
  'Everything reflects the org at the last sync. Access granted or removed since then is not included.',
  'The method was chosen by testing it on synthetic Salesforce orgs with planted problems; no client data was used to build or tune it.',
]
