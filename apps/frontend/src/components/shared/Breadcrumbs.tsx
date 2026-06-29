/**
 * Breadcrumbs — used on nested detail pages to keep navigation context
 * visible right under the <PageHeader>. The last crumb is unlinked
 * and bold; earlier crumbs are subtle links back to their parent list.
 *
 * Purely presentational; accepts `crumbs` as a prop so the parent
 * page chooses what to show.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  crumbs: Crumb[]
  className?: string
}

export function Breadcrumbs({ crumbs, className }: BreadcrumbsProps) {
  if (!crumbs || crumbs.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex items-center text-xs text-gray-500 dark:text-gray-400 -mt-2',
        className,
      )}
    >
      <ol className="flex items-center gap-1.5 min-w-0">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li
              key={`${c.label}-${i}`}
              className="flex items-center gap-1.5 min-w-0"
            >
              {i > 0 && (
                <ChevronRight
                  className="h-3 w-3 text-gray-300 dark:text-gray-600 flex-shrink-0"
                  aria-hidden
                />
              )}
              {isLast || !c.href ? (
                <span
                  className={cn(
                    'truncate',
                    isLast
                      ? 'font-semibold text-gray-900 dark:text-gray-100'
                      : '',
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="truncate hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors duration-150"
                >
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
