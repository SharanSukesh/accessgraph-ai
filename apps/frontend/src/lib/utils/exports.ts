/**
 * Export Utilities
 * CSV and JSON export helpers
 */

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

/**
 * Export anomalies to CSV with formatted columns
 */
export function exportAnomaliesToCSV(anomalies: any[], filename: string = 'anomalies'): void {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'severity', label: 'Severity' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'userName', label: 'User' },
    { key: 'detectedAt', label: 'Detected At' },
  ]

  exportToCSV(anomalies, filename, columns)
}

/**
 * Export recommendations to CSV with formatted columns
 */
export function exportRecommendationsToCSV(
  recommendations: any[],
  filename: string = 'recommendations'
): void {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: 'Title' },
    { key: 'severity', label: 'Severity' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Description' },
    { key: 'action', label: 'Recommended Action' },
  ]

  exportToCSV(recommendations, filename, columns)
}

/**
 * Export users to CSV with formatted columns
 */
export function exportUsersToCSV(users: any[], filename: string = 'users'): void {
  const columns = [
    { key: 'salesforceUserId', label: 'User ID' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'profile', label: 'Profile' },
    { key: 'role', label: 'Role' },
    { key: 'riskLevel', label: 'Risk Level' },
    { key: 'isActive', label: 'Active' },
    { key: 'lastLoginDate', label: 'Last Login' },
  ]

  exportToCSV(users, filename, columns)
}

/**
 * Export graph data to JSON
 */
export function exportGraphToJSON(graph: any, filename: string = 'graph'): void {
  exportToJSON(graph, filename)
}
