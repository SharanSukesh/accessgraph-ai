'use client'

/**
 * Org limits (parity #27): every limit from the latest Health Report run's
 * REST /limits read, with used, % used and a status. Paged, searchable,
 * filtered by status and sorted on the server; fullest first.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Gauge } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

interface LimitRow { name: string; label: string; max: number; remaining: number; used: number; pct: number | null; status: string }
type Extra = { summary: Record<'healthy' | 'warning' | 'critical', number>; readAt: string | null; thresholds: { warning: number; critical: number } }

const STATUS = { healthy: 'success', warning: 'warning', critical: 'danger', not_applicable: 'default' } as const
const LABEL = { healthy: 'Healthy', warning: 'Warning', critical: 'Critical', not_applicable: 'No limit' } as const
const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const TD = 'px-4 py-2 text-sm'

export default function OrgLimitsPage() {
  const orgId = useParams().orgId as string
  const { state, update } = useListState('', { filters: ['status'] })
  const { data, isLoading, error } = usePaged<LimitRow, Extra>(['org-limits', orgId], `/orgs/${orgId}/org-limits`, state)
  const sort = { sort: data?.sort ?? state.sort, dir: data?.dir ?? state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  return (
    <div className="space-y-6">
      <PageHeader icon={Gauge} title="Org limits"
        subtitle={data?.readAt ? `Read with the Health Report on ${new Date(data.readAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}. Warning from ${data.thresholds.warning}% used, critical from ${data.thresholds.critical}%.` : 'Run the Health Report to read the org\'s limits.'} />
      <Card variant="bordered">
        <CardContent className="space-y-4 pt-6">
          <div role="tablist" aria-label="Status" className="flex flex-wrap gap-2">
            {(['', 'critical', 'warning', 'healthy'] as const).map((s) => (
              <button key={s} role="tab" type="button" aria-selected={(state.filters.status || '') === s}
                onClick={() => update({ filters: { status: s } })}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${(state.filters.status || '') === s ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>
                {s ? LABEL[s] : 'All'} <span className="v2-num">{data ? (s ? data.summary[s] : data.summary.healthy + data.summary.warning + data.summary.critical) : ''}</span>
              </button>
            ))}
          </div>
          <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search limits..." />
          {error ? <p className="text-sm">{(error as Error).message}</p> : isLoading || !data ? <TableSkeleton rows={10} /> : data.total === 0 ? (
            <p className={`text-sm ${MUTED}`}>{data.readAt ? 'No limit matches.' : <>No limits read yet. <Link className="underline" href={`/orgs/${orgId}/org-analyzer`}>Run the Health Report</Link>.</>}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                  <thead>
                    <tr>
                      <SortHeader label="Limit" column="name" {...sort} />
                      <SortHeader label="Used" column="used" align="right" {...sort} />
                      <SortHeader label="Max" column="max" align="right" {...sort} />
                      <SortHeader label="% used" column="pct" align="right" {...sort} />
                      <th className={`px-4 py-2 text-left text-xs font-medium uppercase ${MUTED}`}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((r) => (
                      <tr key={r.name}>
                        <td className={TD}>{r.label}<span className={`ml-2 font-mono text-xs ${MUTED}`}>{r.name}</span></td>
                        <td className={`v2-num ${TD} text-right`}>{r.used.toLocaleString('en-US')}</td>
                        <td className={`v2-num ${TD} text-right ${MUTED}`}>{r.max.toLocaleString('en-US')}</td>
                        <td className={`v2-num ${TD} text-right`}>
                          <div className="flex items-center justify-end gap-2">
                            <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-grove-border sm:block dark:bg-grove-border-dk" aria-hidden>
                              <span className={`block h-full ${r.status === 'critical' ? 'bg-red-600' : r.status === 'warning' ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} />
                            </span>
                            {r.pct == null ? '—' : `${r.pct}%`}
                          </div>
                        </td>
                        <td className={TD}><Badge variant={STATUS[r.status as keyof typeof STATUS] ?? 'default'} size="sm">{LABEL[r.status as keyof typeof LABEL] ?? r.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="limits"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
