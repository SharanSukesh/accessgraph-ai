/**
 * Per-client privacy levels: what Newton pulls from a client's Salesforce
 * org and what it keeps. Mirrors app/services/privacy_mode.py.
 */

export type PrivacyMode = 'full' | 'masked' | 'metadata_only'

export const PRIVACY_MODES: PrivacyMode[] = ['full', 'masked', 'metadata_only']

export const PRIVACY_STRICTNESS: Record<PrivacyMode, number> = {
  full: 0,
  masked: 1,
  metadata_only: 2,
}

export const PRIVACY_LEVELS: Record<
  PrivacyMode,
  { label: string; summary: string; detail: string }
> = {
  full: {
    label: 'Full',
    summary: 'Users, login history, Setup Audit Trail and configuration, stored as pulled.',
    detail:
      'Everything Newton reads today: user names, emails and usernames, login history with location and browser, and the Setup Audit Trail including change descriptions.',
  },
  masked: {
    label: 'Masked users',
    summary:
      'Users are pulled but names, emails and usernames are replaced with aliases before storage.',
    detail:
      'Each Salesforce user is stored as a stable alias such as "User 4F2A9C" with their Salesforce ID, so the client can look them up. Login history keeps country only. The Setup Audit Trail keeps who (as an alias) and which section, never the description text.',
  },
  metadata_only: {
    label: 'Metadata only',
    summary: 'Configuration only. No user records, login history or audit trail are pulled.',
    detail:
      'Newton reads objects, fields, permission sets, profiles, automation and other configuration. Nothing about individual people is pulled or stored.',
  },
}

export const AGGREGATES_LABEL = 'Allow aggregate record statistics (counts only)'
export const AGGREGATES_HINT =
  'Record counts, field fill rates and duplicate cluster sizes for Data Quality. Never record values.'

/** What a tightening change removes from data Newton already holds. */
export const TIGHTENING_EFFECTS: Record<Exclude<PrivacyMode, 'full'>, string[]> = {
  masked: [
    'Stored user names, emails and usernames are replaced with aliases, including inside findings, risk explanations and report text',
    'Login-anomaly results that included city or device are deleted; they regenerate with country only',
    'Setup Audit Trail descriptions are deleted; actors become aliases',
    'Equity results and equity recommendations are deleted; they regenerate with aliases',
  ],
  metadata_only: [
    'All stored Salesforce user records are deleted, with risk scores, anomalies, recommendations, licence fit and equity results',
    'Restructure Studio runs, plans and constraints are deleted',
    'Change Risk results (Setup Audit Trail) and record sharing data are deleted',
    'User names are removed from Health Report findings and sprawl inventories',
  ],
}

export const AGGREGATES_REMOVAL_EFFECT =
  'Stored record statistics are deleted: Data Quality scores, record counts, and the Health Report findings based on them'

/** Features a privacy level can switch off. Keys match the backend. */
export type PrivacyFeature =
  | 'users'
  | 'anomalies'
  | 'license_fit'
  | 'equity'
  | 'restructure'
  | 'reporting_graph'
  | 'change_risk'
  | 'data_quality'

interface PrivacyCarrier {
  privacy_mode?: PrivacyMode | null
  allow_record_aggregates?: boolean | null
}

export function privacyModeOf(org: PrivacyCarrier | null | undefined): PrivacyMode {
  const m = org?.privacy_mode
  return m && m in PRIVACY_LEVELS ? m : 'full'
}

export function isFeatureAvailable(
  org: PrivacyCarrier | null | undefined,
  feature: PrivacyFeature,
): boolean {
  const mode = privacyModeOf(org)
  if (mode !== 'metadata_only') return true
  if (feature === 'data_quality') return !!org?.allow_record_aggregates
  return false
}

export function unavailableMessage(mode: PrivacyMode): string {
  return `Not available at the ${PRIVACY_LEVELS[mode].label} privacy level`
}
