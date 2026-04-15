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
        'p-6 transition-all',
        isClickable && 'cursor-pointer hover:shadow-md hover:border-primary-300',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
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
          <div className={cn('p-3 rounded-lg bg-gray-50 dark:bg-gray-700', iconColor)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </Card>
  )
}
