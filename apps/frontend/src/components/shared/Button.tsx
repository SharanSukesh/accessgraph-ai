/**
 * Button Component
 * Reusable button with variants
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95'

    const variants = {
      // Grove — primary uses the evergreen ramp; secondary uses the cream
      // surface with a warm hairline ring; ghost dissolves into the ground.
      primary: 'bg-primary-700 text-grove-canvas hover:bg-primary-800 focus:ring-primary-500 hover:shadow-grove-lift dark:bg-primary-600 dark:hover:bg-primary-500',
      secondary: 'bg-grove-surface text-grove-ink hover:bg-primary-50 focus:ring-primary-500 dark:bg-grove-surface-dk dark:text-grove-ink-dk dark:hover:bg-primary-900/25 ring-1 ring-grove-border dark:ring-grove-border-dk hover:shadow-grove-lift hover:ring-primary-300 dark:hover:ring-primary-700',
      ghost: 'bg-transparent text-grove-ink dark:text-grove-ink-dk hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300 focus:ring-primary-500 shadow-none',
      danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500 hover:shadow-lg hover:shadow-danger-500/30',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
