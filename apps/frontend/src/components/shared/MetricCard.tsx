/**
 * Metric Card Component
 * Display key metrics and statistics
 */

import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { Card } from './Card'
import { cn } from '@/lib/utils/cn'

export interface MetricCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    label: string
    direction: 'up' | 'down' | 'neutral'
  }
  icon?: LucideIcon
  iconColor?: string
  onClick?: () => void
  className?: string
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = 'text-primary-600',
  onClick,
  className,
}: MetricCardProps) {
  const isClickable = !!onClick

  return (
    <Card
      variant="bordered"
      className={cn(
        'p-6 transition-all group relative overflow-hidden',
        isClickable && 'cursor-pointer hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-600 hover:-translate-y-1',
        className
      )}
      onClick={onClick}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/0 via-primary-50/0 to-primary-100/0 dark:from-primary-900/0 dark:via-primary-900/0 dark:to-primary-800/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white transition-transform duration-200 group-hover:scale-105">
            {value}
          </p>
          {change && (
            <div className="mt-2 flex items-center text-sm">
              <span
                className={cn(
                  'font-medium',
                  change.direction === 'up' && 'text-green-600 dark:text-green-400',
                  change.direction === 'down' && 'text-red-600 dark:text-red-400',
                  change.direction === 'neutral' && 'text-gray-600 dark:text-gray-400'
                )}
              >
                {change.direction === 'up' && '↑'}
                {change.direction === 'down' && '↓'}
                {change.direction === 'neutral' && '→'}
                {' '}
                {Math.abs(change.value)}%
              </span>
              <span className="ml-2 text-gray-600 dark:text-gray-400">
                {change.label}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('p-3 rounded-lg bg-gray-50 dark:bg-gray-700 transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg', iconColor)}>
            <Icon className="h-6 w-6 transition-transform duration-200 group-hover:rotate-6" />
          </div>
        )}
      </div>
    </Card>
  )
}
