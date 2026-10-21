'use client'

/**
 * Priced roadmap (P1): the Health Report's findings grouped into work
 * packages, each with an effort range (inferred from the firm's playbook,
 * or confirmed by a consultant, never merged), a price range from the rate
 * card, estimated savings and dependencies, in phases. Exported as Excel.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Route, Trash2 } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const INPUT = 'rounded-md bg-grove-surface px-2 py-1 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk'

type Range = { low: number; high: number }
interface Finding { key: string; title: string; severity?: string; affected?: number; savingsCents?: number | null; present: boolean; review?: string | null }
interface Pkg {
  id: string; playbook: string | null; title: string; findingKeys: string[]; included: boolean; notes: string; order: number
  roles: Record<string, number> | null; after: string[]; confirmed: (Range & { by?: string; at?: string }) | null
  phase: number; findings: Finding[]; playbookTitle: string | null; playbookExample: boolean; playbookVersion: string | null
  inferred: (Range & { size: number; itemLabel: string | null; capped: boolean }) | null; basis: 'inferred' | 'confirmed' | null
  effort: Range | null; roleMix: Record<string, number>; blendedRate: number | null; missingRates: string[]; price: Range | null; savingsCents: number
}
interface Roadmap {
  id: string; name: string; isDemo: boolean; packages: Pkg[]; notInRoadmap: Finding[]; currency: string
  rates: { role: string; dayRate: number; override: boolean }[]; rateOverrides: Record<string, number>; rateCardSet: boolean
  playbooks: { key: string; title: string; example: boolean }[]; healthReport: { at: string } | null
  rateSource: 'demo' | 'firm-preview' | 'firm'; firmRatesAvailable: boolean | null
  totals: { packages: number; excluded: number; phases: number; effort: Range; inferred: Range & { packages: number }
    confirmed: Range & { packages: number }; price: Range; savingsCents: number; unestimated: string[]; unpriced: string[] }
  labels: { effort: string; savings: string; demo: string | null }
}

const days = (r: Range | null | undefined) => (r ? `${r.low}–${r.high} days` : '—')
const money = (n: number, cur: string) => n.toLocaleString('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 })
const SEV: Record<string, 'danger' | 'high' | 'warning' | 'default' | 'info'> = { critical: 'danger', high: 'high', medium: 'warning', low: 'default', info: 'info' }
const strip = (p: Pkg) => ({ id: p.id, playbook: p.playbook, title: p.title, findingKeys: p.findingKeys, included: p.included, notes: p.notes,
  order: p.order, roles: p.roles, after: p.after, confirmed: p.confirmed ? { low: p.confirmed.low, high: p.confirmed.high } : null })

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card variant="bordered"><CardContent className="pt-5">
      <p className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{label}</p>
      <p className="v2-num text-2xl font-bold">{value}</p>
      {sub && <p className={`mt-1 text-xs ${MUTED}`}>{sub}</p>}
    </CardContent></Card>
  )
}

function Confirmed({ pkg, disabled, onSave }: { pkg: Pkg; disabled: boolean; onSave: (c: Range | null) => void }) {
  const [lo, setLo] = useState(pkg.confirmed ? String(pkg.confirmed.low) : '')
  const [hi, setHi] = useState(pkg.confirmed ? String(pkg.confirmed.high) : '')
  const valid = lo !== '' && hi !== '' && Number(lo) >= 0 && Number(lo) <= Number(hi)
  const changed = lo !== (pkg.confirmed ? String(pkg.confirmed.low) : '') || hi !== (pkg.confirmed ? String(pkg.confirmed.high) : '')
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={MUTED}>Confirmed</span>
      <input aria-label={`Confirmed low days for ${pkg.title}`} type="number" min={0} step={0.5} value={lo} disabled={disabled} onChange={(e) => setLo(e.target.value)} className={`w-16 ${INPUT}`} />
      <span className={MUTED}>to</span>
      <input aria-label={`Confirmed high days for ${pkg.title}`} type="number" min={0} step={0.5} value={hi} disabled={disabled} onChange={(e) => setHi(e.target.value)} className={`w-16 ${INPUT}`} />
      <span className={MUTED}>days</span>
      {!disabled && changed && valid && <button type="button" onClick={() => onSave({ low: Number(lo), high: Number(hi) })} className="rounded bg-primary-700 px-2 py-0.5 font-medium text-grove-canvas">Save</button>}
      {!disabled && pkg.confirmed && !changed && <button type="button" onClick={() => { setLo(''); setHi(''); onSave(null) }} className={`underline ${MUTED}`}>Clear</button>}
      {pkg.confirmed?.by && <span className={MUTED}>by {pkg.confirmed.by}</span>}
    </div>
  )
}

export default function RoadmapPage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { canWrite, isAdmin } = useAuth()
  const qc = useQueryClient()
  const rid = search?.get('roadmap') || ''
  const firmRates = search?.get('rates') === 'firm'
  const pick = (id: string | null, rates = false) => router.replace(id ? `${pathname}?roadmap=${id}${rates ? '&rates=firm' : ''}` : pathname, { scroll: false })
  const list = useQuery({ queryKey: ['roadmaps', orgId], queryFn: () => apiClient.get<{ roadmaps: { id: string; name: string; packages: number }[] }>(`/orgs/${orgId}/roadmaps`) })
  const one = useQuery({ queryKey: ['roadmap', orgId, rid, firmRates], queryFn: () => apiClient.get<Roadmap>(`/orgs/${orgId}/roadmaps/${rid}${firmRates ? '?rates=firm' : ''}`), enabled: !!rid })
  // Edits come back priced with the demo rate card; refetch so a preview stays a preview.
  const done = (d: Roadmap) => { qc.setQueryData(['roadmap', orgId, d.id, false], d); qc.invalidateQueries({ queryKey: ['roadmaps', orgId] }); if (firmRates) qc.invalidateQueries({ queryKey: ['roadmap', orgId, d.id, true] }) }
  const create = useMutation({ mutationFn: () => apiClient.post<Roadmap>(`/orgs/${orgId}/roadmaps`, {}), onSuccess: (d) => { done(d); pick(d.id) } })
  const save = useMutation({ mutationFn: (body: Record<string, any>) => apiClient.put<Roadmap>(`/orgs/${orgId}/roadmaps/${rid}`, body), onSuccess: done })
  const remove = useMutation({ mutationFn: () => apiClient.delete(`/orgs/${orgId}/roadmaps/${rid}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['roadmaps', orgId] }); pick(null) } })
  const r = one.data
  const putPkgs = (fn: (p: Pkg[]) => Pkg[]) => r && save.mutate({ packages: fn(r.packages).map(strip) })
  const edit = (id: string, patch: Partial<Pkg>) => putPkgs((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const phases = r ? Array.from(new Set(r.packages.map((p) => p.phase))).sort((a, b) => a - b) : []
  const titles = Object.fromEntries((r?.packages ?? []).map((p) => [p.id, p.title]))

  return (
    <div className="space-y-6">
      <PageHeader icon={Route} title="Roadmap" eyebrow="Optimize · priced plan"
        subtitle="The Health Report's findings as work packages with effort ranges, prices from your rate card, dependencies and phases. Inferred and consultant-confirmed effort are kept apart." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <Card variant="bordered">
          <CardHeader><CardTitle>Roadmaps</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {canWrite && <button type="button" onClick={() => create.mutate()} disabled={create.isPending} className="w-full rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium dark:border-grove-border-dk">Build from the Health Report</button>}
            {create.error && <p className="text-xs text-red-700 dark:text-red-300">{(create.error as Error).message}</p>}
            <ul className="space-y-1" role="listbox" aria-label="Roadmaps">
              {list.data?.roadmaps.map((x) => (
                <li key={x.id}><button type="button" role="option" aria-selected={x.id === rid} onClick={() => pick(x.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${x.id === rid ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/25 dark:ring-primary-700' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'}`}>
                  <span className="block font-medium">{x.name}</span><span className={`block text-xs ${MUTED}`}>{x.packages} packages</span>
                </button></li>
              ))}
              {list.data && list.data.roadmaps.length === 0 && <li className={`text-sm ${MUTED}`}>No roadmaps yet.</li>}
            </ul>
            <Link href="/admin/rate-card" className={`block text-xs underline ${MUTED}`}>Rate card and playbooks</Link>
          </CardContent>
        </Card>

        {!rid ? <Card variant="bordered"><CardContent className={`pt-6 text-sm ${MUTED}`}>Pick a roadmap or build one from the latest Health Report.</CardContent></Card>
          : !r ? <TableSkeleton rows={8} /> : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? <input aria-label="Roadmap name" key={r.id} defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && save.mutate({ name: e.target.value })}
                className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-xl font-semibold ring-1 ring-transparent hover:ring-grove-border focus:ring-grove-border" />
                : <h2 className="flex-1 text-xl font-semibold">{r.name}</h2>}
              <a href={`${API_BASE}/orgs/${orgId}/roadmaps/${r.id}/export.xlsx`} className="inline-flex items-center gap-2 rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium dark:border-grove-border-dk">
                <FileSpreadsheet className="h-4 w-4" aria-hidden />Excel</a>
              {canWrite && <button type="button" aria-label="Delete roadmap" onClick={() => remove.mutate()} className={`rounded p-1 ${MUTED} hover:text-red-700`}><Trash2 className="h-4 w-4" /></button>}
            </div>
            {r.labels.demo && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">{r.labels.demo}</p>}
            {r.isDemo && (
              <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Rates shown">
                <span className={MUTED}>Rates shown:</span>
                {([[false, 'Demo rate card'], [true, "Preview my firm's rates"]] as const).map(([v, label]) => (
                  <button key={label} type="button" aria-pressed={firmRates === v} disabled={v && !r.firmRatesAvailable && !firmRates} onClick={() => pick(r.id, v)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ring-1 disabled:opacity-50 ${firmRates === v ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>{label}</button>
                ))}
                <span className={`text-xs ${MUTED}`}>{r.firmRatesAvailable === false && !firmRates ? 'Your firm has no rate card yet. ' : ''}Exports and images of a demo org always use the demo rate card.</span>
              </div>
            )}
            {save.error && <p className="text-sm text-red-700 dark:text-red-300">{(save.error as Error).message}</p>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Effort" value={days(r.totals.effort)} sub={[r.totals.inferred.packages && `Inferred ${days(r.totals.inferred)} (${r.totals.inferred.packages})`, r.totals.confirmed.packages ? `confirmed ${days(r.totals.confirmed)} (${r.totals.confirmed.packages})` : 'none confirmed yet'].filter(Boolean).join(' · ')} />
              <Stat label="Price" value={r.totals.price.high ? `${money(r.totals.price.low, r.currency)}–${money(r.totals.price.high, r.currency)}` : '—'} sub={r.totals.unpriced.length ? `Not priced: ${r.totals.unpriced.join(', ')}` : undefined} />
              <Stat label="Estimated savings / yr" value={money(r.totals.savingsCents / 100, 'USD')} sub="Estimated from the Health Report" />
              <Stat label="Packages" value={`${r.totals.packages}`} sub={`${r.totals.phases} phases${r.totals.excluded ? ` · ${r.totals.excluded} left out` : ''}`} />
            </div>
            <p className={`text-xs ${MUTED}`}>{r.labels.effort} {r.labels.savings}</p>
            {(!r.rateCardSet || r.playbooks.length === 0) && (
              <p className="rounded-lg border border-grove-border px-3 py-2 text-sm dark:border-grove-border-dk">
                {r.playbooks.length === 0 ? 'Your firm has no playbooks yet, so no effort is inferred. ' : ''}{!r.rateCardSet ? 'No rate card is set, so nothing is priced. ' : ''}
                <Link href="/admin/rate-card" className="underline">Set them up</Link>.
              </p>
            )}
            {r.totals.unestimated.length > 0 && <p className={`text-sm ${MUTED}`}>Not estimated yet: {r.totals.unestimated.join(', ')}. Enter a confirmed range.</p>}

            {phases.map((ph) => (
              <section key={ph} className="space-y-3" aria-label={`Phase ${ph}`}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">Phase {ph}</h3>
                {r.packages.filter((p) => p.phase === ph).map((p) => (
                  <Card key={p.id} variant="bordered" className={p.included ? '' : 'opacity-60'}>
                    <CardContent className="space-y-3 pt-5">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {canWrite ? <input aria-label="Package title" key={`${p.id}-${p.title}`} defaultValue={p.title} onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && edit(p.id, { title: e.target.value.trim() })}
                              className="min-w-0 flex-1 rounded bg-transparent px-1 font-semibold ring-1 ring-transparent hover:ring-grove-border focus:ring-grove-border" />
                              : <p className="font-semibold">{p.title}</p>}
                            {!p.included && <Badge variant="default" size="sm">Left out</Badge>}
                          </div>
                          <p className={`text-xs ${MUTED}`}>{p.playbookTitle ? `Playbook ${p.playbookTitle === p.title ? '' : `${p.playbookTitle} `}${p.playbookVersion}${p.playbookExample ? ' · example values' : ''}` : 'No playbook'}
                            {p.after.length > 0 && ` · after ${p.after.map((a) => titles[a] ?? a).join(', ')}`}</p>
                        </div>
                        <div className="text-right">
                          <p className="v2-num font-semibold">{p.price ? `${money(p.price.low, r.currency)}–${money(p.price.high, r.currency)}` : '—'}</p>
                          <p className={`text-xs ${MUTED}`}>{p.effort ? `${days(p.effort)} · ${p.basis}` : 'not estimated'}{p.blendedRate ? ` · ${money(p.blendedRate, r.currency)}/day` : ''}</p>
                          {p.missingRates.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">No rate for {p.missingRates.join(', ')}</p>}
                        </div>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {p.findings.map((f) => (
                          <li key={f.key} className="flex flex-wrap items-center gap-2">
                            {f.severity && <Badge variant={SEV[f.severity] ?? 'default'} size="sm">{f.severity}</Badge>}
                            <span className={f.present ? '' : `italic ${MUTED}`}>{f.title}</span>
                            {f.savingsCents ? <span className={`text-xs ${MUTED}`}>{money(f.savingsCents / 100, 'USD')}/yr est.</span> : null}
                            {f.review && <span className={`text-xs ${MUTED}`}>reviewed: {f.review.replace('_', ' ')}</span>}
                            {canWrite && <button type="button" aria-label={`Take ${f.title} out of ${p.title}`} onClick={() => edit(p.id, { findingKeys: p.findingKeys.filter((k) => k !== f.key) })} className={`text-xs underline ${MUTED}`}>remove</button>}
                          </li>
                        ))}
                        {p.findings.length === 0 && <li className={MUTED}>No findings: a package of your own.</li>}
                      </ul>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-grove-border pt-3 text-xs dark:border-grove-border-dk">
                        <span><span className={MUTED}>Inferred</span> {p.inferred ? `${days(p.inferred)} (sized by ${p.inferred.size} ${p.inferred.itemLabel ?? 'items'}${p.inferred.capped ? ', capped' : ''})` : '—'}</span>
                        <Confirmed key={`${p.id}-${p.confirmed?.low}-${p.confirmed?.high}`} pkg={p} disabled={!canWrite} onSave={(c) => edit(p.id, { confirmed: c })} />
                        {canWrite && <label className="flex items-center gap-1"><input type="checkbox" className="accent-primary-700" checked={p.included} onChange={(e) => edit(p.id, { included: e.target.checked })} />In plan</label>}
                        {canWrite && (
                          <label className="flex items-center gap-1"><span className={MUTED}>After</span>
                            <select aria-label={`${p.title} comes after`} className={`w-48 ${INPUT}`} value="" onChange={(e) => e.target.value && edit(p.id, { after: [...p.after, e.target.value] })}>
                              <option value="">add…</option>
                              {r.packages.filter((o) => o.id !== p.id && !p.after.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                            </select>
                            {p.after.length > 0 && <button type="button" onClick={() => edit(p.id, { after: [] })} className={`underline ${MUTED}`}>clear</button>}
                          </label>
                        )}
                      </div>
                      {canWrite ? <textarea aria-label={`Notes for ${p.title}`} key={`${p.id}-notes`} defaultValue={p.notes} placeholder="Notes for the client (scope, assumptions)…" rows={2}
                        onBlur={(e) => e.target.value !== p.notes && edit(p.id, { notes: e.target.value })} className={`w-full ${INPUT}`} />
                        : p.notes && <p className="text-sm">{p.notes}</p>}
                    </CardContent>
                  </Card>
                ))}
              </section>
            ))}
            {canWrite && <button type="button" onClick={() => save.mutate({ packages: [...r.packages.map(strip), { id: `pkg-${Date.now().toString(36)}`, playbook: null, title: 'New package', findingKeys: [], included: true, notes: '', order: r.packages.length, roles: null, after: [], confirmed: null }] })}
              className="rounded-md border border-dashed border-grove-border px-3 py-1.5 text-sm dark:border-grove-border-dk">Add a package of your own</button>}

            {r.notInRoadmap.length > 0 && (
              <Card variant="bordered"><CardHeader><CardTitle>Findings not in the roadmap ({r.notInRoadmap.length})</CardTitle></CardHeader>
                <CardContent><ul className="space-y-1 text-sm">
                  {r.notInRoadmap.map((f) => (
                    <li key={f.key} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">{f.title}</span>{f.review && <span className={`text-xs ${MUTED}`}>reviewed: {f.review.replace('_', ' ')}</span>}
                      {canWrite && <select aria-label={`Add ${f.title} to a package`} className={INPUT} value="" onChange={(e) => e.target.value && edit(e.target.value, { findingKeys: [...(r.packages.find((p) => p.id === e.target.value)?.findingKeys ?? []), f.key] })}>
                        <option value="">Add to…</option>{r.packages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                      </select>}
                    </li>
                  ))}
                </ul></CardContent></Card>
            )}

            <Card variant="bordered"><CardHeader><CardTitle>Day rates</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {r.rates.length === 0 && <p className={MUTED}>No rate card.</p>}
                {r.rates.map((x) => (
                  <div key={x.role} className="flex flex-wrap items-center gap-3">
                    <span className="w-56">{x.role}</span><span className="v2-num w-24">{money(x.dayRate, r.currency)}</span>
                    <span className={`text-xs ${MUTED}`}>{x.override ? 'this engagement' : r.rateSource === 'demo' ? 'demo rate card' : r.rateSource === 'firm-preview' ? 'firm rate card (preview)' : 'firm rate card'}</span>
                    {canWrite && !r.isDemo && <input aria-label={`Engagement rate for ${x.role}`} type="number" min={1} placeholder="Override" defaultValue={r.rateOverrides[x.role] ?? ''} className={`w-28 ${INPUT}`}
                      onBlur={(e) => { const o = { ...r.rateOverrides }; if (e.target.value) o[x.role] = Number(e.target.value); else delete o[x.role]; save.mutate({ rate_overrides: o }) }} />}
                  </div>
                ))}
                {isAdmin && !r.isDemo && <Link href="/admin/rate-card" className={`text-xs underline ${MUTED}`}>Edit the firm&apos;s rate card</Link>}
              </CardContent></Card>
          </div>
        )}
      </div>
    </div>
  )
}
