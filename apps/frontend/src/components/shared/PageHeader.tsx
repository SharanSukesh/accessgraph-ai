/**
 * Page-level header primitive: eyebrow + serif display title + subtitle
 * + actions row (Grove Refined, ported from the /v2 prototype).
 *
 * Backwards compatible: `icon` is still accepted and renders as a
 * compact tile when no eyebrow is given (existing call sites keep
 * working untouched). Pages opt into the v2 look by adding an
 * `eyebrow` string — the icon then moves inline with the eyebrow.
 */
import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  /** Mono uppercase micro-label above the title, e.g. "Optimize · spend". */
  eyebrow?: string
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        {!eyebrow && (
          <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800 flex-shrink-0">
            <Icon className="h-6 w-6 text-primary-700 dark:text-primary-400" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="v2-micro flex items-center gap-1.5 text-copper-600 dark:text-copper-400">
              <Icon className="h-3.5 w-3.5" />
              {eyebrow}
            </p>
          )}
          <h1
            className={`v2-display font-semibold text-grove-ink dark:text-grove-ink-dk truncate ${
              eyebrow ? 'mt-2 text-4xl' : 'text-3xl'
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 max-w-xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}
