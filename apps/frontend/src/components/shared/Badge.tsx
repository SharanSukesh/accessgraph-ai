/**
 * Badge Component
 * Status, severity, and categorical badges
 */

import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-full font-semibold shadow-sm transition-all duration-200 hover:scale-105 hover:shadow-md'

  const variants = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 ring-1 ring-gray-200 dark:ring-gray-600',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 ring-1 ring-emerald-200 dark:ring-emerald-800',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 ring-1 ring-amber-200 dark:ring-amber-800',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30 ring-1 ring-rose-200 dark:ring-rose-800',
    info: 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  )
}

/**
 * Risk Badge - specialized badge for risk levels
 */
export interface RiskBadgeProps extends Omit<BadgeProps, 'variant'> {
  level: 'low' | 'medium' | 'high' | 'critical'
  showLabel?: boolean
}

export function RiskBadge({ level, showLabel = true, ...props }: RiskBadgeProps) {
  const variantMap = {
    low: 'success' as const,
    medium: 'warning' as const,
    high: 'warning' as const,
    critical: 'danger' as const,
  }

  const labels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  }

  return (
    <Badge variant={variantMap[level]} {...props}>
      {showLabel && labels[level]}
    </Badge>
  )
}

/**
 * Severity Badge - specialized badge for anomaly severity
 */
export interface SeverityBadgeProps extends Omit<BadgeProps, 'variant'> {
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export function SeverityBadge({ severity, ...props }: SeverityBadgeProps) {
  const variantMap = {
    low: 'info' as const,
    medium: 'warning' as const,
    high: 'warning' as const,
    critical: 'danger' as const,
  }

  const labels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  }

  return (
    <Badge variant={variantMap[severity]} {...props}>
      {labels[severity]}
    </Badge>
  )
}

/**
 * Status Badge - specialized badge for sync/job status
 */
export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export function StatusBadge({ status, ...props }: StatusBadgeProps) {
  const variantMap = {
    pending: 'default' as const,
    running: 'info' as const,
    completed: 'success' as const,
    failed: 'danger' as const,
  }

  const labels = {
    pending: 'Pending',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
  }

  return (
    <Badge variant={variantMap[status]} {...props}>
      {labels[status]}
    </Badge>
  )
}
