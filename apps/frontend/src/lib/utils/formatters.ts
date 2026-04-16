/**
 * Formatting Utilities
 * Date, number, and data formatting helpers
 */

import { RISK_LEVELS } from '../constants'

/**
 * Format date to readable string
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'

  try {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d)
  } catch {
    return '-'
  }
}

/**
 * Format date and time to readable string
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-'

  try {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '-'
  }
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '-'

  try {
    const d = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
    if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? 's' : ''} ago`
    if (diffDay < 365) return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) !== 1 ? 's' : ''} ago`
    return `${Math.floor(diffDay / 365)} year${Math.floor(diffDay / 365) !== 1 ? 's' : ''} ago`
  } catch {
    return '-'
  }
}

/**
 * Format number with commas
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format percentage
 */
export function formatPercentage(num: number | null | undefined, decimals: number = 1): string {
  if (num === null || num === undefined) return '0%'
  return `${num.toFixed(decimals)}%`
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Format risk score (0-100) to risk level
 */
export function formatRiskScore(score: number | null | undefined): {
  level: 'low' | 'medium' | 'high' | 'critical'
  label: string
  color: string
} {
  if (score === null || score === undefined) {
    return RISK_LEVELS.LOW
  }

  if (score >= RISK_LEVELS.CRITICAL.threshold) return RISK_LEVELS.CRITICAL
  if (score >= RISK_LEVELS.HIGH.threshold) return RISK_LEVELS.HIGH
  if (score >= RISK_LEVELS.MEDIUM.threshold) return RISK_LEVELS.MEDIUM
  return RISK_LEVELS.LOW
}

/**
 * Format duration in milliseconds to readable string
 */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '0s'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string | null | undefined, maxLength: number = 50): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.substring(0, maxLength)}...`
}

/**
 * Format API name to readable label
 * e.g., "Account__c" -> "Account"
 */
export function formatApiName(apiName: string | null | undefined): string {
  if (!apiName) return ''
  return apiName.replace(/__c$/, '').replace(/_/g, ' ')
}

/**
 * Format permission type to readable string
 */
export function formatPermission(permission: string | null | undefined): string {
  if (!permission) return ''
  return permission
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Format currency
 */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string = 'USD'
): string {
  if (amount === null || amount === undefined) return '$0.00'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Pluralize word based on count
 */
export function pluralize(word: string, count: number): string {
  if (count === 1) return word

  // Simple pluralization rules
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies'
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es'
  }
  return word + 's'
}

/**
 * Format count with unit
 */
export function formatCount(count: number, unit: string): string {
  return `${formatNumber(count)} ${pluralize(unit, count)}`
}
