'use client'

/**
 * The standing pagination control: "Showing 1–25 of 403", previous and
 * next, jump to page, and a page size of 25, 50 or 100. Paging is done by
 * the server; this only changes the list state (see lib/list).
 */

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGE_SIZES, PageSize, rangeLabel } from '@/lib/list/listState'

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: PageSize) => void
  label?: string
}

const btn =
  'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium ring-1 ring-grove-border dark:ring-grove-border-dk ' +
  'text-grove-ink dark:text-grove-ink-dk hover:bg-primary-50/50 dark:hover:bg-primary-900/20 disabled:opacity-40 disabled:cursor-not-allowed'
const field =
  'rounded-md px-2 py-1 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk ' +
  'text-grove-ink dark:text-grove-ink-dk'

export function Pagination({ page, pageSize, total, onPage, onPageSize, label = 'rows' }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const [jump, setJump] = useState(String(page))
  useEffect(() => setJump(String(page)), [page])
  const go = (p: number) => onPage(Math.min(pages, Math.max(1, p)))

  return (
    <nav
      aria-label={`Pages of ${label}`}
      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-grove-ink/75 dark:text-grove-ink-dk/75"
    >
      <span aria-live="polite">{rangeLabel(page, pageSize, total)}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span>Rows per page</span>
          <select
            aria-label="Rows per page"
            className={field}
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value) as PageSize)}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
        </button>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const n = parseInt(jump, 10)
            if (!Number.isNaN(n)) go(n)
          }}
        >
          <span>Page</span>
          <input
            aria-label="Go to page"
            inputMode="numeric"
            className={`${field} w-14 text-center`}
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => {
              const n = parseInt(jump, 10)
              if (!Number.isNaN(n) && n !== page) go(n)
              else setJump(String(page))
            }}
          />
          <span>of {pages.toLocaleString('en-US')}</span>
        </form>
        <button type="button" className={btn} onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page">
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  )
}
