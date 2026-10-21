'use client'

/**
 * User > Pages & automation (roadmap item 1, phase 1): the page layout and
 * Lightning record page this user gets per object and record type, the Apex
 * classes and flows they can run, and the path that grants each. What isn't
 * covered (component visibility rules, Apex-created shares on standard
 * objects) is said on screen.
 *
 * Every section is a card with the same table: row dividers, its count in
 * the card header, rows grouped under their object (collapsible) where that
 * applies, the first 10 rows, and View all for the full list, paged by the
 * server with search and sort (the standing pagination rule).
 * "Granted through" is a path of chips in the access graph's node colours.
 */

import Link from 'next/link'
import { Fragment, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, Info } from 'lucide-react'
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
  pathLabel,
  runLabel,
  sortPages,
} from '@/lib/pagesAndAutomation'
import { ListSearch } from '@/components/shared/ListSearch'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

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

/** A card with its count, a preview of its first rows, notes, and View all. */
function Section({
  title,
  total,
  shown,
  viewAllHref,
  subtitle,
  actions,
  children,
  notes,
  empty,
}: {
  title: string
  total: number
  shown: number
  viewAllHref: string
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
            <span className={`v2-num text-xs font-medium ${MUTED}`}>{total.toLocaleString('en-US')}</span>
          </h3>
          {subtitle && <div className={`mt-0.5 text-xs ${MUTED}`}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      {total === 0 ? (
        <p className={`px-4 py-4 text-sm ${MUTED}`}>{empty}</p>
      ) : (
        <>
          <div className="overflow-auto">{children}</div>
          <div className={`flex flex-wrap items-center justify-between gap-2 border-t border-grove-border px-4 py-2 text-sm dark:border-grove-border-dk ${MUTED}`}>
            <span>Showing {Math.min(shown, total).toLocaleString('en-US')} of {total.toLocaleString('en-US')}</span>
            {total > shown && (
              <Link href={viewAllHref} className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline dark:text-primary-300">
                View all {total.toLocaleString('en-US')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </>
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

type SortProps = { sort: string | null; dir: 'asc' | 'desc'; onSort: (c: string, d: 'asc' | 'desc') => void }
function H({ label, column, sort, className = '' }: { label: string; column?: string; sort?: SortProps; className?: string }) {
  if (sort && column) return <SortHeader label={label} column={column} {...sort} className={`${className}`} />
  return <th className={`${TH} ${className}`}>{label}</th>
}

export function LayoutsTable({ rows, profilePath, sort }: { rows: any[]; profilePath: string[][]; sort?: SortProps }) {
  const groups = useCollapsed()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr><H label="Object" column="object" sort={sort} /><H label="Record type" column="record_type" sort={sort} /><H label="Layout" column="layout" sort={sort} /><H label="Granted by" /></tr>
      </thead>
      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
        {byObject(rows).map((g) => (
          <Fragment key={g.object}>
            <GroupHeader label={g.object} count={g.rows.length} span={4} open={groups.isOpen(g.object)} onToggle={() => groups.toggle(g.object)} />
            {groups.isOpen(g.object) && g.rows.map((l: any) => (
              <tr key={`${l.object}|${l.record_type}`}>
                <td className={`${TD} ${MUTED}`}>{l.object}</td>
                <td className={TD}>
                  {l.record_type}
                  {!l.record_type_active && <span className={`ml-1 text-xs ${MUTED}`}>(inactive)</span>}
                  {l.default && <Badge variant="info" size="sm" className="ml-1.5">Default</Badge>}
                  {l.available === false && <span className={`ml-1 text-xs ${MUTED}`}>(not available to this profile)</span>}
                </td>
                <td className={TD}>{l.layout}</td>
                <td className={TD}><GrantPaths via={profilePath} /></td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

export function PagesTable({ rows, sort }: { rows: any[]; sort?: SortProps }) {
  const groups = useCollapsed()
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <H label="Object" column="object" sort={sort} /><H label="App" /><H label="Record type" />
          <H label="Page" column="page" sort={sort} /><H label="Assignment level" column="rule" sort={sort} /><H label="Why" />
        </tr>
      </thead>
      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
        {byObject(sort ? rows : sortPages(rows)).map((g) => (
          <Fragment key={g.object}>
            <GroupHeader label={g.object} count={g.rows.length} span={6} open={groups.isOpen(g.object)} onToggle={() => groups.toggle(g.object)} />
            {groups.isOpen(g.object) && g.rows.map((r: any) => (
              <tr key={`${r.app}|${r.record_type}|${r.form_factor}`}>
                <td className={`${TD} ${MUTED}`}>{r.object}</td>
                <td className={TD}>{r.app ?? <span className={MUTED}>Any other app</span>}</td>
                <td className={TD}>{r.record_type}</td>
                <td className={`${TD} font-medium`}>{r.page}</td>
                <td className={`${TD} text-xs`}>{r.rule}</td>
                <td className={`${TD} text-xs`}>
                  <details className={MUTED}>
                    <summary className="cursor-pointer">What was checked ({r.considered.length})</summary>
                    <ol className="ml-4 mt-1 list-decimal space-y-0.5">{r.considered.map((c: string) => <li key={c}>{c}</li>)}</ol>
                  </details>
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

export function ApexTable({ rows, sort }: { rows: any[]; sort?: SortProps }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><H label="Class" column="name" sort={sort} /><H label="Granted through" column="paths" sort={sort} className="min-w-[18rem]" /></tr></thead>
      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
        {rows.map((c: any) => (
          <tr key={c.id}>
            <td className={`${TD} font-mono text-xs`}>{c.namespace ? `${c.namespace}.` : ''}{c.name}</td>
            <td className={TD}><GrantPaths via={c.via} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function FlowsTable({ rows, profileId, sort }: { rows: FlowRow[]; profileId?: string; sort?: SortProps }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <H label="Flow" column="label" sort={sort} /><H label="Type" column="type" sort={sort} />
          <H label={profileId ? 'Can run (this profile alone)' : 'Can run'} column="can_run" sort={sort} />
          <H label="Granted through" className="min-w-[18rem]" /><H label="Note" />
        </tr>
      </thead>
      <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
        {rows.map((f) => (
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
  )
}

function FormFactorTabs({ phone, onChange }: { phone: boolean; onChange: (phone: boolean) => void }) {
  return (
    <div role="tablist" aria-label="Form factor" className="flex gap-1 rounded-md border border-grove-border p-0.5 text-xs dark:border-grove-border-dk">
      {(['Desktop', 'Phone'] as const).map((f) => (
        <button key={f} role="tab" aria-selected={(f === 'Phone') === phone} onClick={() => onChange(f === 'Phone')}
          className={`rounded px-2.5 py-1 ${(f === 'Phone') === phone ? 'bg-primary-700 text-grove-canvas' : ''}`}>
          {f}
        </button>
      ))}
    </div>
  )
}

function basePath(orgId: string, userId?: string, profileId?: string) {
  return profileId ? `/orgs/${orgId}/profiles/${profileId}` : `/orgs/${orgId}/users/${userId}`
}

/** A user's view (default), or a profile's on its own (profileId). Each section previews its first rows. */
export function PagesAndAutomationPanel({ orgId, userId, profileId }: { orgId: string; userId?: string; profileId?: string }) {
  const forUser = usePagesAndAutomation(orgId, userId ?? '', !!userId)
  const forProfile = useProfilePagesAndAutomation(orgId, profileId ?? '')
  const { data, isLoading, error, refetch } = profileId ? forProfile : forUser
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
  const counts = data.counts ?? {
    layouts: data.layouts?.length ?? 0, apex: data.apex?.length ?? 0, flows: data.flows?.length ?? 0,
    pages_desktop: (data.pages ?? []).filter((p) => p.form_factor === 'Desktop').length,
    pages_phone: (data.pages ?? []).filter((p) => p.form_factor === 'Phone').length,
  }
  const profilePath = data.profile ? [[`Profile: ${data.profile}`]] : []
  const pages = (data.pages ?? []).filter((p) => p.form_factor === (phone ? 'Phone' : 'Desktop'))
  const base = `${basePath(orgId, userId, profileId)}/pages-and-automation`

  return (
    <div className="space-y-5">
      <Section
        title="Page layouts"
        total={counts.layouts}
        shown={data.layouts?.length ?? 0}
        viewAllHref={`${base}/layouts`}
        subtitle={`From the ${data.profile} profile, per object and record type.`}
        empty="No layout assignments read for this profile."
        notes={(data.layout_note || data.record_type_visibility_note) && (
          <>
            {data.layout_note && <Note>{data.layout_note}</Note>}
            {data.record_type_visibility_note && <Note>{data.record_type_visibility_note}</Note>}
          </>
        )}
      >
        <LayoutsTable rows={data.layouts ?? []} profilePath={profilePath} />
      </Section>

      <Section
        title="Lightning record pages"
        total={phone ? counts.pages_phone : counts.pages_desktop}
        shown={pages.length}
        viewAllHref={`${base}/pages${phone ? '?form_factor=Phone' : ''}`}
        subtitle={`The page ${profileId ? 'this profile' : 'this user'} gets, and the assignment that decided it.`}
        empty="No record pages assigned in this org."
        actions={<FormFactorTabs phone={phone} onChange={setPhone} />}
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
        <PagesTable rows={pages} />
      </Section>

      <Section
        title={profileId ? 'Apex classes this profile grants' : 'Apex classes this user can run'}
        total={counts.apex}
        shown={data.apex?.length ?? 0}
        viewAllHref={`${base}/apex`}
        subtitle={
          <>
            {profileId ? 'Apex class access the profile grants on its own.' : 'Apex class access granted through the profile, permission sets and permission set groups.'}
            {' '}{counts.apex.toLocaleString('en-US')} of the org&apos;s {(data.apex_total ?? 0).toLocaleString('en-US')} classes.
          </>
        }
        empty="No Apex class access granted."
        notes={data.apex_note && <Note>{data.apex_note}</Note>}
      >
        <ApexTable rows={data.apex ?? []} />
      </Section>

      <Section
        title="Flows"
        total={counts.flows}
        shown={data.flows?.length ?? 0}
        viewAllHref={`${base}/flows`}
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
        <FlowsTable rows={data.flows ?? []} profileId={profileId} />
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

export const PA_SECTIONS = {
  layouts: 'Page layouts',
  pages: 'Lightning record pages',
  apex: 'Apex classes',
  flows: 'Flows',
} as const
export type PASection = keyof typeof PA_SECTIONS

/** One section's full list: paged by the server, searchable and sortable, kept in the URL. */
export function PagesAndAutomationList({ orgId, userId, profileId, section }: {
  orgId: string
  userId?: string
  profileId?: string
  section: PASection
}) {
  const defaults = { layouts: 'object', pages: 'object', apex: 'name', flows: 'can_run' } as const
  const { state, update } = useListState('', { sort: defaults[section], filters: section === 'pages' ? ['form_factor'] : [] })
  const endpoint = `/orgs/${orgId}/${profileId ? `profiles/${profileId}` : `users/${userId}`}/pages-and-automation`
  const { data, isLoading, error } = usePaged<any>(['pa-list', orgId, userId ?? profileId, section], endpoint, state, true, { section })
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const phone = state.filters.form_factor === 'Phone'
  return (
    <Card variant="bordered">
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={`Search ${PA_SECTIONS[section].toLowerCase()}...`} />
          {section === 'pages' && <FormFactorTabs phone={phone} onChange={(p) => update({ filters: { form_factor: p ? 'Phone' : '' } })} />}
        </div>
        {error ? (
          <p className={`py-4 text-sm ${MUTED}`}>{(error as Error).message}</p>
        ) : isLoading || !data ? (
          <TableSkeleton rows={10} />
        ) : data.total === 0 ? (
          <p className={`py-4 text-sm ${MUTED}`}>{state.q ? `Nothing matches “${state.q}”.` : 'None.'}</p>
        ) : (
          <>
            <div className="overflow-auto">
              {section === 'layouts' && <LayoutsTable rows={data.items} profilePath={data.profile ? [[`Profile: ${data.profile}`]] : []} sort={sort} />}
              {section === 'pages' && <PagesTable rows={data.items} sort={sort} />}
              {section === 'apex' && <ApexTable rows={data.items} sort={sort} />}
              {section === 'flows' && <FlowsTable rows={data.items} profileId={profileId} sort={sort} />}
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} label={section}
              onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
