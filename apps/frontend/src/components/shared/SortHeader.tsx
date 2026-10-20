'use client'

/** A table header that sorts a server-paged list by its column (kept in the URL). */

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export function SortHeader({ label, column, sort, dir, onSort, className = '', align = 'left' }: {
  label: string
  column: string
  sort: string | null
  dir: 'asc' | 'desc'
  onSort: (column: string, dir: 'asc' | 'desc') => void
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  const active = sort === column
  const next = active && dir === 'asc' ? 'desc' : 'asc'
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-2 text-xs font-medium uppercase text-grove-ink/55 dark:text-grove-ink-dk/55 text-${align} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column, next)}
        className={`inline-flex items-center gap-1 uppercase hover:text-grove-ink dark:hover:text-grove-ink-dk ${active ? 'text-grove-ink dark:text-grove-ink-dk' : ''}`}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  )
}
