'use client'

/**
 * Cleanup candidates (roadmap item 13): every custom field with its cleanup
 * verdict, paged, searched, filtered and sorted on the server. Strong
 * candidates first (no references found, no values). Export has every row.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent } from '@/components/shared/Card'
import { LEVEL_BADGE, type ImpactLevel } from '@/components/schema/CleanupImpact'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { apiClient } from '@/lib/api/client'
import { apiParams } from '@/lib/list/listState'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { arrayToCSV, downloadCSV } from '@/lib/utils/exports'

interface Candidate {
  object: string
  field: string
  label: string | null
  level: ImpactLevel
  verdict: string
  confidence: string
  references: number
  inactiveReferences: number
  populated: number | null
  records: number | null
  estimated: boolean | null
}

const TABS: { key: ImpactLevel | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'candidate', label: 'Strong candidates' },
  { key: 'unmeasured', label: 'Not measured' },
  { key: 'unused_populated', label: 'Holds values' },
  { key: 'inactive_only', label: 'Inactive references only' },
  { key: 'in_use', label: 'In use' },
]
const TD = 'px-4 py-2 text-sm'
const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'

export default function CleanupPage() {
  const orgId = useParams().orgId as string
  const { state, update } = useListState('', { filters: ['level', 'object'] })
  const endpoint = `/orgs/${orgId}/cleanup-candidates`
  const { data, isLoading, error } = usePaged<Candidate, { summary: Record<ImpactLevel, number> }>(['cleanup', orgId], endpoint, state)
  const sort = { sort: data?.sort ?? state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const [exporting, setExporting] = useState(false)
  const exportAll = async () => {
    setExporting(true)
    try {
      const { page: _p, page_size: _s, ...all } = apiParams(state)
      const rows = (await apiClient.get<{ items: Candidate[] }>(`${endpoint}?${new URLSearchParams(all)}`)).items
      downloadCSV(arrayToCSV(rows.map((r) => ({
        Object: r.object, Field: r.field, Label: r.label, Verdict: r.verdict, Confidence: r.confidence,
        References: r.references, 'Inactive references': r.inactiveReferences,
        'Records with a value': r.populated, Records: r.records, Estimated: r.estimated,
      }))), 'cleanup-candidates')
    } finally {
      setExporting(false)
    }
  }
  const total = data ? Object.values(data.summary).reduce((a, b) => a + b, 0) - (data.summary.standard ?? 0) : 0

  return (
    <div className="space-y-6">
      <PageHeader icon={Trash2} title="Cleanup candidates"
        subtitle="Custom fields, by what references them and how many records hold a value. Never a promise that deleting is safe: each field's page says what was checked and what can't be."
        actions={
          <button type="button" onClick={exportAll} disabled={exporting || !data?.total}
            className="inline-flex items-center gap-1.5 rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium hover:bg-primary-50/40 disabled:opacity-50 dark:border-grove-border-dk dark:hover:bg-primary-900/15">
            <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        } />
      <Card variant="bordered">
        <CardContent className="space-y-4 pt-6">
          <div role="tablist" aria-label="Verdict" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.key} role="tab" type="button" aria-selected={(state.filters.level || '') === t.key}
                onClick={() => update({ filters: { level: t.key } })}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${(state.filters.level || '') === t.key
                  ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>
                {t.label} <span className="v2-num">{data ? (t.key ? data.summary[t.key] ?? 0 : total) : ''}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search object or field..." />
            <div className="md:w-56">
              <ListSearch value={state.filters.object || ''} onChange={(v) => update({ filters: { object: v } })} placeholder="Object (exact API name)" />
            </div>
          </div>
          {error ? (
            <p className="text-sm">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className={`text-sm ${MUTED}`}>No custom field matches.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                  <thead>
                    <tr>
                      <SortHeader label="Field" column="field" {...sort} />
                      <SortHeader label="Verdict" column="verdict" {...sort} />
                      <SortHeader label="References" column="references" align="right" {...sort} />
                      <SortHeader label="Records with a value" column="populated" align="right" {...sort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((r) => (
                      <tr key={`${r.object}.${r.field}`}>
                        <td className={TD}>
                          <Link className="font-mono text-xs text-primary-700 hover:underline dark:text-primary-300"
                            href={`/orgs/${orgId}/fields/${encodeURIComponent(`${r.object}.${r.field}`)}`}>
                            {r.object}.{r.field}
                          </Link>
                          {r.label && <span className={`ml-2 text-xs ${MUTED}`}>{r.label}</span>}
                        </td>
                        <td className={TD}>
                          <Badge variant={LEVEL_BADGE[r.level]} size="sm">{r.verdict}</Badge>
                          <span className={`ml-2 text-xs ${MUTED}`}>{r.confidence}</span>
                        </td>
                        <td className={`v2-num ${TD} text-right`}>
                          {r.references}
                          {r.inactiveReferences > 0 && <span className={`ml-1 text-xs ${MUTED}`}>+{r.inactiveReferences} inactive</span>}
                        </td>
                        <td className={`v2-num ${TD} text-right ${MUTED}`}>
                          {r.populated == null ? 'Not measured' : `${r.populated.toLocaleString('en-US')} of ${(r.records ?? 0).toLocaleString('en-US')}${r.estimated ? ' (sample)' : ''}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="fields"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
