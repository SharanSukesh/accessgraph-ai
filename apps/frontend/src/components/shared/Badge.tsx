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
  const baseStyles = 'inline-flex items-center justify-center rounded-full font-medium transition-all duration-150 hover:scale-105'

  const variants = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/40',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/40',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/40',
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
