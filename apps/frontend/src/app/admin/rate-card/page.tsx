'use client'

/**
 * The firm's rate card and remediation playbooks (P1, P2). Firm data, not a
 * client's: every client roadmap prices from it. Admins edit; analysts can
 * read. Playbooks copied from the examples stay marked "example" until
 * someone reviews them; rates are never copied.
 */

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Route, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const INPUT = 'rounded-md bg-grove-surface px-2 py-1 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk'

interface RateCard { currency: string; roles: { role: string; dayRate: number }[]; updatedBy: string | null; updatedAt: string | null }
interface Playbook {
  key: string; title: string; codes: string[]; sizeCodes?: string[] | null; itemLabel?: string | null; baseDays: [number, number]
  perItemDays: [number, number]; itemCap?: number | null; roles: Record<string, number>; after: string[]; steps: string[]
  prerequisites: string[]; risks: string[]; example?: boolean; version?: string
}
interface Playbooks { playbooks: Playbook[]; version: number; updatedBy: string | null; updatedAt: string | null }

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const mixText = (m: Record<string, number>) => Object.entries(m).map(([r, v]) => `${r}=${Math.round(v * 100)}`).join(', ')
const parseMix = (s: string) => Object.fromEntries(list(s).map((x) => { const [r, v] = x.split('='); return [r.trim(), Number(v) / 100] }))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs"><span className={MUTED}>{label}</span>{children}</label>
}

export default function RateCardPage() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const card = useQuery({ queryKey: ['firm-rate-card'], queryFn: () => apiClient.get<RateCard>('/firm/rate-card') })
  const pbs = useQuery({ queryKey: ['firm-playbooks'], queryFn: () => apiClient.get<Playbooks>('/firm/playbooks') })
  const [roles, setRoles] = useState<{ role: string; dayRate: string }[]>([])
  const [currency, setCurrency] = useState('USD')
  const [books, setBooks] = useState<Playbook[]>([])
  useEffect(() => { if (card.data) { setRoles(card.data.roles.map((r) => ({ role: r.role, dayRate: String(r.dayRate) }))); setCurrency(card.data.currency) } }, [card.data])
  useEffect(() => { if (pbs.data) setBooks(pbs.data.playbooks) }, [pbs.data])
  const saveCard = useMutation({
    mutationFn: () => apiClient.put('/firm/rate-card', { currency, roles: roles.filter((r) => r.role.trim()).map((r) => ({ role: r.role.trim(), dayRate: Number(r.dayRate) })) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-rate-card'] }),
  })
  const saveBooks = useMutation({ mutationFn: () => apiClient.put('/firm/playbooks', { playbooks: books }), onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-playbooks'] }) })
  const examples = useMutation({ mutationFn: () => apiClient.post('/firm/playbooks/examples', {}), onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-playbooks'] }) })
  const set = (i: number, patch: Partial<Playbook>) => setBooks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const ro = !isAdmin

  return (
    <div className="space-y-6">
      <PageHeader icon={Route} title="Rate card and playbooks" eyebrow="Firm settings"
        subtitle="Your firm's day rates and remediation playbooks. Every client roadmap prices from these; they're your data, not the client's." />
      <Card variant="bordered">
        <CardHeader><CardTitle>Rate card</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className={`text-xs ${MUTED}`}>Roles and day rates. A roadmap can override a rate for one engagement. Nothing is filled in for you.</p>
          <Field label="Currency"><input aria-label="Currency" value={currency} disabled={ro} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={`w-20 ${INPUT}`} /></Field>
          {roles.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label="Role" value={r.role} disabled={ro} placeholder="Role" onChange={(e) => setRoles((x) => x.map((y, j) => (j === i ? { ...y, role: e.target.value } : y)))} className={`w-64 ${INPUT}`} />
              <input aria-label={`Day rate for ${r.role || 'role'}`} type="number" min={1} value={r.dayRate} disabled={ro} placeholder="Day rate" onChange={(e) => setRoles((x) => x.map((y, j) => (j === i ? { ...y, dayRate: e.target.value } : y)))} className={`w-32 ${INPUT}`} />
              {!ro && <button type="button" aria-label="Remove role" onClick={() => setRoles((x) => x.filter((_, j) => j !== i))} className={MUTED}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {!ro && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setRoles((x) => [...x, { role: '', dayRate: '' }])} className="inline-flex items-center gap-1 rounded-md border border-grove-border px-3 py-1.5 text-sm dark:border-grove-border-dk"><Plus className="h-4 w-4" />Role</button>
              <button type="button" onClick={() => saveCard.mutate()} className="rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-grove-canvas">Save rate card</button>
            </div>
          )}
          {saveCard.error && <p className="text-xs text-red-700 dark:text-red-300">{(saveCard.error as Error).message}</p>}
          {card.data?.updatedBy && <p className={`text-xs ${MUTED}`}>Last saved by {card.data.updatedBy}</p>}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader><CardTitle>Playbooks{pbs.data?.version ? ` (version ${pbs.data.version})` : ''}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className={`text-xs ${MUTED}`}>Each playbook groups finding codes into a work package and gives a typical effort range: base days plus days per item, for the codes that size it. Ranges, never single numbers.</p>
          {books.length === 0 && !ro && (
            <div className="space-y-1">
              <button type="button" onClick={() => examples.mutate()} className="rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium dark:border-grove-border-dk">Start from the example playbooks</button>
              <p className={`text-xs ${MUTED}`}>Five examples for common Health Report findings. Their day ranges are examples: they stay marked until you review them.</p>
            </div>
          )}
          {books.map((b, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-grove-border p-3 dark:border-grove-border-dk">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Title"><input aria-label="Playbook title" value={b.title} disabled={ro} onChange={(e) => set(i, { title: e.target.value })} className={`w-72 ${INPUT}`} /></Field>
                <Field label="Key"><input aria-label="Playbook key" value={b.key} disabled={ro} onChange={(e) => set(i, { key: e.target.value })} className={`w-44 ${INPUT}`} /></Field>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-primary-700" checked={!!b.example} disabled={ro} onChange={(e) => set(i, { example: e.target.checked })} />Example values (not reviewed)</label>
                {!ro && <button type="button" aria-label={`Delete ${b.title}`} onClick={() => setBooks((x) => x.filter((_, j) => j !== i))} className={`ml-auto ${MUTED}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Finding codes"><input aria-label="Finding codes" value={b.codes.join(', ')} disabled={ro} onChange={(e) => set(i, { codes: list(e.target.value) })} className={`w-96 ${INPUT}`} /></Field>
                <Field label="Codes that size it"><input aria-label="Sizing codes" value={(b.sizeCodes ?? []).join(', ')} disabled={ro} onChange={(e) => set(i, { sizeCodes: list(e.target.value) })} className={`w-72 ${INPUT}`} /></Field>
                <Field label="Items (plural)"><input aria-label="Item label" value={b.itemLabel ?? ''} disabled={ro} onChange={(e) => set(i, { itemLabel: e.target.value })} className={`w-32 ${INPUT}`} /></Field>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {(['baseDays', 'perItemDays'] as const).map((k) => (
                  <Field key={k} label={k === 'baseDays' ? 'Base days (low, high)' : 'Days per item (low, high)'}>
                    <span className="flex gap-1">{[0, 1].map((j) => (
                      <input key={j} aria-label={`${k} ${j ? 'high' : 'low'}`} type="number" min={0} step={0.05} value={b[k][j]} disabled={ro}
                        onChange={(e) => { const v = [...b[k]] as [number, number]; v[j] = Number(e.target.value); set(i, { [k]: v } as Partial<Playbook>) }} className={`w-20 ${INPUT}`} />
                    ))}</span>
                  </Field>
                ))}
                <Field label="Role mix (role=percent, …)"><input aria-label="Role mix" key={`${i}-${mixText(b.roles)}`} defaultValue={mixText(b.roles)} disabled={ro} onBlur={(e) => set(i, { roles: parseMix(e.target.value) })} className={`w-96 ${INPUT}`} /></Field>
                <Field label="After (playbook keys)"><input aria-label="After" value={b.after.join(', ')} disabled={ro} onChange={(e) => set(i, { after: list(e.target.value) })} className={`w-56 ${INPUT}`} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {(['steps', 'prerequisites', 'risks'] as const).map((k) => (
                  <Field key={k} label={k[0].toUpperCase() + k.slice(1) + ' (one per line)'}>
                    <textarea aria-label={k} rows={3} value={b[k].join('\n')} disabled={ro} onChange={(e) => set(i, { [k]: e.target.value.split('\n') } as Partial<Playbook>)} onBlur={(e) => set(i, { [k]: lines(e.target.value) } as Partial<Playbook>)} className={INPUT} />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          {!ro && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setBooks((x) => [...x, { key: `playbook-${x.length + 1}`, title: 'New playbook', codes: [], sizeCodes: [], itemLabel: 'items', baseDays: [1, 2], perItemDays: [0, 0], roles: {}, after: [], steps: [], prerequisites: [], risks: [] }])}
                className="inline-flex items-center gap-1 rounded-md border border-grove-border px-3 py-1.5 text-sm dark:border-grove-border-dk"><Plus className="h-4 w-4" />Playbook</button>
              {books.length > 0 && <button type="button" onClick={() => saveBooks.mutate()} className="rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-grove-canvas">Save playbooks</button>}
            </div>
          )}
          {(saveBooks.error || examples.error) && <p className="text-xs text-red-700 dark:text-red-300">{((saveBooks.error || examples.error) as Error).message}</p>}
          {pbs.data?.updatedBy && <p className={`text-xs ${MUTED}`}>Last saved by {pbs.data.updatedBy}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
