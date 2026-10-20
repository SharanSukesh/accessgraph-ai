'use client'

/**
 * The People view as a paged list (the standing pagination rule): everyone
 * matching the view's filters, searched and sorted on the server, with
 * their manager and direct and total reports. Direct reports open as a list
 * of their own ("Reports to ..."). The CSV has every matching row.
 */

import { useState } from 'react'
import { Download, XIcon } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { apiClient } from '@/lib/api/client'
import type { ReportingGraphNode } from '@/lib/api/hooks/useReportingGraph'
import { apiParams, type ListState } from '@/lib/list/listState'
import { usePaged } from '@/lib/list/usePaged'
import { FLAG_LABELS } from '@/lib/peopleTree'
import { arrayToCSV, downloadCSV } from '@/lib/utils/exports'
import { roleColor } from './PeopleCanvas'

export type PersonRow = ReportingGraphNode & { manager_name: string | null; direct: number; total: number }

const MUTED = 'text-grove-ink/55 dark:text-grove-ink-dk/55'
const TD = 'px-4 py-1.5 text-sm'

export function PeopleList({ orgId, state, update, selectedId, onSelect, nameOf }: {
  orgId: string
  state: ListState
  update: (change: Partial<ListState>) => void
  selectedId: string | null
  onSelect: (id: string) => void
  nameOf: (id: string) => string
}) {
  const endpoint = `/orgs/${orgId}/reporting-graph/people`
  const { data, isLoading, error } = usePaged<PersonRow>(['people-list', orgId], endpoint, state)
  const [exporting, setExporting] = useState(false)
  const sort = {
    sort: data?.sort ?? state.sort,
    dir: data?.dir ?? state.dir,
    onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }),
  }
  const manager = state.filters.manager

  const exportAll = async () => {
    setExporting(true)
    try {
      const { page: _p, page_size: _s, ...all } = apiParams(state)
      const rows = (await apiClient.get<{ items: PersonRow[] }>(`${endpoint}?${new URLSearchParams(all)}`)).items
      downloadCSV(arrayToCSV(rows.map((r) => ({
        Name: r.name, Title: r.title, Department: r.department, Role: r.role_name, Profile: r.profile_name,
        Manager: r.manager_name, 'Direct reports': r.direct, 'Total reports': r.total, Active: r.is_active,
        'Risk level': r.risk_level, 'Needs a look': (r.flags ?? []).map((f) => FLAG_LABELS[f as keyof typeof FLAG_LABELS] ?? f).join('; '),
      }))), 'people')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="people-list">
      <div className="flex flex-wrap items-center gap-2 border-b border-grove-border px-3 py-2 dark:border-grove-border-dk">
        {manager ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-grove-border px-2 py-0.5 text-xs dark:border-grove-border-dk">
            Reports to {nameOf(manager)}
            <button type="button" aria-label="Show everyone" onClick={() => update({ filters: { manager: '' } })}
              className="rounded p-0.5 hover:bg-primary-50 dark:hover:bg-primary-900/20">
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span className={`text-xs ${MUTED}`}>Everyone matching the filters. Select a count of direct reports to list them.</span>
        )}
        <button type="button" onClick={exportAll} disabled={exporting || !data?.total}
          className="ml-auto inline-flex items-center gap-1 rounded border border-grove-border px-2 py-1 text-xs font-medium hover:bg-primary-50/40 disabled:opacity-50 dark:border-grove-border-dk dark:hover:bg-primary-900/15">
          <Download className="h-3 w-3" /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <p className={`p-4 text-sm ${MUTED}`}>{(error as Error).message}</p>
        ) : isLoading || !data ? (
          <div className="p-4"><TableSkeleton rows={10} /></div>
        ) : data.total === 0 ? (
          <p className={`p-4 text-sm ${MUTED}`}>Nobody matches.</p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 z-[1] bg-grove-surface dark:bg-grove-surface-dk">
              <tr className="border-b border-grove-border dark:border-grove-border-dk">
                <SortHeader label="Name" column="name" {...sort} />
                <SortHeader label="Title" column="title" className="hidden 2xl:table-cell" {...sort} />
                <SortHeader label="Role" column="role" {...sort} />
                <SortHeader label="Manager" column="manager" {...sort} />
                <SortHeader label="Direct" column="direct" align="right" {...sort} />
                <SortHeader label="Total" column="total" align="right" {...sort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
              {data.items.map((r) => (
                <tr key={r.user_sf_id} onClick={() => onSelect(r.user_sf_id)}
                  className={`cursor-pointer ${selectedId === r.user_sf_id ? 'bg-primary-50 dark:bg-primary-900/25' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'}`}>
                  <td className={TD}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: roleColor(r.role_depth ?? null) }} aria-hidden />
                        <span className={`font-medium ${r.is_active ? '' : 'line-through decoration-1'}`} title={r.title ?? undefined}>{r.name}</span>
                      </span>
                      {!r.is_active && <Badge variant="default" size="sm">Inactive</Badge>}
                      {(r.risk_level === 'high' || r.risk_level === 'critical') && (
                        <Badge variant={r.risk_level === 'critical' ? 'danger' : 'warning'} size="sm">
                          {r.risk_level === 'critical' ? 'Critical risk' : 'High risk'}
                        </Badge>
                      )}
                      {(r.flags ?? []).map((f) => (
                        <span key={f} className="rounded border border-amber-400 px-1.5 text-[10px] font-medium text-amber-800 dark:border-amber-600 dark:text-amber-200">
                          {FLAG_LABELS[f as keyof typeof FLAG_LABELS] ?? f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`${TD} ${MUTED} hidden 2xl:table-cell`}>{r.title || '—'}</td>
                  <td className={TD}>{r.role_name || <span className={MUTED}>—</span>}</td>
                  <td className={TD}>{r.manager_name || <span className={MUTED}>—</span>}</td>
                  <td className={`v2-num ${TD} whitespace-nowrap text-right`}>
                    {r.direct ? (
                      <button type="button" className="text-primary-700 hover:underline dark:text-primary-300"
                        aria-label={`List ${r.name}'s ${r.direct} direct reports`}
                        onClick={(e) => { e.stopPropagation(); update({ filters: { manager: r.user_sf_id } }) }}>
                        {r.direct}
                      </button>
                    ) : <span className={MUTED}>0</span>}
                  </td>
                  <td className={`v2-num ${TD} whitespace-nowrap text-right`}>{r.total || <span className={MUTED}>0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && data.total > 0 && (
        <div className="border-t border-grove-border px-3 dark:border-grove-border-dk">
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="people"
            onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
        </div>
      )}
    </div>
  )
}
