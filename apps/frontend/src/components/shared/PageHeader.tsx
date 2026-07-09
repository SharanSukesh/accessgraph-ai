/**
 * Page-level header primitive: icon + title + subtitle + actions row.
 * Used as the reference adoption on the Org Analyzer page (other
 * pages keep their existing headers — migration is opt-in).
 *
 * The icon block matches the size + colour ramp the Org Analyzer page
 * was already using (10x10 rounded-lg indigo tile) so visual continuity
 * holds for existing screenshots.
 */
import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800 flex-shrink-0">
          <Icon className="h-6 w-6 text-primary-700 dark:text-primary-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
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
