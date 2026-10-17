/**
 * Display names for anomaly types. Access anomalies are typed by their
 * strongest reason; "excessive_permissions" only appears on rows detected
 * before typing existed.
 */
export const ANOMALY_TYPE_LABELS: Record<string, string> = {
  exclusive_access: 'Exclusive access',
  role_mismatch: 'Role mismatch',
  permission_accumulation: 'Permission accumulation',
  over_privilege: 'Over-privilege',
  dormant_access: 'Dormant access',
  unusual_access: 'Unusual access',
  session_anomaly: 'Session',
  excessive_permissions: 'Excessive permissions',
}

/** Types offered in the Anomalies filter (legacy type left out). */
export const ANOMALY_TYPE_FILTERS = [
  'exclusive_access',
  'role_mismatch',
  'permission_accumulation',
  'over_privilege',
  'dormant_access',
  'unusual_access',
  'session_anomaly',
] as const

export function anomalyTypeLabel(type?: string | null): string | null {
  if (!type) return null
  return ANOMALY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}

/** "#1 of 400" — the user's place in the detector's ranking. */
export function rankLabel(rank?: number | null, total?: number | null): string | null {
  if (!rank) return null
  return total ? `#${rank} of ${total.toLocaleString('en-US')}` : `#${rank}`
}

/** "Base risk: High", or null when the user has no score yet. Base risk is
 * the risk score calculated without the anomaly flag. */
export function baseRiskLabel(level?: string | null): string | null {
  if (!level) return null
  return `Base risk: ${level.charAt(0).toUpperCase()}${level.slice(1).toLowerCase()}`
}

/**
 * One line for an access anomaly: "#3 of 400 · Permission accumulation · Base risk: High".
 * Rank says how unusual, the reason says why, and base risk (risk without the
 * anomaly flag) says how much damage. Access anomalies carry no severity.
 */
export function anomalySummary(a: {
  rank?: number | null
  usersScored?: number | null
  type?: string | null
  baseRiskLevel?: string | null
}): string {
  return [rankLabel(a.rank, a.usersScored), anomalyTypeLabel(a.type), baseRiskLabel(a.baseRiskLevel)]
    .filter(Boolean)
    .join(' · ')
}
