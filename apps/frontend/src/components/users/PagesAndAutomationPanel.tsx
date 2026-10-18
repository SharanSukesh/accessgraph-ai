'use client'

/**
 * User > Pages & automation (roadmap item 1, phase 1): the page layout and
 * Lightning record page this user gets per object and record type, the Apex
 * classes and flows they can run, and the path that grants each. What isn't
 * covered (component visibility rules, Apex-created shares on standard
 * objects) is said on screen.
 *
 * Every section is a card with the same table: row dividers, a sticky
 * header, its count in the card header, rows grouped under their object
 * (collapsible) where that applies, and one search box for the whole tab.
 * "Granted through" is a path of chips in the access graph's node colours.
 */

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { NODE_TYPE_STYLES, hexToRgba } from '@/components/graph/graphStyle'
import { usePagesAndAutomation, useProfilePagesAndAutomation } from '@/lib/api/hooks/usePagesAndAutomation'
import {
  type FlowRow,
  byObject,
  grantStep,
  matches,
  pathLabel,
  runLabel,
  sortPages,
} from '@/lib/pagesAndAutomation'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const TH = `sticky top-0 z-[1] bg-grove-surface px-4 py-2 text-left text-xs font-medium dark:bg-grove-surface-dk ${MUTED}`
const TD = 'px-4 py-2 align-top'

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 text-xs ${MUTED}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  )
}

/** One grant path as chips: "Group › Permission set", coloured like the graph's nodes. */
function GrantPath({ path }: { path: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={pathLabel(path)}>
      {path.map((text, i) => {
        const step = grantStep(text)
        const color = NODE_TYPE_STYLES[step.type].color
        return (
          <Fragment key={text}>
            {i > 0 && <span className={`text-xs ${MUTED}`} aria-hidden>›</span>}
            <span
              className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-grove-ink dark:text-grove-ink-dk"
              style={{ borderColor: hexToRgba(color, 0.55), backgroundColor: hexToRgba(color, 0.1) }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <span className={`shrink-0 ${MUTED}`}>{step.kind}</span>
              <span className="truncate font-medium">{step.name}</span>
            </span>
          </Fragment>
        )
      })}
    </span>
  )
}

function GrantPaths({ via }: { via: string[][] }) {
  if (!via.length) return <span className={MUTED}>—</span>
  return (
    <ul className="space-y-1">
      {via.map((p) => <li key={p.join('|')}><GrantPath path={p} /></li>)}
    </ul>
  )
}

/** A card with its count ("3 of 12" while searching), a scrolling table and notes underneath. */
function Section({
  title,
  shown,
  total,
  subtitle,
  actions,
  children,
  notes,
  empty,
}: {
  title: string
  shown: number
  total: number
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  notes?: React.ReactNode
  empty: string
}) {
  return (
    <Card variant="bordered" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-grove-border px-4 py-3 dark:border-grove-border-dk">
        <div>
          <h3 className="flex items-baseline gap-2 text-base font-semibold text-grove-ink dark:text-grove-ink-dk">
            {title}
            <span className={`v2-num text-xs font-medium ${MUTED}`}>{shown === total ? total : `${shown} of ${total}`}</span>
          </h3>
          {subtitle && <div className={`mt-0.5 text-xs ${MUTED}`}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      {shown === 0 ? (
        <p className={`px-4 py-4 text-sm ${MUTED}`}>{total === 0 ? empty : 'Nothing matches the search.'}</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto">{children}</div>
      )}
      {notes && <div className="space-y-2 border-t border-grove-border px-4 py-3 dark:border-grove-border-dk">{notes}</div>}
    </Card>
  )
}

/** A collapsible object header inside a table body. */
function GroupHeader({ label, count, open, onToggle, span }: { label: string; count: number; open: boolean; onToggle: () => void; span: number }) {
  return (
    <tr className="bg-grove-canvas/60 dark:bg-grove-canvas-dk/40">
      <td colSpan={span} className="px-2 py-1.5">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-1.5 text-left text-sm font-semibold">
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          {label}
          <span className={`v2-num text-xs font-normal ${MUTED}`}>{count}</span>
        </button>
      </td>
    </tr>
  )
}

function useCollapsed() {
  const [closed, setClosed] = useState<Set<string>>(new Set())
  return {
    isOpen: (k: string) => !closed.has(k),
    toggle: (k: string) =>
      setClosed((s) => {
        const next = new Set(s)
        next.has(k) ? next.delete(k) : next.add(k)
        return next
      }),
  }
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

/** A user's view (default), or a profile's on its own (profileId). */
export function PagesAndAutomationPanel({ orgId, userId, profileId }: { orgId: string; userId?: string; profileId?: string }) {
  const forUser = usePagesAndAutomation(orgId, userId ?? '', !!userId)
  const forProfile = useProfilePagesAndAutomation(orgId, profileId ?? '')
  const { data, isLoading, error, refetch } = profileId ? forProfile : forUser
  const [phone, setPhone] = useState(false)
  const [query, setQuery] = useState('')
  const layoutGroups = useCollapsed()
  const pageGroups = useCollapsed()

  const view = useMemo(() => {
    const profilePath = data?.profile ? [[`Profile: ${data.profile}`]] : []
    const layouts = (data?.layouts ?? []).filter((l) => matches(query, l.object, l.record_type, l.layout, profilePath))
    const pagesAll = (data?.pages ?? []).filter((p) => p.form_factor === (phone ? 'Phone' : 'Desktop'))
    const pages = sortPages(pagesAll.filter((p) => matches(query, p.object, p.app ?? 'Any other app', p.record_type, p.page, p.rule)))
    const apex = (data?.apex ?? []).filter((c) => matches(query, c.name, c.namespace, c.via))
    const flows = (data?.flows ?? []).filter((f) => matches(query, f.label, f.api_name, flowType(f), runLabel(f), f.why, f.via))
    return { profilePath, layouts, pagesAll, pages, apex, flows }
  }, [data, phone, query])

  if (isLoading) return <TableSkeleton rows={6} />
  if (error) return <ErrorState message={(error as Error).message || 'Failed to load.'} onRetry={() => refetch()} />
  if (!data?.available) {
    return (
      <Card variant="bordered">
        <CardContent className="py-6 text-sm">{data?.reason}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <label className="relative block max-w-md">
        <span className="sr-only">Search pages and automation</span>
        <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${MUTED}`} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search objects, layouts, pages, classes, flows or grants"
          className="w-full rounded-md border border-grove-border bg-grove-surface py-2 pl-9 pr-3 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
        />
      </label>

      <Section
        title="Page layouts"
        shown={view.layouts.length}
        total={data.layouts?.length ?? 0}
        subtitle={`From the ${data.profile} profile, per object and record type.`}
        empty="No layout assignments read for this profile."
        notes={(data.layout_note || data.record_type_visibility_note) && (
          <>
            {data.layout_note && <Note>{data.layout_note}</Note>}
            {data.record_type_visibility_note && <Note>{data.record_type_visibility_note}</Note>}
          </>
        )}
      >
        <table className="w-full text-sm">
          <thead>
            <tr><th className={TH}>Object</th><th className={TH}>Record type</th><th className={TH}>Layout</th><th className={TH}>Granted by</th></tr>
          </thead>
          <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {byObject(view.layouts).map((g) => (
              <Fragment key={g.object}>
                <GroupHeader label={g.object} count={g.rows.length} span={4} open={layoutGroups.isOpen(g.object)} onToggle={() => layoutGroups.toggle(g.object)} />
                {layoutGroups.isOpen(g.object) && g.rows.map((l) => (
                  <tr key={`${l.object}|${l.record_type}`}>
                    <td className={`${TD} ${MUTED}`}>{l.object}</td>
                    <td className={TD}>
                      {l.record_type}
                      {!l.record_type_active && <span className={`ml-1 text-xs ${MUTED}`}>(inactive)</span>}
                      {l.default && <Badge variant="info" size="sm" className="ml-1.5">Default</Badge>}
                      {l.available === false && <span className={`ml-1 text-xs ${MUTED}`}>(not available to this profile)</span>}
                    </td>
                    <td className={TD}>{l.layout}</td>
                    <td className={TD}><GrantPaths via={view.profilePath} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Lightning record pages"
        shown={view.pages.length}
        total={view.pagesAll.length}
        subtitle={`The page ${profileId ? 'this profile' : 'this user'} gets, and the assignment that decided it.`}
        empty="No record pages assigned in this org."
        actions={
          <div role="tablist" aria-label="Form factor" className="flex gap-1 rounded-md border border-grove-border p-0.5 text-xs dark:border-grove-border-dk">
            {(['Desktop', 'Phone'] as const).map((f) => (
              <button key={f} role="tab" aria-selected={(f === 'Phone') === phone} onClick={() => setPhone(f === 'Phone')}
                className={`rounded px-2.5 py-1 ${(f === 'Phone') === phone ? 'bg-primary-700 text-grove-canvas' : ''}`}>
                {f}
              </button>
            ))}
          </div>
        }
        notes={
          <>
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
              Component visibility rules aren&apos;t covered: this shows which page is assigned, not which components on it the
              user sees.
            </p>
            {(data.page_notes ?? []).filter((n) => !/^Component visibility/.test(n)).map((n) => <Note key={n}>{n}</Note>)}
          </>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Object</th><th className={TH}>App</th><th className={TH}>Record type</th>
              <th className={TH}>Page</th><th className={TH}>Assignment level</th><th className={TH}>Why</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {byObject(view.pages).map((g) => (
              <Fragment key={g.object}>
                <GroupHeader label={g.object} count={g.rows.length} span={6} open={pageGroups.isOpen(g.object)} onToggle={() => pageGroups.toggle(g.object)} />
                {pageGroups.isOpen(g.object) && g.rows.map((r) => (
                  <tr key={`${r.app}|${r.record_type}`}>
                    <td className={`${TD} ${MUTED}`}>{r.object}</td>
                    <td className={TD}>{r.app ?? <span className={MUTED}>Any other app</span>}</td>
                    <td className={TD}>{r.record_type}</td>
                    <td className={`${TD} font-medium`}>{r.page}</td>
                    <td className={`${TD} text-xs`}>{r.rule}</td>
                    <td className={`${TD} text-xs`}>
                      <details className={MUTED}>
                        <summary className="cursor-pointer">What was checked ({r.considered.length})</summary>
                        <ol className="ml-4 mt-1 list-decimal space-y-0.5">{r.considered.map((c) => <li key={c}>{c}</li>)}</ol>
                      </details>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title={profileId ? 'Apex classes this profile grants' : 'Apex classes this user can run'}
        shown={view.apex.length}
        total={data.apex?.length ?? 0}
        subtitle={
          <>
            {profileId ? 'Apex class access the profile grants on its own.' : 'Apex class access granted through the profile, permission sets and permission set groups.'}
            {' '}{data.apex?.length ?? 0} of the org&apos;s {data.apex_total ?? 0} classes.
          </>
        }
        empty="No Apex class access granted."
        notes={data.apex_note && <Note>{data.apex_note}</Note>}
      >
        <table className="w-full text-sm">
          <thead><tr><th className={TH}>Class</th><th className={`${TH} min-w-[18rem]`}>Granted through</th></tr></thead>
          <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {view.apex.map((c) => (
              <tr key={c.id}>
                <td className={`${TD} font-mono text-xs`}>{c.namespace ? `${c.namespace}.` : ''}{c.name}</td>
                <td className={TD}><GrantPaths via={c.via} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Flows"
        shown={view.flows.length}
        total={data.flows?.length ?? 0}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Run Flows permission:{' '}
            <strong className="text-grove-ink dark:text-grove-ink-dk">{data.run_flows == null ? 'not read' : data.run_flows ? 'yes' : 'no'}</strong>
            {(data.run_flows_via ?? []).map((p, i) => (
              <Fragment key={p.join('|')}>
                {i > 0 && <span className={MUTED}>or</span>}
                <GrantPath path={p} />
              </Fragment>
            ))}
          </span>
        }
        empty="No flows read."
        notes={(data.notes ?? []).length > 0 && (data.notes ?? []).map((n) => <Note key={n}>{n}</Note>)}
      >
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Flow</th><th className={TH}>Type</th>
              <th className={TH}>{profileId ? 'Can run (this profile alone)' : 'Can run'}</th>
              <th className={`${TH} min-w-[18rem]`}>Granted through</th><th className={TH}>Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {view.flows.map((f) => (
              <tr key={f.id}>
                <td className={TD}>
                  {f.label}
                  {f.restricted && <Badge variant="warning" size="sm" className="ml-1.5">Explicit access</Badge>}
                </td>
                <td className={`${TD} text-xs`}>{flowType(f)}</td>
                <td className={TD}><Badge variant={RUN_VARIANT[runLabel(f)]} size="sm">{runLabel(f)}</Badge></td>
                <td className={TD}><GrantPaths via={f.via} /></td>
                <td className={`${TD} text-xs ${MUTED}`}>{f.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {data.apex_sharing && (
        <Card variant="bordered">
          <div className="border-b border-grove-border px-4 py-3 dark:border-grove-border-dk">
            <h3 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk">Record access granted by Apex</h3>
          </div>
          <CardContent className="space-y-2 pt-3 text-sm">
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
