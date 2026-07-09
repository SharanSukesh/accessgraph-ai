/**
 * Metric Card Component
 * Display key metrics and statistics
 */

import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { Card } from './Card'
import { cn } from '@/lib/utils/cn'
import { useCountUp } from '@/lib/hooks/useCountUp'

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
  iconColor = 'text-primary-700 dark:text-primary-400',
  onClick,
  className,
}: MetricCardProps) {
  const isClickable = !!onClick

  // v1.9: smooth count-up on first mount for numeric values. Strings
  // (pre-formatted "$48.2K" / dates / etc.) render verbatim. The hook
  // bails to the literal target if the user prefers reduced motion.
  const numericTarget = typeof value === 'number' ? value : NaN
  const animatedValue = useCountUp(numericTarget, 800)
  const renderedValue: ReactNode =
    typeof value === 'number'
      ? Number.isFinite(animatedValue)
        ? Math.round(animatedValue).toLocaleString()
        : value
      : value

  return (
    <Card
      variant="bordered"
      className={cn(
        'p-6 transition-all group relative overflow-hidden',
        // Grove — cream surface + evergreen shadow-lift on hover; the
        // hairline border darkens toward evergreen. No purple anywhere.
        isClickable && 'cursor-pointer hover:shadow-grove-lift hover:border-primary-500/50 dark:hover:border-primary-400/50 hover:-translate-y-1',
        className
      )}
      onClick={onClick}
    >
      {/* Grove — copper radial wash from the bottom-right. Sits under
          content and blooms slightly on hover. Warm counterpoint to the
          evergreen brand without competing with it. */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{ background: 'radial-gradient(60% 100% at 100% 100%, rgba(194, 107, 71, 0.10), transparent 65%)' }} />
      {/* Dark mode uses a slightly warmer copper — the mint brand can
          otherwise wash the copper toward yellow. */}
      <div className="hidden dark:block absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{ background: 'radial-gradient(60% 100% at 100% 100%, rgba(216, 121, 74, 0.14), transparent 65%)' }} />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex-1">
          <p className="text-xs font-medium text-grove-ink/70 dark:text-grove-ink-dk/70 uppercase tracking-[0.08em]">
            {title}
          </p>
          {/* Grove signature — numerals in the serif stack. tabular-nums
              keeps the count-up from re-flowing widths. */}
          <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk transition-transform duration-200 group-hover:scale-105 tabular-nums tracking-tight">
            {renderedValue}
          </p>
          {change && (
            <div className="mt-2 flex items-center text-sm">
              <span
                className={cn(
                  'font-medium',
                  change.direction === 'up' && 'text-primary-700 dark:text-primary-400',
                  change.direction === 'down' && 'text-danger-600 dark:text-danger-500',
                  change.direction === 'neutral' && 'text-grove-ink/60 dark:text-grove-ink-dk/60'
                )}
              >
                {change.direction === 'up' && '↑'}
                {change.direction === 'down' && '↓'}
                {change.direction === 'neutral' && '→'}
                {' '}
                {Math.abs(change.value)}%
              </span>
              <span className="ml-2 text-grove-ink/60 dark:text-grove-ink-dk/60">
                {change.label}
              </span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            // Grove — icon tile uses a subtle copper wash instead of the
            // old flat gray. Ring in evergreen for definition; icon
            // itself in evergreen. Scale + rotate on group hover keeps
            // the existing signature micro-interaction.
            'p-3 rounded-xl bg-copper-50 dark:bg-copper-900/20 ring-1 ring-copper-200 dark:ring-copper-800 transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg group-hover:ring-copper-500',
            iconColor
          )}>
            <Icon className="h-6 w-6 transition-transform duration-200 group-hover:rotate-6" />
          </div>
        )}
      </div>
    </Card>
  )
}
