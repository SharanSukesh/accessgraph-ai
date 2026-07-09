/**
 * Error State Component
 * Display errors with retry option
 */

import { AlertCircle } from 'lucide-react'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
        <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
        {title}
      </h3>
      <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 max-w-md mb-6">
        {message}
      </p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  )
}
