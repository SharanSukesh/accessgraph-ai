'use client'

/**
 * Org comparison (roadmap item 9 v1): this org against another org (a
 * sandbox, any org you can open) or against itself on another date, from
 * their snapshots. Matched by API name; a mapping handles renames and
 * namespaces; approved differences are expected, the rest is drift.
 * Consequences: who gains or loses access, and what references changed
 * fields. Every list is paged on the server; state is in the URL.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, GitCompare } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { apiParams } from '@/lib/list/listState'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { arrayToCSV, downloadCSV } from '@/lib/utils/exports'

interface SnapRef { id: string; seq: number; takenAt: string; label: string | null; isBaseline: boolean }
interface Target { id: string; name: string; isDemo: boolean; self: boolean; snapshots: SnapRef[] }
interface Diff {
  id: string; category: string; key: string; label: string; status: 'only_left' | 'only_right' | 'different'
  left: Record<string, any> | null; right: Record<string, any> | null; fields: string[]; approved: boolean
  approval: { note: string; by: string; at: string } | null
}
interface Side { org: { id: string; name: string }; snapshot: SnapRef }
type Header = {
  left: Side; right: Side; sameOrg: boolean; note: string | null
  mapping: { namespaces: Record<string, string>; renames: Record<string, Record<string, string>> }
}
type DiffExtra = Header & { summary: Record<string, { only_left: number; only_right: number; different: number; approved: number }>; totals: { differences: number; approved: number; unexpected: number } }
interface AccessRow { user: string; name: string; kind: 'Object' | 'Field'; item: string; gains: string[]; loses: string[] }
interface DepRow { field: string; status: string; fields: string[]; references: number; where: string[] }

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const SELECT = 'rounded-md bg-grove-surface px-2 py-1.5 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk'
const STATUS = { only_left: ['Only here', 'danger'], only_right: ['Only there', 'info'], different: ['Different', 'warning'] } as const
const snapName = (s: SnapRef) => `${s.label || `Snapshot ${s.seq}`} · ${new Date(s.takenAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
const show = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : Array.isArray(v) ? v.join(', ') || '—' : v == null || v === '' ? '—' : String(v))
const describe = (d: Diff, side: 'left' | 'right') => {
  const v = d[side]
  if (!v) return '—'
  const keys = d.status === 'different' ? d.fields : Object.keys(v)
  return keys.length ? keys.map((k) => `${k}: ${show(v[k])}`).join('; ') : 'Present'
}

export default function OrgComparePage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const rightOrg = search?.get('right_org') || orgId
  const left = search?.get('left') || ''
  const right = search?.get('right') || ''
  const tab = search?.get('tab') || 'differences'
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search?.toString() || '')
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    if (!('tab' in patch)) for (const k of [...next.keys()]) if (/^[dap]\./.test(k)) next.delete(k)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const { data: targets } = useQuery({ queryKey: ['compare-targets', orgId], queryFn: () => apiClient.get<{ orgs: Target[] }>(`/orgs/${orgId}/compare/targets`) })
  const self = targets?.orgs.find((o) => o.self)
  const other = targets?.orgs.find((o) => o.id === rightOrg)
  const sides: Record<string, string> = { right_org: rightOrg, ...(left ? { left } : {}), ...(right ? { right } : {}) }
  const d = useListState('d', { filters: ['category', 'status', 'unexpected'] })
  const diffs = usePaged<Diff, DiffExtra>(['compare', orgId, sides], `/orgs/${orgId}/compare`, d.state, true, sides)
  const a = useListState('a', { filters: ['kind'] })
  const access = usePaged<AccessRow, Header & { summary: { users: number; gains: number; losses: number } }>(
    ['compare-access', orgId, sides], `/orgs/${orgId}/compare/access`, a.state, tab === 'access', sides)
  const p = useListState('p', {})
  const deps = usePaged<DepRow, Header>(['compare-deps', orgId, sides], `/orgs/${orgId}/compare/dependencies`, p.state, tab === 'dependencies', sides)
  const invalidate = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('compare') })
  const approve = useMutation({
    mutationFn: (x: Diff) => apiClient.put(`/orgs/${orgId}/compare/approval`, { right_org: rightOrg, id: x.id, approved: !x.approved }),
    onSuccess: invalidate,
  })
  const mapping = useMutation({
    mutationFn: (body: Record<string, any>) => apiClient.put(`/orgs/${orgId}/compare/mapping`, { right_org: rightOrg, ...body }),
    onSuccess: invalidate,
  })
  const [mapFor, setMapFor] = useState<Diff | null>(null)
  const candidates = useQuery({
    queryKey: ['compare-candidates', orgId, sides, mapFor?.id],
    queryFn: () => apiClient.get<{ items: Diff[] }>(`/orgs/${orgId}/compare?${new URLSearchParams({ ...sides, category: mapFor!.category, status: mapFor!.status === 'only_left' ? 'only_right' : 'only_left', page: '1', page_size: '100' })}`),
    enabled: !!mapFor,
  })
  const [nsRight, setNsRight] = useState('')
  const [nsLeft, setNsLeft] = useState('')
  const [exporting, setExporting] = useState(false)
  const exportDiffs = async () => {
    setExporting(true)
    try {
      const params: Record<string, string> = { ...apiParams(d.state), ...sides }
      const { page: _p, page_size: _s, ...all } = params
      const rows = (await apiClient.get<{ items: Diff[] }>(`/orgs/${orgId}/compare?${new URLSearchParams(all)}`)).items
      downloadCSV(arrayToCSV(rows.map((r) => ({
        Category: r.category, Item: r.key, Status: STATUS[r.status][0], Fields: r.fields.join('; '),
        [diffs.data?.left.org.name ?? 'This org']: describe(r, 'left'), [diffs.data?.right.org.name ?? 'Other']: describe(r, 'right'),
        Approved: r.approved, 'Approval note': r.approval?.note,
      }))), 'org-comparison')
    } finally {
      setExporting(false)
    }
  }
  const h = diffs.data
  const tabBtn = (k: string, label: string) => (
    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParam({ tab: k })}
      className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-primary-700 text-grove-ink dark:text-grove-ink-dk' : `border-transparent ${MUTED}`}`}>{label}</button>
  )

  return (
    <div className="space-y-6">
      <PageHeader icon={GitCompare} title="Compare orgs" eyebrow="Explore · comparison"
        subtitle="This org against a sandbox, another org or itself on another date, from their snapshots. Matched by API name, not Salesforce id." />
      <Card variant="bordered">
        <CardContent className="flex flex-wrap items-end gap-4 pt-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${MUTED}`}>This org ({self?.name ?? '…'})</span>
            <select aria-label="This org's snapshot" className={SELECT} value={left} onChange={(e) => setParam({ left: e.target.value || null })}>
              <option value="">Latest snapshot</option>
              {self?.snapshots.map((s) => <option key={s.id} value={s.id}>{snapName(s)}{s.isBaseline ? ' · baseline' : ''}</option>)}
            </select>
          </label>
          <span className={`pb-2 ${MUTED}`}>compared with</span>
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${MUTED}`}>Org</span>
            <select aria-label="Org to compare with" className={SELECT} value={rightOrg} onChange={(e) => setParam({ right_org: e.target.value === orgId ? null : e.target.value, right: null })}>
              {targets?.orgs.map((o) => <option key={o.id} value={o.id}>{o.self ? `${o.name} (this org)` : o.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={`text-xs ${MUTED}`}>Snapshot</span>
            <select aria-label="Snapshot to compare with" className={SELECT} value={right} onChange={(e) => setParam({ right: e.target.value || null })}>
              <option value="">{rightOrg === orgId ? 'The one before' : 'Latest snapshot'}</option>
              {other?.snapshots.map((s) => <option key={s.id} value={s.id}>{snapName(s)}{s.isBaseline ? ' · baseline' : ''}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      {diffs.error ? <ErrorState message={(diffs.error as Error).message} onRetry={() => diffs.refetch()} /> : !h ? <TableSkeleton rows={8} /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[['Differences', h.totals.differences], ['Unexpected (drift)', h.totals.unexpected], ['Approved as expected', h.totals.approved]].map(([label, n]) => (
              <Card key={label as string} variant="bordered"><CardContent className="pt-5">
                <p className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{label}</p>
                <p className="v2-num text-3xl font-bold">{n}</p>
              </CardContent></Card>
            ))}
          </div>
          <p className={`text-sm ${MUTED}`}>
            <strong className="text-grove-ink dark:text-grove-ink-dk">{h.left.org.name}</strong> ({snapName(h.left.snapshot)}) against <strong className="text-grove-ink dark:text-grove-ink-dk">{h.right.org.name}</strong> ({snapName(h.right.snapshot)}).
            {h.note && ` ${h.note}`}
          </p>
          <div role="tablist" className="flex flex-wrap gap-1 border-b border-grove-border dark:border-grove-border-dk">
            {tabBtn('differences', 'Differences')}
            {tabBtn('access', 'Who gains or loses access')}
            {tabBtn('dependencies', 'What depends on changed fields')}
            {tabBtn('mapping', 'Mapping')}
          </div>

          {tab === 'differences' && (
            <Card variant="bordered"><CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap gap-2">
                {[['', 'All', h.totals.differences] as const, ...Object.entries(h.summary).map(([k, s]) => [k, k, s.only_left + s.only_right + s.different] as const)].map(([k, label, n]) => (
                  <button key={k} type="button" aria-pressed={(d.state.filters.category || '') === k} onClick={() => d.update({ filters: { category: k } })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${(d.state.filters.category || '') === k ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>
                    {label} <span className="v2-num">{n}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <ListSearch value={d.state.q} onChange={(q) => d.update({ q })} placeholder="Search differences..." />
                <select aria-label="Status" className={SELECT} value={d.state.filters.status || ''} onChange={(e) => d.update({ filters: { status: e.target.value } })}>
                  <option value="">Only here, only there and different</option>
                  <option value="only_left">Only here</option>
                  <option value="only_right">Only there</option>
                  <option value="different">Different</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary-700" checked={d.state.filters.unexpected === 'true'}
                    onChange={(e) => d.update({ filters: { unexpected: e.target.checked ? 'true' : '' } })} />
                  Unexpected only
                </label>
                <button type="button" onClick={exportDiffs} disabled={exporting || !h.total}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-grove-border px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-grove-border-dk">
                  <Download className="h-3 w-3" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
              {h.total === 0 ? <p className={`text-sm ${MUTED}`}>No differences{d.state.q || d.state.filters.category || d.state.filters.status ? ' match' : ''}.</p> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                      <thead><tr className={`text-left text-xs uppercase ${MUTED}`}>
                        <th className="px-3 py-2 font-medium">What</th><th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">{h.left.org.name}</th><th className="px-3 py-2 font-medium">{h.right.org.name}{h.sameOrg ? ' (earlier)' : ''}</th>
                        <th className="px-3 py-2 font-medium">Status</th>{isAdmin && <th className="px-3 py-2" />}
                      </tr></thead>
                      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                        {h.items.map((r) => (
                          <tr key={r.id} className={r.approved ? 'opacity-60' : ''}>
                            <td className={`px-3 py-2 ${MUTED}`}>{r.category}</td>
                            <td className="px-3 py-2"><span className="font-mono text-xs">{r.key}</span>{r.label !== r.key && <span className={`block text-xs ${MUTED}`}>{r.label}</span>}</td>
                            <td className={`px-3 py-2 text-xs ${MUTED}`}>{describe(r, 'left')}</td>
                            <td className={`px-3 py-2 text-xs ${MUTED}`}>{describe(r, 'right')}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <Badge variant={STATUS[r.status][1]} size="sm">{STATUS[r.status][0]}</Badge>
                              {r.approved && <Badge variant="default" size="sm" className="ml-1">Approved</Badge>}
                            </td>
                            {isAdmin && (
                              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right text-xs">
                                {r.status !== 'different' && !h.sameOrg && (
                                  <button type="button" className="text-primary-700 hover:underline dark:text-primary-300" onClick={() => setMapFor(mapFor?.id === r.id ? null : r)}>Map</button>
                                )}
                                <button type="button" className="text-primary-700 hover:underline dark:text-primary-300" onClick={() => approve.mutate(r)}>{r.approved ? 'Unapprove' : 'Approve'}</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mapFor && (
                    <div className="rounded-lg border border-grove-border p-3 text-sm dark:border-grove-border-dk">
                      <p className="mb-2">Same item as <span className="font-mono text-xs">{mapFor.key}</span> under another name {mapFor.status === 'only_left' ? `in ${h.right.org.name}` : `in ${h.left.org.name}`}:</p>
                      <div className="flex flex-wrap gap-2">
                        {(candidates.data?.items ?? []).map((c) => (
                          <button key={c.id} type="button" className="rounded-full px-3 py-1 font-mono text-xs ring-1 ring-grove-border hover:bg-primary-50 dark:ring-grove-border-dk dark:hover:bg-primary-900/20"
                            onClick={() => { mapping.mutate({ category: mapFor.category, left_key: mapFor.status === 'only_left' ? mapFor.key : c.key, right_key: mapFor.status === 'only_left' ? c.key : mapFor.key }); setMapFor(null) }}>
                            {c.key}
                          </button>
                        ))}
                        {candidates.data && candidates.data.items.length === 0 && <span className={MUTED}>Nothing unmatched in that category on the other side.</span>}
                      </div>
                    </div>
                  )}
                  <Pagination page={h.page} pageSize={h.page_size} total={h.total} label="differences"
                    onPage={(page) => d.update({ page })} onPageSize={(pageSize) => d.update({ pageSize })} />
                </>
              )}
            </CardContent></Card>
          )}

          {tab === 'access' && (
            <Card variant="bordered"><CardContent className="space-y-3 pt-5">
              {access.error ? <p className={`text-sm ${MUTED}`}>{(access.error as Error).message}</p> : !access.data ? <TableSkeleton rows={8} /> : (
                <>
                  <p className="text-sm"><strong className="v2-num">{access.data.summary.users}</strong> users matched on both sides would gain or lose access going from {h.right.org.name}{h.sameOrg ? ' (earlier)' : ''} to {h.left.org.name}: <span className="v2-num">{access.data.summary.gains}</span> gains, <span className="v2-num">{access.data.summary.losses}</span> losses.</p>
                  <div className="flex flex-wrap gap-3">
                    <ListSearch value={a.state.q} onChange={(q) => a.update({ q })} placeholder="Search users, objects, fields..." />
                    <select aria-label="Kind" className={SELECT} value={a.state.filters.kind || ''} onChange={(e) => a.update({ filters: { kind: e.target.value } })}>
                      <option value="">Objects and fields</option><option value="Object">Objects</option><option value="Field">Fields</option>
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                      <thead><tr className={`text-left text-xs uppercase ${MUTED}`}><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Object or field</th><th className="px-3 py-2 font-medium">In {h.left.org.name}, gains</th><th className="px-3 py-2 font-medium">Loses</th></tr></thead>
                      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                        {access.data.items.map((r) => (
                          <tr key={`${r.user}|${r.kind}|${r.item}`}>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">{r.item}</td>
                            <td className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{r.gains.join(', ') || '—'}</td>
                            <td className="px-3 py-2 text-xs text-red-700 dark:text-red-300">{r.loses.join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={access.data.page} pageSize={access.data.page_size} total={access.data.total} label="changes"
                    onPage={(page) => a.update({ page })} onPageSize={(pageSize) => a.update({ pageSize })} />
                </>
              )}
            </CardContent></Card>
          )}

          {tab === 'dependencies' && (
            <Card variant="bordered"><CardContent className="space-y-3 pt-5">
              {!deps.data ? <TableSkeleton rows={6} /> : deps.data.total === 0 ? <p className={`text-sm ${MUTED}`}>Nothing in {h.left.org.name} references a field that is missing or different on the other side.</p> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                      <thead><tr className={`text-left text-xs uppercase ${MUTED}`}><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">On the other side</th><th className="px-3 py-2 font-medium">Referenced by</th></tr></thead>
                      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                        {deps.data.items.map((r) => (
                          <tr key={r.field}>
                            <td className="px-3 py-2"><Link className="font-mono text-xs text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/fields/${encodeURIComponent(r.field)}`}>{r.field}</Link></td>
                            <td className="px-3 py-2 text-xs">{r.status === 'only_left' ? 'Missing (or renamed: map it)' : `Different: ${r.fields.join(', ')}`}</td>
                            <td className={`px-3 py-2 text-xs ${MUTED}`}>{r.where.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={deps.data.page} pageSize={deps.data.page_size} total={deps.data.total} label="fields"
                    onPage={(page) => p.update({ page })} onPageSize={(pageSize) => p.update({ pageSize })} />
                </>
              )}
            </CardContent></Card>
          )}

          {tab === 'mapping' && (
            <Card variant="bordered"><CardContent className="space-y-4 pt-5 text-sm">
              <p className={MUTED}>Items that are the same under another name or namespace. Saved for this pair of orgs.</p>
              <div>
                <p className="mb-1 text-xs font-semibold">Namespaces</p>
                {Object.entries(h.mapping.namespaces).length === 0 ? <p className={MUTED}>None.</p> : (
                  <ul className="space-y-1">{Object.entries(h.mapping.namespaces).map(([r, l]) => (
                    <li key={r}><span className="font-mono text-xs">{r}</span> in {h.right.org.name} is <span className="font-mono text-xs">{l}</span> here
                      {isAdmin && <button type="button" className="ml-2 text-xs text-primary-700 hover:underline dark:text-primary-300" onClick={() => mapping.mutate({ namespace_right: r, remove: true })}>Remove</button>}</li>
                  ))}</ul>
                )}
                {isAdmin && !h.sameOrg && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input aria-label="Namespace in the other org" value={nsRight} onChange={(e) => setNsRight(e.target.value)} placeholder={`Namespace in ${h.right.org.name}`} className={SELECT} />
                    <span className={MUTED}>is</span>
                    <input aria-label="Namespace in this org" value={nsLeft} onChange={(e) => setNsLeft(e.target.value)} placeholder="Namespace here" className={SELECT} />
                    <button type="button" disabled={!nsRight || !nsLeft} onClick={() => { mapping.mutate({ namespace_right: nsRight, namespace_left: nsLeft }); setNsRight(''); setNsLeft('') }}
                      className="rounded-md border border-grove-border px-3 py-1 text-xs font-medium disabled:opacity-50 dark:border-grove-border-dk">Add</button>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold">Renamed items</p>
                {Object.entries(h.mapping.renames).length === 0 ? <p className={MUTED}>None. Use Map on a difference to add one.</p> : (
                  <ul className="space-y-1">{Object.entries(h.mapping.renames).flatMap(([cat, pairs]) => Object.entries(pairs).map(([l, r]) => (
                    <li key={`${cat}|${l}`}>{cat}: <span className="font-mono text-xs">{l}</span> here is <span className="font-mono text-xs">{r}</span> in {h.right.org.name}
                      {isAdmin && <button type="button" className="ml-2 text-xs text-primary-700 hover:underline dark:text-primary-300" onClick={() => mapping.mutate({ category: cat, left_key: l, remove: true })}>Remove</button>}</li>
                  )))}</ul>
                )}
              </div>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  )
}
