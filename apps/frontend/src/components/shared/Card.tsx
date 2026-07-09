/**
 * Card Component
 * Container for grouped content
 */

import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated' | 'hero'
  /**
   * Opt-in hover-lift effect (subtle shadow + 1px vertical translate).
   * Standard for clickable cards across the app. Defaults to `false`
   * so existing static cards are not affected.
   */
  interactive?: boolean
  /**
   * Grove — decorate the card corners with two copper L-brackets that
   * push out on hover. Meant for hero / prominent cards; do NOT use
   * everywhere or the accent loses its meaning.
   */
  copperBrackets?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', interactive = false, copperBrackets = false, ...props }, ref) => {
    // Grove — surfaces sit on the warm cream canvas. Instead of stark
    // white, we lean into the Grove surface token (a light cream, or
    // deep forest in dark mode). Borders are the warm cream hairline.
    const variants = {
      default:
        'bg-grove-surface dark:bg-grove-surface-dk shadow-sm ' +
        'transition-all duration-200 ease-out hover:shadow-md',
      bordered:
        'bg-grove-surface dark:bg-grove-surface-dk border border-grove-border dark:border-grove-border-dk shadow-sm ' +
        'transition-all duration-200 ease-out ' +
        'hover:border-primary-600 dark:hover:border-primary-400 hover:shadow-grove-lift',
      elevated:
        'bg-grove-surface dark:bg-grove-surface-dk shadow-grove-lift ring-1 ring-grove-border dark:ring-grove-border-dk ' +
        'transition-all duration-200 ease-out hover:shadow-grove-hero hover:scale-[1.005]',
      // Hero — dark evergreen wash + warm cream ink. Used for the Org
      // Analyzer overview hero, dashboard KPI stack, and other single-
      // most-important surfaces. Copper wash pulls in via ::before.
      hero:
        'bg-primary-700 dark:bg-primary-800 text-grove-canvas ' +
        'border border-primary-800 dark:border-primary-900 shadow-grove-hero ' +
        'grove-copper-wash ' +
        'transition-all duration-240 ease-out hover:shadow-grove-hero',
    }
    const interactiveCls = interactive
      ? 'cursor-pointer grove-hover-lift will-change-transform'
      : ''
    const bracketCls = copperBrackets ? 'grove-brackets' : ''

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl',
          // Hero variant needs relative + overflow-hidden so the copper
          // wash pseudo-element clips to the card shape.
          variant === 'hero' ? 'relative overflow-hidden' : 'overflow-hidden',
          variants[variant],
          interactiveCls,
          bracketCls,
          className,
        )}
        {...props}
      />
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pb-4', className)}
      {...props}
    />
  )
)

CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-xl font-semibold text-grove-ink dark:text-grove-ink-dk', className)}
      {...props}
    />
  )
)

CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1', className)}
    {...props}
  />
))

CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pt-0', className)}
      {...props}
    />
  )
)

CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('p-6 pt-0 flex items-center', className)}
      {...props}
    />
  )
)

CardFooter.displayName = 'CardFooter'
