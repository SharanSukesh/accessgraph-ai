'use client'

/**
 * API Usage (roadmap item 5): the full breakdown behind the Health Report's
 * API usage card. Overview (the figures, the daily chart, days near the
 * limit), Callers (connected apps and integration users), What's called
 * (API family, resources, objects, Apex REST endpoints and their classes)
 * and Daily (every day's figures). Everything comes from the latest Health
 * Report's metrics.api_usage; nothing is read from Salesforce here.
 */

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Activity, ArrowLeft, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shared/Tabs'
import { VisualDownloadButton } from '@/components/imagePack/VisualDownloadButton'
import {
  type Column,
  DailySection,
  DayTable,
  MUTED,
  ShareBar,
  Sparkline,
  Unavailable,
  UsageFootnote,
  UsageNotes,
  UsageTable,
  UsageTiles,
} from '@/components/apiUsage/ApiUsageParts'
import { useOrgAnalyzerLatest } from '@/lib/api/hooks/useOrgAnalyzer'
import {
  APEX_REST_NOTE,
  type ApexEndpoint,
  type ApiUsage,
  DETAIL_UNVERIFIED,
  type ObjectRow,
  type ResourceRow,
  type UsageShare,
  type UsageSource,
  WHAT_COUNTS,
  apexEndpoint,
  dayLabel,
  headline,
} from '@/lib/apiUsage'

const TABS = ['overview', 'callers', 'called', 'daily'] as const
type Tab = (typeof TABS)[number]

export default function ApiUsagePage() {
  const params = useParams()
  const orgId = params.orgId as string
  const search = useSearchParams()
  const router = useRouter()
  const tab: Tab = (TABS as readonly string[]).includes(search.get('tab') ?? '') ? (search.get('tab') as Tab) : 'overview'
  const { data: summary, isLoading, error } = useOrgAnalyzerLatest(orgId)
  const usage: ApiUsage | undefined = summary?.metrics?.api_usage

  const header = (
    <PageHeader
      icon={Activity}
      eyebrow="Optimize · diagnostics"
      title="API Usage"
      subtitle={
        summary?.snapshot_at
          ? `From the Health Report of ${new Date(summary.snapshot_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'Who spends the org’s daily API requests, and on what'
      }
      actions={
        <>
          <Link
            href={`/orgs/${orgId}/org-analyzer`}
            className="inline-flex items-center gap-1.5 rounded-md border border-grove-border px-2 py-1 text-xs font-medium text-grove-ink/80 hover:bg-primary-50/40 dark:border-grove-border-dk dark:text-grove-ink-dk/80 dark:hover:bg-primary-900/15"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Health Report
          </Link>
          {usage && <VisualDownloadButton orgId={orgId} visual="api_usage" />}
        </>
      }
    />
  )

  if (isLoading) return <PageSkeleton />
  if (error) return <ErrorState message="Failed to load the latest Health Report." onRetry={() => window.location.reload()} />
  if (!summary?.has_data || !usage) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon="data"
          title="No API usage yet"
          description="API usage is collected when the Health Report runs. Run it from the Health Report page."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      {usage.status !== 'ok' ? (
        <Card variant="bordered">
          <CardContent className="space-y-4 pt-6">
            <Unavailable usage={usage} />
            <UsageFootnote usage={usage} />
          </CardContent>
        </Card>
      ) : (
        <Tabs
          defaultValue="overview"
          value={tab}
          onValueChange={(v) => router.replace(`/orgs/${orgId}/api-usage${v === 'overview' ? '' : `?tab=${v}`}`, { scroll: false })}
        >
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="callers">Callers</TabsTrigger>
            <TabsTrigger value="called">What&apos;s called</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><Overview usage={usage} /></TabsContent>
          <TabsContent value="callers"><Callers usage={usage} /></TabsContent>
          <TabsContent value="called"><WhatsCalled usage={usage} /></TabsContent>
          <TabsContent value="daily"><Daily usage={usage} /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function WhatCounts() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-grove-border bg-grove-canvas/40 px-3 py-2.5 text-xs text-grove-ink/80 dark:border-grove-border-dk dark:bg-grove-surface-dk/40 dark:text-grove-ink-dk/80">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">What counts against the daily limit</p>
        {WHAT_COUNTS.map((t) => <p key={t}>{t}</p>)}
      </div>
    </div>
  )
}

function Overview({ usage }: { usage: ApiUsage }) {
  const title = headline(usage)
  return (
    <Card variant="bordered">
      <CardContent className="space-y-5 pt-6">
        {title && <p className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</p>}
        <UsageTiles usage={usage} />
        <UsageNotes usage={usage} />
        <DailySection usage={usage} />
        <WhatCounts />
        <UsageFootnote usage={usage} />
      </CardContent>
    </Card>
  )
}

/** Name, share bar, %, requests and a trend line, for a list of sources. */
function sourceColumns(dates: string[]): Column<UsageSource | UsageShare>[] {
  return [
    {
      head: 'Name',
      cell: (r) => <span className="font-medium text-grove-ink dark:text-grove-ink-dk">{r.name}</span>,
    },
    { head: 'Share', cell: (r) => <ShareBar pct={r.share_pct} other={r.other} /> },
    { head: 'Requests', align: 'right', cell: (r) => r.requests.toLocaleString('en-GB') },
    {
      head: 'Trend',
      cell: (r) => ('series' in r ? <Sparkline series={r.series} dates={dates} /> : <span className={MUTED}>—</span>),
    },
  ]
}

function Callers({ usage }: { usage: ApiUsage }) {
  const dates = (usage.trend ?? []).map((t) => t.date)
  const cols = sourceColumns(dates)
  // Health Reports run before this page carry only the top 8 plus "Other".
  const apps = usage.apps ?? usage.by_app ?? []
  const users = usage.users ?? usage.by_user
  return (
    <div className="space-y-5">
      <UsageTable title="Connected apps" rows={apps} columns={cols} rowKey={(r) => r.id ?? r.name} />
      {users ? (
        <UsageTable
          title="Integration users"
          rows={users}
          columns={cols}
          rowKey={(r) => r.id ?? r.name}
          note="Names follow this client’s privacy level."
        />
      ) : (
        usage.users_hidden_reason && <p className={`text-xs ${MUTED}`}>{usage.users_hidden_reason}</p>
      )}
      <WhatCounts />
      <UsageFootnote usage={usage} />
    </div>
  )
}

function WhatsCalled({ usage }: { usage: ApiUsage }) {
  const dates = (usage.trend ?? []).map((t) => t.date)
  const families = usage.families ?? usage.by_family ?? []
  const detail = usage.detail_days ?? 0
  const partial =
    detail > 0 && detail < usage.days_collected
      ? `Resources and objects cover the ${detail} days since ${dayLabel(usage.detail_first_day ?? '', true)}; earlier days were kept before Newton recorded them.`
      : null
  const resourceCols: Column<ResourceRow>[] = [
    { head: 'Resource', cell: (r) => <code className="text-xs">{r.resource}</code> },
    { head: 'API family', cell: (r) => r.api_family ?? '—' },
    { head: 'Share', cell: (r) => <ShareBar pct={r.share_pct} other={r.resource === 'Other'} /> },
    { head: 'Requests', align: 'right', cell: (r) => r.requests.toLocaleString('en-GB') },
  ]
  const objectCols: Column<ObjectRow>[] = [
    { head: 'Object', cell: (r) => <span className="font-medium">{r.name}</span> },
    { head: 'Requests', align: 'right', cell: (r) => r.requests.toLocaleString('en-GB') },
  ]
  const apexCols: Column<ApexEndpoint>[] = [
    {
      head: 'Endpoint',
      cell: (r) => (r.apex_class ? <code className="text-xs">{apexEndpoint(r)}</code> : <span className={MUTED}>{r.url_mapping}</span>),
    },
    { head: 'Apex class', cell: (r) => r.apex_class ?? '—' },
    { head: 'Requests', align: 'right', cell: (r) => (r.requests ? r.requests.toLocaleString('en-GB') : 'None recorded') },
  ]
  return (
    <div className="space-y-5">
      <UsageTable title="API family" rows={families} columns={sourceColumns(dates)} rowKey={(r) => r.name} />
      {detail === 0 ? (
        <p className={`rounded-md border border-grove-border px-4 py-3 text-xs dark:border-grove-border-dk ${MUTED}`}>
          Resources, objects and Apex REST endpoints appear after the next Health Report run reads the log.
        </p>
      ) : (
        <>
          {partial && <p className={`text-xs ${MUTED}`}>{partial}</p>}
          <UsageTable
            title="Resources requested"
            rows={usage.by_resource ?? []}
            columns={resourceCols}
            rowKey={(r) => `${r.api_family}:${r.resource}`}
            note="Without query strings, record ids or values."
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <UsageTable
              title="Objects requested"
              rows={usage.by_object ?? []}
              columns={objectCols}
              rowKey={(r) => r.name}
              note={usage.objects_note}
            />
            <UsageTable
              title="Apex REST endpoints"
              rows={usage.apex_rest ?? []}
              columns={apexCols}
              rowKey={(r) => `${r.namespace}:${r.url_mapping}:${r.apex_class}`}
              empty={usage.apex_rest_read ? 'No Apex REST classes or requests.' : 'Newton couldn’t read the org’s Apex classes, so endpoints aren’t matched to classes.'}
              note={APEX_REST_NOTE}
            />
          </div>
          <p className={`text-[11px] ${MUTED}`}>UNVERIFIED. {DETAIL_UNVERIFIED}</p>
        </>
      )}
      <UsageFootnote usage={usage} />
    </div>
  )
}

function Daily({ usage }: { usage: ApiUsage }) {
  const trend = usage.trend ?? []
  const apps = usage.apps ?? []
  // The busiest connected app each day, from the per-app series.
  const busiest = (i: number) => {
    let best: UsageSource | null = null
    for (const a of apps) if (!best || (a.series[i] ?? 0) > (best.series[i] ?? 0)) best = a
    return best && best.series[i] ? `${best.name} (${best.series[i].toLocaleString('en-GB')})` : '—'
  }
  return (
    <div className="space-y-4">
      <UsageNotes usage={usage} />
      <DayTable trend={trend} extra={apps.length ? { head: 'Busiest connected app', cell: (_d, i) => busiest(i) } : undefined} />
      <UsageFootnote usage={usage} />
    </div>
  )
}
