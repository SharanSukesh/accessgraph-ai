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
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex-shrink-0">
          <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
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
