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
    // Grove Refined — default/bordered/elevated compose the v2-card
    // treatment (layered warm shadow, 1rem radius, hairline border).
    // Hero keeps the v1 dark-evergreen wash: page content inside hero
    // cards is styled for light-on-dark and must not flip.
    const variants = {
      default: 'v2-card',
      bordered:
        'v2-card hover:border-primary-600/60 dark:hover:border-primary-400/60 hover:shadow-grove-lift',
      elevated: 'v2-card shadow-grove-lift hover:shadow-grove-hero hover:scale-[1.005]',
      hero:
        'rounded-2xl bg-primary-700 dark:bg-primary-800 text-grove-canvas ' +
        'border border-primary-800 dark:border-primary-900 shadow-grove-hero ' +
        'grove-copper-wash ' +
        'transition-all duration-240 ease-out hover:shadow-grove-hero',
    }
    const interactiveCls = interactive
      ? variant === 'hero'
        ? 'cursor-pointer grove-hover-lift will-change-transform'
        : 'cursor-pointer v2-card-lift will-change-transform'
      : ''
    const bracketCls = copperBrackets ? 'grove-brackets' : ''

    return (
      <div
        ref={ref}
        className={cn(
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
      // Grove Refined — section titles in the serif display stack.
      className={cn('v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk', className)}
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
