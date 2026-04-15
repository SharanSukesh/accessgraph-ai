/**
 * Loading Skeleton Component
 * Animated loading placeholders
 */

import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circle' | 'rect'
}

export function Skeleton({ className, variant = 'rect', ...props }: SkeletonProps) {
  const variants = {
    text: 'h-4 rounded',
    circle: 'rounded-full',
    rect: 'rounded-lg',
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-gray-200 dark:bg-gray-700',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

/**
 * Card Loading Skeleton
 */
export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 space-y-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

/**
 * Table Loading Skeleton
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12" variant="circle" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Metric Card Loading Skeleton
 */
export function MetricCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
      <Skeleton className="h-4 w-1/2 mb-4" />
      <Skeleton className="h-8 w-1/3" />
    </div>
  )
}

/**
 * Full Page Loading
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-1/3 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>
      <CardSkeleton />
    </div>
  )
}
