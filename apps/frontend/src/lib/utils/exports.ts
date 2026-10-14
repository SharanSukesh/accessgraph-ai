/**
 * Export Utilities
 * CSV and JSON export helpers
 */

import { anomalyTypeLabel } from '../anomalyTypes'

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV<T extends Record<string, any>>(
  data: T[],
  columns?: Array<{ key: keyof T; label: string }>
): string {
  if (data.length === 0) return ''

  // Determine columns
  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: key }))

  // Build header row
  const headers = cols.map(col => escapeCSVValue(col.label)).join(',')

  // Build data rows
  const rows = data.map(row => {
    return cols
      .map(col => {
        const value = row[col.key]
        return escapeCSVValue(formatCSVValue(value))
      })
      .join(',')
  })

  return [headers, ...rows].join('\n')
}

/**
 * Escape CSV value (handle quotes, commas, newlines)
 */
function escapeCSVValue(value: string): string {
  // Client data opened in Excel: a leading = + - @ would run as a formula.
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Format value for CSV export
 */
function formatCSVValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/**
 * Download CSV file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Export data as CSV
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns?: Array<{ key: keyof T; label: string }>
): void {
  const csv = arrayToCSV(data, columns)
  downloadCSV(csv, filename)
}

/**
 * Download JSON file
 */
export function downloadJSON(data: any, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Export data as JSON
 */
export function exportToJSON(data: any, filename: string): void {
  downloadJSON(data, filename)
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      textArea.remove()
      return successful
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

/** Filename-safe stem, e.g. "Mina Tanaka" -> "mina-tanaka". */
export function fileSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'
}

/** Date stamp for export filenames, e.g. 20261014. */
export function exportStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Export anomalies to CSV, in the order shown (rank 1 first).
 */
export function exportAnomaliesToCSV(anomalies: any[], filename: string = 'anomalies'): void {
  const rows = anomalies.map((a) => ({
    rank: a.rank ?? '',
    user: a.userName ?? a.user_name ?? '',
    category: a.category ?? 'access',
    type: anomalyTypeLabel(a.type) ?? '',
    severity: a.severity,
    score: typeof a.score === 'number' ? a.score.toFixed(3) : '',
    reasons: (a.reasons ?? []).join(' | '),
    detectedAt: a.detectedAt ?? a.detected_at ?? '',
  }))
  exportToCSV(rows, filename, [
    { key: 'rank', label: 'Rank' },
    { key: 'user', label: 'User' },
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type' },
    { key: 'severity', label: 'Severity' },
    { key: 'score', label: 'Anomaly score' },
    { key: 'reasons', label: 'Reasons' },
    { key: 'detectedAt', label: 'Detected at' },
  ])
}

/**
 * Export recommendations to CSV with formatted columns
 */
export function exportRecommendationsToCSV(
  recommendations: any[],
  filename: string = 'recommendations'
): void {
  const rows = recommendations.map((r) => ({
    title: r.title,
    severity: r.severity,
    status: r.status,
    track: r.track ?? '',
    type: r.rec_type ?? r.type ?? '',
    user: (r.affected_access as any)?.user_name ?? r.userName ?? '',
    description: r.description,
    rationale: r.rationale ?? '',
  }))
  exportToCSV(rows, filename, [
    { key: 'title', label: 'Title' },
    { key: 'severity', label: 'Severity' },
    { key: 'status', label: 'Status' },
    { key: 'track', label: 'Track' },
    { key: 'type', label: 'Type' },
    { key: 'user', label: 'User' },
    { key: 'description', label: 'Description' },
    { key: 'rationale', label: 'Rationale' },
  ])
}

/**
 * Export users to CSV with formatted columns
 */
export function exportUsersToCSV(users: any[], filename: string = 'users'): void {
  exportToCSV(users, filename, [
    { key: 'name', label: 'Name' },
    { key: 'username', label: 'Username' },
    { key: 'email', label: 'Email' },
    { key: 'profile', label: 'Profile' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department' },
    { key: 'title', label: 'Title' },
    { key: 'riskLevel', label: 'Risk level' },
    { key: 'riskScore', label: 'Risk score' },
    { key: 'isActive', label: 'Active' },
    { key: 'lastLoginDate', label: 'Last login' },
  ])
}

/**
 * Export graph data to JSON
 */
export function exportGraphToJSON(graph: any, filename: string = 'graph'): void {
  exportToJSON(graph, filename)
}
