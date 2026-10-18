'use client'

/**
 * User > Pages & automation (roadmap item 1, phase 1): the page layout and
 * Lightning record page this user gets per object and record type, the Apex
 * classes and flows they can run, and the path that grants each. What isn't
 * covered (component visibility rules, Apex-created shares on standard
 * objects) is said on screen.
 */

import { useState } from 'react'
import { Info } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { usePagesAndAutomation } from '@/lib/api/hooks/usePagesAndAutomation'
import { type FlowRow, groupPages, pathLabel, runLabel } from '@/lib/pagesAndAutomation'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const TH = `py-1.5 pr-3 text-left text-xs font-medium ${MUTED}`
const TD = 'py-1.5 pr-3 align-top'

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 text-xs ${MUTED}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  )
}

function Paths({ via }: { via: string[][] }) {
  if (!via.length) return <span className={MUTED}>—</span>
  return (
    <ul className="space-y-0.5">
      {via.map((p) => <li key={p.join('|')}>{pathLabel(p)}</li>)}
    </ul>
  )
}

const RUN_VARIANT: Record<string, 'success' | 'danger' | 'default' | 'warning'> = {
  'Can run': 'success',
  "Can't run": 'danger',
  'Runs on its own': 'default',
  Unknown: 'warning',
}

function flowType(f: FlowRow): string {
  if (f.trigger_type?.startsWith('Record')) return 'Record-triggered'
  if (f.trigger_type === 'Scheduled') return 'Scheduled'
  if (f.trigger_type === 'PlatformEvent') return 'Platform event'
  if (f.process_type === 'Flow') return 'Screen flow'
  if (f.process_type === 'AutoLaunchedFlow') return 'Autolaunched'
  return f.process_type ?? 'Flow'
}

export function PagesAndAutomationPanel({ orgId, userId }: { orgId: string; userId: string }) {
  const { data, isLoading, error, refetch } = usePagesAndAutomation(orgId, userId)
  const [phone, setPhone] = useState(false)
  if (isLoading) return <TableSkeleton rows={6} />
  if (error) return <ErrorState message={(error as Error).message || 'Failed to load.'} onRetry={() => refetch()} />
  if (!data?.available) {
    return (
      <Card variant="bordered">
        <CardContent className="py-6 text-sm">{data?.reason}</CardContent>
      </Card>
    )
  }
  const pages = groupPages((data.pages ?? []).filter((p) => p.form_factor === (phone ? 'Phone' : 'Desktop')))
  const flows = data.flows ?? []

  return (
    <div className="space-y-5">
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Page layouts</CardTitle>
          <p className={`mt-1 text-xs ${MUTED}`}>From the {data.profile} profile, per object and record type.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data.layouts?.length ? (
            <p className={`text-sm ${MUTED}`}>No layout assignments read for this profile.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={TH}>Object</th><th className={TH}>Record type</th><th className={TH}>Layout</th></tr></thead>
                <tbody>
                  {data.layouts.map((l) => (
                    <tr key={`${l.object}|${l.record_type}`} className="border-t border-grove-border dark:border-grove-border-dk">
                      <td className={TD}>{l.object}</td>
                      <td className={TD}>
                        {l.record_type}
                        {!l.record_type_active && <span className={`ml-1 text-xs ${MUTED}`}>(inactive)</span>}
                        {l.default && <Badge variant="info" size="sm" className="ml-1.5">Default</Badge>}
                        {l.available === false && <span className={`ml-1 text-xs ${MUTED}`}>(not available to this profile)</span>}
                      </td>
                      <td className={TD}>{l.layout}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.layout_note && <Note>{data.layout_note}</Note>}
          {data.record_type_visibility_note && <Note>{data.record_type_visibility_note}</Note>}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Lightning record pages</CardTitle>
            <div role="tablist" aria-label="Form factor" className="flex gap-1 rounded-md border border-grove-border p-0.5 text-xs dark:border-grove-border-dk">
              {(['Desktop', 'Phone'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={(f === 'Phone') === phone} onClick={() => setPhone(f === 'Phone')}
                  className={`rounded px-2.5 py-1 ${(f === 'Phone') === phone ? 'bg-primary-700 text-grove-canvas' : ''}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <p className={`mt-1 text-xs ${MUTED}`}>The page this user gets, and the assignment that decided it.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
            Component visibility rules aren&apos;t covered: this shows which page is assigned, not which components on it the
            user sees.
          </p>
          {pages.length === 0 && <p className={`text-sm ${MUTED}`}>No record pages assigned in this org.</p>}
          {pages.map((o) => (
            <div key={o.object}>
              <p className="text-sm font-semibold">{o.object}</p>
              {o.apps.map((a) => (
                <div key={a.app} className="mt-1.5 overflow-x-auto">
                  <p className={`text-xs font-semibold ${MUTED}`}>{a.app}</p>
                  <table className="w-full text-sm">
                    <thead><tr><th className={TH}>Record type</th><th className={TH}>Page</th><th className={TH}>Why</th></tr></thead>
                    <tbody>
                      {a.rows.map((r) => (
                        <tr key={r.record_type} className="border-t border-grove-border dark:border-grove-border-dk">
                          <td className={TD}>{r.record_type}</td>
                          <td className={TD}>{r.page}</td>
                          <td className={`${TD} text-xs`}>
                            {r.rule}
                            <details className={`mt-0.5 ${MUTED}`}>
                              <summary className="cursor-pointer">What was checked</summary>
                              <ol className="ml-4 list-decimal">{r.considered.map((c) => <li key={c}>{c}</li>)}</ol>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
          {(data.page_notes ?? []).filter((n) => !/^Component visibility/.test(n)).map((n) => <Note key={n}>{n}</Note>)}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Apex classes this user can run ({data.apex?.length ?? 0} of {data.apex_total ?? 0})</CardTitle>
          <p className={`mt-1 text-xs ${MUTED}`}>Apex class access granted through the profile, permission sets and permission set groups.</p>
        </CardHeader>
        <CardContent>
          {!data.apex?.length ? (
            <p className={`text-sm ${MUTED}`}>No Apex class access granted.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={TH}>Class</th><th className={TH}>Granted by</th></tr></thead>
                <tbody>
                  {data.apex.map((c) => (
                    <tr key={c.id} className="border-t border-grove-border dark:border-grove-border-dk">
                      <td className={`${TD} font-mono text-xs`}>{c.namespace ? `${c.namespace}.` : ''}{c.name}</td>
                      <td className={`${TD} text-xs`}><Paths via={c.via} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.apex_note && <div className="mt-2"><Note>{data.apex_note}</Note></div>}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Flows</CardTitle>
          <p className="mt-1 text-sm">
            Run Flows permission:{' '}
            <strong>{data.run_flows == null ? 'not read' : data.run_flows ? 'yes' : 'no'}</strong>
            {!!data.run_flows_via?.length && <span className={`text-xs ${MUTED}`}> ({data.run_flows_via.map(pathLabel).join('; ')})</span>}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={TH}>Flow</th><th className={TH}>Type</th><th className={TH}>This user</th><th className={TH}>Why</th><th className={TH}>Granted by</th></tr></thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.id} className="border-t border-grove-border dark:border-grove-border-dk">
                    <td className={TD}>
                      {f.label}
                      {f.restricted && <Badge variant="warning" size="sm" className="ml-1.5">Explicit access</Badge>}
                    </td>
                    <td className={`${TD} text-xs`}>{flowType(f)}</td>
                    <td className={TD}><Badge variant={RUN_VARIANT[runLabel(f)]} size="sm">{runLabel(f)}</Badge></td>
                    <td className={`${TD} text-xs ${MUTED}`}>{f.why}</td>
                    <td className={`${TD} text-xs`}><Paths via={f.via} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data.notes ?? []).map((n) => <Note key={n}>{n}</Note>)}
        </CardContent>
      </Card>

      {data.apex_sharing && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Record access granted by Apex</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{data.apex_sharing.summary}</p>
            {data.apex_sharing.notes.map((n) => <Note key={n}>{n}</Note>)}
          </CardContent>
        </Card>
      )}
      {data.collected_at && (
        <p className={`text-[11px] ${MUTED}`}>Read from Salesforce at the sync of {new Date(data.collected_at).toLocaleString('en-GB')}.</p>
      )}
    </div>
  )
}
