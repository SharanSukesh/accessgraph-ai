'use client'

/**
 * A long list inside a card (the standing pagination rule): a summary first
 * (one tab per kind with its count), the first rows of the selected tab,
 * and "View all" for the full paged, searchable list. The selected tab is
 * kept in the URL.
 */

import Link from 'next/link'
import { ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

export const PREVIEW_ROWS = 10

export interface PreviewTab {
  key: string
  label: string
  count: number | null
}

export function usePreviewTab(param: string, tabs: PreviewTab[]): [string, (key: string) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const first = tabs.find((t) => (t.count ?? 0) > 0)?.key ?? tabs[0]?.key ?? ''
  const current = params?.get(param)
  const selected = tabs.some((t) => t.key === current) ? (current as string) : first
  const select = (key: string) => {
    const next = new URLSearchParams(params?.toString() || '')
    next.set(param, key)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  return [selected, select]
}

export function CardListPreview({
  tabs,
  selected,
  onSelect,
  shown,
  viewAllHref,
  children,
  empty,
}: {
  tabs: PreviewTab[]
  selected: string
  onSelect: (key: string) => void
  shown: number
  viewAllHref: string
  children: ReactNode
  empty: string
}) {
  const tab = tabs.find((t) => t.key === selected)
  const count = tab?.count ?? 0
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-2 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={t.key === selected}
            onClick={() => onSelect(t.key)}
            className={
              'rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors ' +
              (t.key === selected
                ? 'bg-primary-700 text-white ring-primary-700 dark:bg-primary-500 dark:text-grove-canvas-dk dark:ring-primary-500'
                : 'text-grove-ink dark:text-grove-ink-dk ring-grove-border dark:ring-grove-border-dk hover:bg-primary-50/50 dark:hover:bg-primary-900/20')
            }
          >
            {t.label} <span className="tabular-nums">{t.count === null ? '–' : t.count.toLocaleString('en-US')}</span>
          </button>
        ))}
      </div>
      {count === 0 ? (
        <p className="py-3 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{empty}</p>
      ) : (
        children
      )}
      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">
          <span>
            Showing {Math.min(shown, count).toLocaleString('en-US')} of {count.toLocaleString('en-US')}
          </span>
          {count > shown && (
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 font-medium text-primary-700 dark:text-primary-300 hover:underline"
            >
              View all {count.toLocaleString('en-US')} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
