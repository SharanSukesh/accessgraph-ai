'use client'

/**
 * What-if simulator (roadmap item 15): stage permission changes against a
 * snapshot and see who gains, loses and keeps access before anything
 * changes in Salesforce. Scenarios are stored in Newton and never sent to
 * Salesforce. Impact lists are paged on the server; the scenario, tab and
 * list state are in the URL.
 */

import { useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shuffle, Trash2, X as XIcon } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

interface DraftSummary { id: string; name: string; source: string | null; createdBy: string | null; operations: number; updatedAt: string | null; base: { id: string; label: string; takenAt: string } }
interface Change { op: string; index: number; text: string; [k: string]: any }
type Summary = { usersAffected?: number; usersGaining?: number; usersLosing?: number; kept?: number; remainingPaths?: number; operations: number }
type ImpactExtra = { view: string; summary: Summary; unpredictable: string[]; usersAllowed: boolean; note: string | null }

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const SELECT = 'rounded-md bg-grove-surface px-2 py-1.5 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk'
const PRESETS = [['remove_legacy_integration_admin', 'Remove Legacy Integration Admin'], ['split_sales_manager_bundle', 'Split Sales Manager Bundle']] as const
const OP_FIELDS: Record<string, { label: string; fields: [string, string][] }> = {
  assign: { label: 'Assign a set or group to a user', fields: [['user', 'users'], ['set', 'sets+groups']] },
  unassign: { label: 'Remove a set or group from a user', fields: [['user', 'users'], ['set', 'sets+groups']] },
  remove_set: { label: 'Delete a permission set', fields: [['set', 'sets']] },
  add_to_group: { label: 'Add a set to a group', fields: [['group', 'groups'], ['set', 'sets']] },
  remove_from_group: { label: 'Take a set out of a group', fields: [['group', 'groups'], ['set', 'sets']] },
  mute: { label: 'Mute object permissions in a group', fields: [['group', 'groups'], ['object', 'objects']] },
  set_role: { label: 'Move a user to another role', fields: [['user', 'users'], ['role', 'roles']] },
}
const TABS = [['users', 'Who is affected'], ['changes', 'Access by user'], ['items', 'By object'], ['paths', 'Still has it another way'], ['sources', 'By profile, set or group']] as const

function Picker({ orgId, kind, value, onChange }: { orgId: string; kind: string; value: string; onChange: (id: string, name: string) => void }) {
  const [q, setQ] = useState('')
  const kinds = kind === 'sets+groups' ? ['sets', 'groups'] : [kind]
  const results = useQuery({
    queryKey: ['what-if-catalog', orgId, kinds, q],
    queryFn: async () => (await Promise.all(kinds.map((k) => apiClient.get<{ items: { id: string; name: string; detail: string | null }[] }>(
      `/orgs/${orgId}/what-if/catalog?${new URLSearchParams({ kind: k, page: '1', page_size: '25', q })}`)))).flatMap((r) => r.items),
  })
  return (
    <div className="space-y-1">
      <input aria-label={`Find ${kind}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind.replace('+', ' and ')}…`} className={`w-56 ${SELECT}`} />
      <select aria-label={`Pick ${kind}`} value={value} onChange={(e) => onChange(e.target.value, e.target.selectedOptions[0]?.text ?? '')} className={`w-56 ${SELECT}`}>
        <option value="">Pick…</option>
        {results.data?.map((r) => <option key={r.id} value={r.id}>{r.name}{r.detail ? ` (${r.detail})` : ''}</option>)}
      </select>
    </div>
  )
}

export default function WhatIfPage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const draftId = search?.get('draft') || ''
  const view = search?.get('view') || 'users'
  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search?.toString() || '')
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
    for (const k of [...next.keys()]) if (k.startsWith('i.')) next.delete(k)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const drafts = useQuery({ queryKey: ['what-if-drafts', orgId], queryFn: () => apiClient.get<{ drafts: DraftSummary[] }>(`/orgs/${orgId}/what-if/drafts`) })
  const draft = useQuery({
    queryKey: ['what-if-draft', orgId, draftId],
    queryFn: () => apiClient.get<DraftSummary & { changes: Change[] }>(`/orgs/${orgId}/what-if/drafts/${draftId}`),
    enabled: !!draftId,
  })
  const { state, update } = useListState('i', {})
  const impactQ = usePaged<any, ImpactExtra>(['what-if-impact', orgId, draftId, view, draft.data?.operations ?? 0], `/orgs/${orgId}/what-if/drafts/${draftId}/impact`, state, !!draftId, { view })
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('what-if') })
  const create = useMutation({
    mutationFn: (body: Record<string, any>) => apiClient.post<DraftSummary>(`/orgs/${orgId}/what-if/drafts`, body),
    onSuccess: (d) => { refresh(); setParam({ draft: d.id }) },
  })
  const save = useMutation({
    mutationFn: (body: Record<string, any>) => apiClient.put(`/orgs/${orgId}/what-if/drafts/${draftId}`, body),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/orgs/${orgId}/what-if/drafts/${id}`),
    onSuccess: () => { refresh(); setParam({ draft: null }) },
  })
  const [opKind, setOpKind] = useState('assign')
  const [opValues, setOpValues] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<string[]>(['Edit', 'Delete'])
  const addChange = () => {
    const op: Record<string, any> = { op: opKind, ...opValues }
    if (opKind === 'mute') op.flags = flags
    save.mutate({ operations: [...(draft.data?.changes ?? []), op] })
    setOpValues({})
  }
  const removeChange = (i: number) => save.mutate({ operations: (draft.data?.changes ?? []).filter((c) => c.index !== i) })
  // Kept-over data from another tab has other columns: wait for this tab's rows.
  const d = impactQ.data?.view === view ? impactQ.data : undefined
  const all = impactQ.data  // the summary is the same on every tab
  const s = all?.summary

  return (
    <div className="space-y-6">
      <PageHeader icon={Shuffle} title="What-if" eyebrow="Optimize · simulation"
        subtitle="Stage permission changes and see who gains, loses and keeps access, before anything changes in Salesforce. Scenarios stay in Newton." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <Card variant="bordered">
          <CardHeader><CardTitle>Scenarios</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {canWrite && (
              <div className="space-y-2">
                <button type="button" onClick={() => create.mutate({ name: 'New scenario' })} className="w-full rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium dark:border-grove-border-dk">New scenario</button>
                {PRESETS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => create.mutate({ preset: k })} className={`block w-full rounded-md px-3 py-1 text-left text-xs ${MUTED} hover:bg-primary-50/40 dark:hover:bg-primary-900/15`}>Preset: {l}</button>
                ))}
                {create.error && <p className="text-xs text-red-700 dark:text-red-300">{(create.error as Error).message}</p>}
              </div>
            )}
            <ul className="space-y-1" role="listbox" aria-label="Scenarios">
              {drafts.data?.drafts.map((x) => (
                <li key={x.id}>
                  <button type="button" role="option" aria-selected={x.id === draftId} onClick={() => setParam({ draft: x.id })}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${x.id === draftId ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/25 dark:ring-primary-700' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'}`}>
                    <span className="block font-medium">{x.name}</span>
                    <span className={`block text-xs ${MUTED}`}>{x.operations} {x.operations === 1 ? 'change' : 'changes'} · from {x.base.label}</span>
                  </button>
                </li>
              ))}
              {drafts.data && drafts.data.drafts.length === 0 && <li className={`text-sm ${MUTED}`}>No scenarios yet.</li>}
            </ul>
          </CardContent>
        </Card>

        {!draftId ? (
          <Card variant="bordered"><CardContent className={`pt-6 text-sm ${MUTED}`}>Pick a scenario, start a new one, or try a preset.</CardContent></Card>
        ) : !draft.data ? <TableSkeleton rows={8} /> : (
          <div className="space-y-6">
            <Card variant="bordered">
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  {canWrite ? (
                    <input aria-label="Scenario name" defaultValue={draft.data.name} key={draft.data.id}
                      onBlur={(e) => e.target.value !== draft.data!.name && save.mutate({ name: e.target.value })}
                      className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-lg font-semibold ring-1 ring-transparent hover:ring-grove-border focus:ring-grove-border" />
                  ) : <h2 className="flex-1 text-lg font-semibold">{draft.data.name}</h2>}
                  <span className={`text-xs ${MUTED}`}>Starts from {draft.data.base.label} ({new Date(draft.data.base.takenAt).toLocaleDateString('en-GB')})</span>
                  {canWrite && (
                    <button type="button" aria-label="Delete scenario" onClick={() => remove.mutate(draft.data!.id)} className={`rounded p-1 ${MUTED} hover:text-red-700`}><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
                <p className="text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">Staged changes ({draft.data.changes.length})</p>
                <ol className="max-h-56 space-y-1 overflow-auto text-sm">
                  {draft.data.changes.map((c) => (
                    <li key={c.index} className="flex items-center gap-2">
                      <span className={`v2-num w-6 text-right text-xs ${MUTED}`}>{c.index + 1}.</span>
                      <span className="flex-1">{c.text}</span>
                      {canWrite && <button type="button" aria-label={`Remove change ${c.index + 1}`} onClick={() => removeChange(c.index)} className={`${MUTED} hover:text-red-700`}><XIcon className="h-3.5 w-3.5" /></button>}
                    </li>
                  ))}
                  {draft.data.changes.length === 0 && <li className={MUTED}>No changes yet.</li>}
                </ol>
                {canWrite && (
                  <div className="flex flex-wrap items-end gap-3 border-t border-grove-border pt-3 dark:border-grove-border-dk">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className={MUTED}>Add a change</span>
                      <select aria-label="Kind of change" className={SELECT} value={opKind} onChange={(e) => { setOpKind(e.target.value); setOpValues({}) }}>
                        {Object.entries(OP_FIELDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </label>
                    {OP_FIELDS[opKind].fields.map(([field, kind]) => (
                      <Picker key={`${opKind}-${field}`} orgId={orgId} kind={kind} value={opValues[field] ?? ''} onChange={(id) => setOpValues((v) => ({ ...v, [field]: id }))} />
                    ))}
                    {opKind === 'mute' && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {['Read', 'Create', 'Edit', 'Delete', 'View All', 'Modify All'].map((f) => (
                          <label key={f} className="flex items-center gap-1"><input type="checkbox" className="accent-primary-700" checked={flags.includes(f)} onChange={(e) => setFlags((x) => e.target.checked ? [...x, f] : x.filter((y) => y !== f))} />{f}</label>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={addChange} disabled={OP_FIELDS[opKind].fields.some(([f]) => !opValues[f]) || save.isPending}
                      className="rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-grove-canvas disabled:opacity-50">Add</button>
                  </div>
                )}
              </CardContent>
            </Card>

            {all && (
              <>
                {all.usersAllowed && s ? (
                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {[['Users affected', s.usersAffected], ['Lose access', s.usersLosing], ['Gain access', s.usersGaining], ['Permissions kept', s.kept], ['Still has it another way', s.remainingPaths]].map(([l, v]) => (
                      <Card key={l as string} variant="bordered"><CardContent className="pt-5">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{l}</p>
                        <p className="v2-num text-2xl font-bold">{(v ?? 0).toLocaleString('en-US')}</p>
                      </CardContent></Card>
                    ))}
                  </div>
                ) : all.note && <p className={`text-sm ${MUTED}`}>{all.note}</p>}
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                  <p className="font-semibold">What this can&apos;t predict</p>
                  <ul className="mt-1 list-disc pl-4">{all.unpredictable.map((u) => <li key={u}>{u}</li>)}</ul>
                </div>
              </>
            )}
            <Card variant="bordered"><CardContent className="space-y-3 pt-5">
              <div role="tablist" className="flex flex-wrap gap-1 border-b border-grove-border dark:border-grove-border-dk">
                {TABS.filter(([k]) => all?.usersAllowed !== false || k === 'items' || k === 'sources').map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setParam({ view: k })}
                    className={`border-b-2 px-3 py-2 text-sm font-medium ${view === k ? 'border-primary-700' : `border-transparent ${MUTED}`}`}>{l}</button>
                ))}
              </div>
              <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search…" />
              {impactQ.error ? <p className={`text-sm ${MUTED}`}>{(impactQ.error as Error).message}</p> : !d ? <TableSkeleton rows={8} /> : d.total === 0 ? (
                <p className={`text-sm ${MUTED}`}>{draft.data.changes.length ? 'Nothing here for these changes.' : 'Add a change to see its effect.'}</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                        {d.items.map((r: any, i: number) => (
                          <tr key={i}>
                            {view === 'users' && <>
                              <td className="px-3 py-2"><span className="font-medium">{r.name}</span><span className={`block text-xs ${MUTED}`}>{[r.profile, r.role].filter(Boolean).join(' · ')}</span></td>
                              <td className="px-3 py-2 text-xs"><span className="text-red-700 dark:text-red-300">−{r.losses}</span> <span className="text-emerald-700 dark:text-emerald-300">+{r.gains}</span></td>
                              <td className={`px-3 py-2 text-xs ${MUTED}`}>{r.reasons.join('; ')}</td>
                            </>}
                            {view === 'changes' && <>
                              <td className="px-3 py-2">{r.name}</td><td className={`px-3 py-2 text-xs ${MUTED}`}>{r.kind}</td><td className="px-3 py-2 font-mono text-xs">{r.item}</td>
                              <td className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{r.gains.join(', ') || '—'}</td>
                              <td className="px-3 py-2 text-xs text-red-700 dark:text-red-300">{r.loses.join(', ') || '—'}</td>
                              <td className={`px-3 py-2 text-xs ${MUTED}`}>{r.keeps.length ? `keeps ${r.keeps.join(', ')}` : ''}</td>
                            </>}
                            {view === 'items' && <>
                              <td className={`px-3 py-2 text-xs ${MUTED}`}>{r.kind}</td><td className="px-3 py-2 font-mono text-xs">{r.item}</td>
                              <td className="px-3 py-2 text-xs text-red-700 dark:text-red-300">{r.usersLosing} lose</td>
                              <td className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{r.usersGaining} gain</td>
                            </>}
                            {view === 'paths' && <>
                              <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 font-mono text-xs">{r.object}</td>
                              <td className="px-3 py-2 text-xs">still {r.still.join(', ')}</td>
                              <td className={`px-3 py-2 text-xs ${MUTED}`}>via {r.via.join(', ')}</td>
                              <td className={`px-3 py-2 text-xs ${MUTED}`}>after: {r.change}</td>
                            </>}
                            {view === 'sources' && <>
                              <td className="px-3 py-2">{r.source}{r.removed && <Badge variant="default" size="sm" className="ml-2">Removed</Badge>}</td>
                              <td className="px-3 py-2 font-mono text-xs">{r.object}</td>
                              <td className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{r.gains.join(', ') || '—'}</td>
                              <td className="px-3 py-2 text-xs text-red-700 dark:text-red-300">{r.loses.join(', ') || '—'}</td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={d.page} pageSize={d.page_size} total={d.total} label="rows" onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
                </>
              )}
            </CardContent></Card>
          </div>
        )}
      </div>
    </div>
  )
}
