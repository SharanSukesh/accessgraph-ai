'use client'

/**
 * History (roadmap item 21): every sync is a snapshot of the org's
 * configuration. Pick one to see what changed against the one before it, or
 * against any other (a baseline). Changes are paged, filtered by kind and
 * searched on the server; Export CSV has every row. Admins can name a
 * snapshot and keep it as a baseline past retention.
 */

import { useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, History } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { apiParams, type Paged } from '@/lib/list/listState'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { arrayToCSV, downloadCSV } from '@/lib/utils/exports'

interface Snap {
  id: string; seq: number; takenAt: string; source: string; label: string | null; items: number; changes: number
  isBaseline: boolean; baselineNote: string | null; baselineBy: string | null
}
interface Change {
  entity: string; entityLabel: string; key: string; name: string; change: 'added' | 'removed' | 'changed'
  before: Record<string, any> | null; after: Record<string, any> | null; fields: string[]
}
type Extra = { snapshot: Snap; against: Snap | null; summary: Record<string, { added: number; removed: number; changed: number }>; labels: Record<string, string> }

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const CHANGE_BADGE = { added: 'success', removed: 'danger', changed: 'warning' } as const
const show = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : Array.isArray(v) ? v.join(', ') || '—' : v == null || v === '' ? '—' : String(v))
/** A field's change: lists (system permissions) as what was added and removed, values as before → after. */
const delta = (f: string, before: any, after: any) => {
  if (Array.isArray(before) || Array.isArray(after)) {
    const b = new Set<string>(before ?? []), a = new Set<string>(after ?? [])
    const name = (x: string) => x.replace(/^Permissions/, '')
    const plus = [...a].filter((x) => !b.has(x)).map(name)
    const minus = [...b].filter((x) => !a.has(x)).map(name)
    return `${f === 'systemPermissions' ? 'System permissions' : f}: ${[...plus.map((x) => `+ ${x}`), ...minus.map((x) => `− ${x}`)].join(', ')}`
  }
  return `${f}: ${show(before)} → ${show(after)}`
}

export default function HistoryPage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: list, isLoading } = useQuery({
    queryKey: ['snapshots', orgId],
    queryFn: () => apiClient.get<Paged<Snap>>(`/orgs/${orgId}/snapshots?page=1&page_size=100`),
  })
  const snaps = list?.items ?? []
  const selected = search?.get('snap') || snaps[0]?.id
  const against = search?.get('against') || ''
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search?.toString() || '')
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    for (const k of [...next.keys()]) if (k.startsWith('c.')) next.delete(k)  // a new pair starts on page 1
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const { state, update } = useListState('c', { filters: ['entity', 'change'] })
  const endpoint = `/orgs/${orgId}/snapshots/${selected}/changes`
  const { data, isLoading: loadingChanges } = usePaged<Change, Extra>(['snapshot-changes', orgId, selected, against], endpoint, state,
    !!selected, against ? { against } : {})
  const baseline = useMutation({
    mutationFn: (s: Snap) => apiClient.put(`/orgs/${orgId}/snapshots/${s.id}`, { is_baseline: !s.isBaseline }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['snapshots', orgId] }),
  })
  const [exporting, setExporting] = useState(false)
  const exportAll = async () => {
    setExporting(true)
    try {
      const params: Record<string, string> = { ...apiParams(state), ...(against ? { against } : {}) }
      const { page: _p, page_size: _s, ...all } = params
      const rows = (await apiClient.get<{ items: Change[] }>(`${endpoint}?${new URLSearchParams(all)}`)).items
      downloadCSV(arrayToCSV(rows.map((r) => ({
        What: r.entityLabel, Item: r.name, Key: r.key, Change: r.change, Fields: r.fields.join('; '),
        'Before → after': r.fields.map((f) => delta(f, r.before?.[f], r.after?.[f])).join('; '),
      }))), 'snapshot-changes')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={History} title="History" eyebrow="Explore · snapshots"
        subtitle="Every sync keeps a snapshot of the org's configuration. Pick one to see what changed since the one before it, or against a baseline." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card variant="bordered">
          <CardHeader><CardTitle>Snapshots</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton rows={6} /> : snaps.length === 0 ? (
              <p className={`text-sm ${MUTED}`}>No snapshots yet: the next sync takes the first one.</p>
            ) : (
              <ul className="space-y-1" role="listbox" aria-label="Snapshots">
                {snaps.map((s) => (
                  <li key={s.id}>
                    <button type="button" role="option" aria-selected={s.id === selected} onClick={() => setParam({ snap: s.id })}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${s.id === selected ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/25 dark:ring-primary-700' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.label || `Snapshot ${s.seq}`}</span>
                        {s.isBaseline && <Badge variant="info" size="sm">Baseline</Badge>}
                      </span>
                      <span className={`block text-xs ${MUTED}`}>{when(s.takenAt)} · {s.changes} {s.changes === 1 ? 'change' : 'changes'}{s.source === 'fixture' ? ' · demo' : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={`mt-3 text-xs ${MUTED}`}>Snapshots past the retention window are pruned, except baselines and the latest one.</p>
          </CardContent>
        </Card>
        <Card variant="bordered">
          <CardContent className="space-y-4 pt-6">
            {!selected ? null : !data && loadingChanges ? <TableSkeleton rows={8} /> : data && (
              <>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span><strong>{data.snapshot.label || `Snapshot ${data.snapshot.seq}`}</strong> <span className={MUTED}>({when(data.snapshot.takenAt)})</span></span>
                  <label className="flex items-center gap-2">
                    <span className={MUTED}>compared with</span>
                    <select aria-label="Compare with" value={against} onChange={(e) => setParam({ against: e.target.value || null })}
                      className="rounded-md bg-grove-surface px-2 py-1 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk">
                      <option value="">the snapshot before it</option>
                      {snaps.filter((s) => s.id !== selected).map((s) => (
                        <option key={s.id} value={s.id}>{s.label || `Snapshot ${s.seq}`} ({new Date(s.takenAt).toLocaleDateString('en-GB')}){s.isBaseline ? ' · baseline' : ''}</option>
                      ))}
                    </select>
                  </label>
                  {isAdmin && (
                    <button type="button" onClick={() => baseline.mutate(data.snapshot)} disabled={baseline.isPending}
                      className="ml-auto rounded-md border border-grove-border px-3 py-1 text-xs font-medium hover:bg-primary-50/40 dark:border-grove-border-dk dark:hover:bg-primary-900/15">
                      {snaps.find((s) => s.id === selected)?.isBaseline ? 'Stop keeping as baseline' : 'Keep as baseline'}
                    </button>
                  )}
                  <button type="button" onClick={exportAll} disabled={exporting || !data.total}
                    className="inline-flex items-center gap-1 rounded-md border border-grove-border px-3 py-1 text-xs font-medium hover:bg-primary-50/40 disabled:opacity-50 dark:border-grove-border-dk dark:hover:bg-primary-900/15">
                    <Download className="h-3 w-3" /> {exporting ? 'Exporting…' : 'Export CSV'}
                  </button>
                </div>
                {data.against == null ? (
                  <p className={`text-sm ${MUTED}`}>The first snapshot: nothing earlier to compare with.</p>
                ) : (
                  <>
                    <div role="tablist" aria-label="What changed" className="flex flex-wrap gap-2">
                      {[['', 'All', Object.values(data.summary).reduce((a, s) => a + s.added + s.removed + s.changed, 0)] as const,
                        ...Object.entries(data.summary).map(([k, s]) => [k, data.labels[k] ?? k, s.added + s.removed + s.changed] as const)]
                        .map(([k, label, n]) => (
                          <button key={k} type="button" role="tab" aria-selected={(state.filters.entity || '') === k}
                            onClick={() => update({ filters: { entity: k } })}
                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${(state.filters.entity || '') === k ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>
                            {label} <span className="v2-num">{n}</span>
                          </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search changes..." />
                      <select aria-label="Change" value={state.filters.change || ''} onChange={(e) => update({ filters: { change: e.target.value } })}
                        className="rounded-md bg-grove-surface px-3 py-2 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk">
                        <option value="">Added, removed and changed</option>
                        <option value="added">Added</option>
                        <option value="removed">Removed</option>
                        <option value="changed">Changed</option>
                      </select>
                    </div>
                    {data.total === 0 ? <p className={`text-sm ${MUTED}`}>No changes{state.q || state.filters.entity || state.filters.change ? ' match' : ''}.</p> : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                            <thead>
                              <tr className={`text-left text-xs uppercase ${MUTED}`}>
                                <th className="px-3 py-2 font-medium">What</th>
                                <th className="px-3 py-2 font-medium">Item</th>
                                <th className="px-3 py-2 font-medium">Change</th>
                                <th className="px-3 py-2 font-medium">Before → after</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                              {data.items.map((r) => (
                                <tr key={`${r.entity}|${r.key}`}>
                                  <td className={`px-3 py-2 ${MUTED}`}>{r.entityLabel}</td>
                                  <td className="px-3 py-2">{r.name}</td>
                                  <td className="px-3 py-2"><Badge variant={CHANGE_BADGE[r.change]} size="sm">{r.change[0].toUpperCase() + r.change.slice(1)}</Badge></td>
                                  <td className={`px-3 py-2 text-xs ${MUTED}`}>
                                    {r.change === 'changed' ? r.fields.map((f) => <div key={f}>{delta(f, r.before?.[f], r.after?.[f])}</div>) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="changes"
                          onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
