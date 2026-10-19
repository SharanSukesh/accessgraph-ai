'use client'

/**
 * The People view as a tree table: indented under each manager, sortable
 * (siblings sort within their manager), searchable through the view's
 * filters. Open and close managers like the graph; rows kept only to
 * connect a match to the top are faded.
 */

import { ChevronDown, ChevronRight, ChevronsUpDown, ArrowDown, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { FLAG_LABELS, type SortKey, type TreeRow } from '@/lib/peopleTree'
import { roleColor } from './PeopleCanvas'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'role', label: 'Role' },
  { key: 'manager', label: 'Manager' },
  { key: 'direct', label: 'Direct reports', numeric: true },
  { key: 'total', label: 'Total reports', numeric: true },
]

const MUTED = 'text-grove-ink/55 dark:text-grove-ink-dk/55'

export function PeopleTreeTable({
  rows,
  sort,
  onSort,
  onToggle,
  selectedId,
  onSelect,
  filtered,
}: {
  rows: TreeRow[]
  sort: { key: SortKey; desc: boolean }
  onSort: (key: SortKey) => void
  onToggle: (id: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
  filtered: boolean
}) {
  return (
    <div className="h-full overflow-auto" data-testid="people-tree-table">
      <table className="w-full whitespace-nowrap text-sm">
        <thead className={`sticky top-0 z-[1] bg-grove-surface text-xs dark:bg-grove-surface-dk ${MUTED}`}>
          <tr className="border-b border-grove-border dark:border-grove-border-dk">
            {COLUMNS.map((c) => {
              const active = sort.key === c.key
              const Icon = active ? (sort.desc ? ArrowDown : ArrowUp) : ChevronsUpDown
              return (
                <th
                  key={c.key}
                  aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                  className={`px-3 py-2 font-medium ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-grove-ink dark:hover:text-grove-ink-dk">
                    {c.label}
                    <Icon className="h-3 w-3" aria-hidden />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer ${r.context ? 'opacity-50' : ''} ${
                selectedId === r.id ? 'bg-primary-50 dark:bg-primary-900/25' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'
              }`}
            >
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-1.5" style={{ paddingLeft: `${r.depth * 18}px` }}>
                  {r.expandable && !filtered ? (
                    <button
                      type="button"
                      aria-label={`${r.open ? 'Close' : 'Open'} ${r.person.name}`}
                      aria-expanded={r.open}
                      onClick={(e) => { e.stopPropagation(); onToggle(r.id) }}
                      className="rounded p-0.5 hover:bg-primary-100 dark:hover:bg-primary-900/40"
                    >
                      {r.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                  ) : (
                    <span className="inline-block w-[18px]" aria-hidden />
                  )}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: roleColor(r.person.role_depth) }} aria-hidden />
                  <span className={`font-medium ${r.person.is_active ? '' : 'line-through decoration-1'}`}>{r.person.name}</span>
                  {!r.person.is_active && <Badge variant="default" size="sm">Inactive</Badge>}
                  {(r.person.risk_level === 'high' || r.person.risk_level === 'critical') && (
                    <Badge variant={r.person.risk_level === 'critical' ? 'danger' : 'warning'} size="sm">
                      {r.person.risk_level === 'critical' ? 'Critical risk' : 'High risk'}
                    </Badge>
                  )}
                  {(r.person.flags ?? []).map((f) => (
                    <span key={f} className="rounded border border-amber-400 px-1.5 text-[10px] font-medium text-amber-800 dark:border-amber-600 dark:text-amber-200">
                      {FLAG_LABELS[f]}
                    </span>
                  ))}
                </div>
              </td>
              <td className={`px-3 py-1.5 ${MUTED}`}>{r.person.title || '—'}</td>
              <td className="px-3 py-1.5">{r.person.role_name || <span className={MUTED}>—</span>}</td>
              <td className="px-3 py-1.5">{r.manager || <span className={MUTED}>—</span>}</td>
              <td className="v2-num px-3 py-1.5 text-right">{r.direct || <span className={MUTED}>0</span>}</td>
              <td className="v2-num px-3 py-1.5 text-right">{r.total || <span className={MUTED}>0</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className={`p-4 text-sm ${MUTED}`}>Nobody matches.</p>}
    </div>
  )
}
