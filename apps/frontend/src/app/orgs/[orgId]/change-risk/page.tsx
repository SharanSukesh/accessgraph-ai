'use client'

/**
 * Change-Risk Radar page — visualised edition.
 *
 * v2 upgrade: adds a top-of-page educational card, a blast-tier
 * distribution donut, a 30-day activity histogram, a suspicious-timing
 * (off-hours) callout, and an actor-risk table. The existing timeline
 * + filter chips remain — the visualisations complement, they don't
 * replace, the raw event list.
 *
 * Chart primitives live in components/shared/ChangeRiskCharts.tsx so
 * the visual language can be re-used on future pages (blast-tier
 * palette + typography + SVG conventions).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Radar,
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Users,
  Clock,
  BookOpen,
  MoonStar,
  UserPlus,
  Layers,
  Boxes,
  Settings2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  TierDonut,
  TierLegend,
  DailyActivityBars,
  HourlyActivityBars,
  HorizontalBarChart,
  ComponentActivityChart,
  TIER_COLORS,
  TIER_LABELS,
} from '@/components/shared/ChangeRiskCharts'
import {
  useChangeRiskLatest,
  useChangeRiskEvents,
  useRunChangeRisk,
  type BlastTier,
  type ChangeEvent,
  type ChangeRiskRunOptions,
} from '@/lib/api/hooks/useChangeRiskRadar'

export default function ChangeRiskPage() {
  const params = useParams()
  const orgId = params.orgId as string

  // Filter state — kept URL-independent for v1.
  const [tier, setTier] = useState<BlastTier | undefined>(undefined)
  const [section, setSection] = useState<string | undefined>(undefined)
  const [actor, setActor] = useState<string | undefined>(undefined)

  // Pagination state — 30 events per page, offset advances by 30.
  const PAGE_SIZE = 30
  const [page, setPage] = useState(0)

  // Business hours config — persisted per-org in localStorage so
  // returning users see their preferred timeframe pre-filled. Any
  // filter change resets pagination so the user doesn't land on an
  // out-of-range page after narrowing the result set.
  const [businessConfig, setBusinessConfig] = useBusinessHoursConfig(orgId)
  useEffect(() => {
    setPage(0)
  }, [tier, section, actor])

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useChangeRiskLatest(orgId)
  const {
    data: eventPage,
    isLoading: eventsLoading,
    error: eventsError,
  } = useChangeRiskEvents(orgId, {
    tier,
    section,
    actor,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const runMutation = useRunChangeRisk(orgId)

  const hasFilters = Boolean(tier || section || actor)

  const topSections = useMemo(() => {
    const bySection = summary?.rollups?.by_section ?? {}
    return Object.entries(bySection)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value, tone: 'primary' as const }))
  }, [summary])

  const tierByDay = useMemo(() => {
    // If the backend gave us per-day counts but not per-day dominant
    // tier, fall back to a heuristic: color days by evergreen. Future
    // backend enhancement could compute the dominant tier per day.
    return {} as Record<string, BlastTier>
  }, [])

  const actorTable = summary?.rollups?.top_actors_detailed ?? []

  // Set-lookup of first-appearance actors so ActorRiskTable can O(1)
  // decide whether to render the "New" badge on each row.
  const newActorsSet = useMemo(
    () => new Set(summary?.rollups?.new_actors ?? []),
    [summary?.rollups?.new_actors]
  )

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load change-risk summary. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Radar}
        title="Change-Risk Radar"
        subtitle={
          summary?.has_data && summary.since && summary.snapshot_at
            ? `Last analysed ${formatRelative(summary.snapshot_at)} · window since ${formatDate(summary.since)}`
            : 'Timeline of Salesforce admin changes, scored by blast radius'
        }
        actions={
          <div className="flex items-center gap-2">
            <BusinessHoursConfigButton
              config={businessConfig}
              onSave={setBusinessConfig}
              disabled={runMutation.isPending}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                runMutation.mutate({
                  businessHoursStart: businessConfig.start,
                  businessHoursEnd: businessConfig.end,
                  businessTimezone: businessConfig.timezone,
                  businessWeekdays: businessConfig.weekdays,
                })
              }
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {runMutation.isPending
                ? 'Analysing…'
                : summary?.has_data
                ? 'Re-run pull'
                : 'Run pull'}
            </Button>
          </div>
        }
      />

      {/* Educational intro — teaches the concepts + orients the reader. */}
      <ExplainerCard />

      {/* Inline error surfacing (same pattern as /objects). */}
      {runMutation.isError && (
        <Card
          variant="bordered"
          className="border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10"
        >
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/25 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  Analysis failed
                </p>
                <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 mt-1 font-mono break-words">
                  {formatRunError(runMutation.error)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* First-visit empty state. */}
      {!summary?.has_data && !summaryLoading && !runMutation.isPending && (
        <Card variant="bordered">
          <CardContent className="py-10">
            <EmptyState
              title="No change-risk data yet"
              description="Click Run pull to fetch the last 30 days of Salesforce SetupAuditTrail and score every admin change by blast radius."
              icon="data"
            />
          </CardContent>
        </Card>
      )}

      {summary?.has_data && (
        <>
          {/* KPI strip. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard
              label="Events in window"
              value={summary.events_ingested}
              icon={Clock}
              iconTone="primary"
              hint={
                summary.since
                  ? `Total admin changes SF logged since ${formatDate(summary.since)}.`
                  : undefined
              }
            />
            <KpiCard
              label="High-blast (≥ 65)"
              value={summary.high_blast_count}
              icon={ShieldAlert}
              iconTone={summary.high_blast_count > 0 ? 'copper' : 'primary'}
              hint="Changes scoring 65+ — profile edits, permission-set grants, sharing rule tweaks, connected-app installs. These are worth reviewing individually."
            />
            <KpiCard
              label="Unique actors"
              value={summary.unique_actors}
              icon={Users}
              iconTone="primary"
              hint="Distinct admins who touched something in the window. A small spike here after a normally-quiet period is a signal to investigate."
            />
            <KpiCard
              label="Avg. blast radius"
              value={Math.round(summary.avg_blast_radius)}
              icon={Radar}
              iconTone={
                summary.avg_blast_radius >= 60 ? 'copper' : 'primary'
              }
              hint="Mean 0-100 blast radius across every scored event. Higher = riskier changes on average."
            />
          </div>

          {/* Analytics row — donut + 30-day activity chart. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Donut + legend */}
            <Card variant="bordered" className="lg:col-span-2">
              <CardContent className="py-5">
                <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  Blast tier distribution
                </p>
                <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                  Where the change activity sits on the risk spectrum.
                </p>
                <div className="mt-4 flex items-center gap-6">
                  <div className="flex-shrink-0">
                    <TierDonut
                      counts={summary.rollups?.by_tier ?? {}}
                      size={172}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <TierLegend
                      counts={summary.rollups?.by_tier ?? {}}
                      percentages={summary.rollups?.by_tier_pct}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily activity histogram — with optional previous-run
                trend line overlay (empty on first-visit orgs). */}
            <Card variant="bordered" className="lg:col-span-3">
              <CardContent className="py-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      Daily activity
                    </p>
                    <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                      Change events per day across the {daysCovered(summary.since)}-day window.
                      {Object.keys(summary.rollups?.previous_by_day ?? {}).length > 0 && (
                        <> The dashed evergreen line overlays the previous run for trend comparison.</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="pt-2">
                  <DailyActivityBars
                    byDay={summary.rollups?.by_day ?? {}}
                    tierByDay={tierByDay}
                    previousByDay={summary.rollups?.previous_by_day}
                    days={30}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hourly distribution — 24 bars showing when during the day
              changes land, with business-hours region shaded so users
              can eyeball whether their config catches the deploy
              window they intended. */}
          {summary.rollups?.by_hour && (
            <Card variant="bordered">
              <CardContent className="py-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800 flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary-700 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      When during the day
                    </p>
                    <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
                      Event count per hour of day in{' '}
                      <strong>{summary.rollups.business_hours_config?.timezone ?? 'UTC'}</strong>.
                      Shaded region ({formatHour(summary.rollups.business_hours_config?.start ?? 9)}
                      {' – '}
                      {formatHour(summary.rollups.business_hours_config?.end ?? 18)})
                      is your business window; bars outside it count toward off-hours.
                    </p>
                  </div>
                </div>
                <HourlyActivityBars
                  byHour={summary.rollups.by_hour}
                  businessStart={summary.rollups.business_hours_config?.start ?? 9}
                  businessEnd={summary.rollups.business_hours_config?.end ?? 18}
                  timezoneLabel={summary.rollups.business_hours_config?.timezone ?? 'UTC'}
                />
              </CardContent>
            </Card>
          )}

          {/* Suspicious-timing callout — only surfaces when off-hours
              activity is non-trivial. */}
          {(summary.rollups?.off_hours_count ?? 0) > 0 && (
            <OffHoursCallout
              offHoursCount={summary.rollups?.off_hours_count ?? 0}
              weekendCount={summary.rollups?.weekend_count ?? 0}
              totalEvents={summary.events_ingested}
            />
          )}

          {/* New-actor callout — surfaces when audits show a first
              appearance from an actor in the org's known history. */}
          {(summary.rollups?.new_actors?.length ?? 0) > 0 && (
            <NewActorsCallout actors={summary.rollups?.new_actors ?? []} />
          )}

          {/* Change bursts — grouped mass-change clusters. */}
          {(summary.rollups?.bursts?.length ?? 0) > 0 && (
            <BurstsSection bursts={summary.rollups?.bursts ?? []} />
          )}

          {/* Component activity — direct metadata queries answer
              "which component types are getting touched most." */}
          {summary.rollups?.component_activity &&
            Object.keys(summary.rollups.component_activity).length > 0 && (
              <Card variant="bordered">
                <CardContent className="py-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800 flex-shrink-0">
                      <Layers className="h-5 w-5 text-primary-700 dark:text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                        Component activity
                      </p>
                      <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
                        Metadata modifications per component type in the
                        last {daysCovered(summary.since)} days. Pulled
                        directly from each object's <span className="font-mono">LastModifiedDate</span>
                        {' '}— unlike the audit trail this is unambiguous about
                        what kind of thing changed. Top-3 modified names appear as pills under each bar.
                      </p>
                    </div>
                  </div>
                  <ComponentActivityChart
                    activity={summary.rollups.component_activity}
                  />
                </CardContent>
              </Card>
            )}

          {/* Rollups: top sections (horizontal bar chart) + actor risk table. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card variant="bordered">
              <CardContent className="py-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Where changes are landing
                  </p>
                  <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                    Setup section by event count. Click a bar to filter
                    the timeline below.
                  </p>
                </div>
                {topSections.length === 0 ? (
                  <p className="text-xs italic text-grove-ink/45 dark:text-grove-ink-dk/45">
                    No section data.
                  </p>
                ) : (
                  <HorizontalBarChart
                    items={topSections}
                    onSelect={(name) =>
                      setSection((s) => (s === name ? undefined : name))
                    }
                    activeSelection={section}
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="bordered">
              <CardContent className="py-5">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Actor risk
                  </p>
                  <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                    Change agents ranked by activity. The <strong>Avg</strong> column shows their mean
                    blast radius — repeat high-blast operators warrant a second look.
                  </p>
                </div>
                <ActorRiskTable
                  actors={actorTable}
                  activeSelection={actor}
                  onSelect={(name) =>
                    setActor((a) => (a === name ? undefined : name))
                  }
                  newActors={newActorsSet}
                />
              </CardContent>
            </Card>
          </div>

          {/* Tier filter chips. */}
          <Card variant="bordered">
            <CardContent className="py-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Tier
                </span>
                <TierChip
                  active={tier === undefined}
                  onClick={() => setTier(undefined)}
                >
                  All
                </TierChip>
                <TierChip
                  tone="critical"
                  active={tier === 'critical'}
                  onClick={() => setTier('critical')}
                  count={summary.rollups?.by_tier?.critical}
                >
                  Critical
                </TierChip>
                <TierChip
                  tone="high"
                  active={tier === 'high'}
                  onClick={() => setTier('high')}
                  count={summary.rollups?.by_tier?.high}
                >
                  High
                </TierChip>
                <TierChip
                  tone="medium"
                  active={tier === 'medium'}
                  onClick={() => setTier('medium')}
                  count={summary.rollups?.by_tier?.medium}
                >
                  Medium
                </TierChip>
                <TierChip
                  tone="low"
                  active={tier === 'low'}
                  onClick={() => setTier('low')}
                  count={summary.rollups?.by_tier?.low}
                >
                  Low
                </TierChip>

                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setTier(undefined)
                      setSection(undefined)
                      setActor(undefined)
                    }}
                    className="ml-auto text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 hover:text-grove-ink dark:hover:text-grove-ink-dk underline underline-offset-2"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {(section || actor) && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {section && (
                    <ActiveFilterPill
                      label="Section"
                      value={section}
                      onClear={() => setSection(undefined)}
                    />
                  )}
                  {actor && (
                    <ActiveFilterPill
                      label="Actor"
                      value={actor}
                      onClear={() => setActor(undefined)}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline. */}
          <Card variant="bordered">
            <CardContent className="py-2">
              {eventsError ? (
                <ErrorState
                  message="Failed to load timeline."
                  onRetry={() => window.location.reload()}
                />
              ) : eventsLoading ? (
                <TableSkeleton rows={8} />
              ) : eventPage && eventPage.events.length > 0 ? (
                <div>
                  <ul className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {eventPage.events.map((e) => (
                      <TimelineEvent key={e.id} event={e} />
                    ))}
                  </ul>
                  <PaginationBar
                    total={eventPage.total}
                    page={page}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                  />
                </div>
              ) : (
                <EmptyState
                  title={
                    hasFilters
                      ? 'No events match the current filters'
                      : 'No change events in the window'
                  }
                  description={
                    hasFilters
                      ? 'Clear the filters or widen the tier selection to see more.'
                      : "The pull returned zero SetupAuditTrail rows — nothing changed in the last 30 days, or the connected user lacks View Setup and Configuration."
                  }
                  icon="search"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ============================================================================
// ExplainerCard — top-of-page educational content
// ============================================================================

/**
 * Three-column card that teaches the concepts on first read. Kept
 * always-visible (not dismissable) so returning users get the reminder
 * — the copy is short enough that it doesn't get in the way.
 */
function ExplainerCard() {
  return (
    <Card variant="bordered" className="grove-copper-wash">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-copper-100 dark:bg-copper-900/25 flex-shrink-0">
            <BookOpen className="h-5 w-5 text-copper-600 dark:text-copper-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              What Change-Risk Radar shows you
            </p>
            <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
              Salesforce writes an audit-trail row for every admin action. This page
              pulls that log, scores each event by <em>blast radius</em>, and lays it
              out so you can spot risky recent changes at a glance.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <ExplainerCol
                title="What it does"
                body={
                  <>
                    Pulls the last 30 days of{' '}
                    <span className="font-mono text-[11px]">SetupAuditTrail</span>{' '}
                    from Salesforce (permission-set grants, profile edits,
                    metadata deploys, connected-app installs, etc.) and scores
                    every entry.
                  </>
                }
              />
              <ExplainerCol
                title="What the score means"
                body={
                  <>
                    <span className="font-medium text-grove-ink dark:text-grove-ink-dk">
                      Blast radius (0–100)
                    </span>{' '}
                    estimates how broadly a change could affect users, data,
                    or access. Base score comes from the Setup section (e.g.
                    Manage Profiles = 80); it's bumped +15 for destructive
                    actions ({<code className="font-mono">delete</code>},{' '}
                    <code className="font-mono">install</code>).
                  </>
                }
              />
              <ExplainerCol
                title="What to watch for"
                body={
                  <>
                    <span className="font-medium text-grove-ink dark:text-grove-ink-dk">
                      Critical / high
                    </span>{' '}
                    events spiking after quiet periods, a single actor making many
                    high-blast changes, and off-hours activity — especially
                    weekends. These often precede an incident.
                  </>
                }
              />
            </div>

            {/* Tier scale legend inline so the score → tier mapping is
                visible before you scroll. */}
            <div className="mt-4 pt-4 border-t border-grove-border dark:border-grove-border-dk">
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55 mb-2">
                Blast tier bands
              </p>
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <BandChip tier="critical" range="80–100" />
                <BandChip tier="high" range="65–79" />
                <BandChip tier="medium" range="40–64" />
                <BandChip tier="low" range="0–39" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ExplainerCol({
  title,
  body,
}: {
  title: string
  body: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1.5">
        {title}
      </p>
      <p className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75 leading-relaxed">
        {body}
      </p>
    </div>
  )
}

function BandChip({
  tier,
  range,
}: {
  tier: keyof typeof TIER_COLORS
  range: string
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{ backgroundColor: TIER_COLORS[tier] }}
        aria-hidden
      />
      <span className="text-grove-ink dark:text-grove-ink-dk font-medium">
        {TIER_LABELS[tier]}
      </span>
      <span className="text-grove-ink/55 dark:text-grove-ink-dk/55 font-mono tabular-nums text-[11px]">
        {range}
      </span>
    </div>
  )
}

// ============================================================================
// OffHoursCallout — surfaces suspicious timing signal
// ============================================================================

function OffHoursCallout({
  offHoursCount,
  weekendCount,
  totalEvents,
}: {
  offHoursCount: number
  weekendCount: number
  totalEvents: number
}) {
  const pct = totalEvents > 0 ? Math.round((offHoursCount / totalEvents) * 100) : 0
  // Only shout if it's more than a rounding-error share.
  const isNotable = pct >= 15 || offHoursCount >= 5
  const toneClasses = isNotable
    ? 'border-copper-200 dark:border-copper-800 bg-copper-50/40 dark:bg-copper-900/10'
    : 'border-grove-border dark:border-grove-border-dk'
  const iconWrapper = isNotable
    ? 'bg-copper-100 dark:bg-copper-900/25'
    : 'bg-primary-50 dark:bg-primary-900/25'
  const iconColor = isNotable
    ? 'text-copper-600 dark:text-copper-400'
    : 'text-primary-700 dark:text-primary-400'

  return (
    <Card variant="bordered" className={toneClasses}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${iconWrapper} flex-shrink-0`}>
            <MoonStar className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              Off-hours activity: {offHoursCount.toLocaleString()} events
              {' '}
              <span className="text-grove-ink/60 dark:text-grove-ink-dk/60 font-normal">
                ({pct}% of the window)
              </span>
            </p>
            <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 mt-1 leading-relaxed">
              Changes made <strong>outside business hours</strong> (before 9 AM,
              after 6 PM UTC) or on weekends
              {weekendCount > 0 && (
                <>
                  {' '}
                  — <strong>{weekendCount.toLocaleString()}</strong> of them landed on a
                  Saturday or Sunday
                </>
              )}
              . Planned deployments explain most of these, but repeat off-hours
              activity from a single actor is worth verifying.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// NewActorsCallout — first-appearance alert
// ============================================================================

function NewActorsCallout({ actors }: { actors: string[] }) {
  // First-appearance is a real signal for consulting engagements — a
  // brand-new admin making changes usually deserves a quick verify.
  // Copper tone matches the OffHoursCallout so both timing signals
  // read as "attention" without shouting.
  return (
    <Card
      variant="bordered"
      className="border-copper-200 dark:border-copper-800 bg-copper-50/40 dark:bg-copper-900/10"
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-copper-100 dark:bg-copper-900/25 flex-shrink-0">
            <UserPlus className="h-5 w-5 text-copper-600 dark:text-copper-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              {actors.length} new change agent
              {actors.length === 1 ? '' : 's'} this window
            </p>
            <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 mt-1 leading-relaxed">
              These actors made setup changes for the first time (across the
              last 10 recorded runs). Worth a quick verification — new admin
              activity often precedes an incident or signals a support
              engineer impersonating a user.
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {actors.slice(0, 8).map((name) => (
                <li
                  key={name}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-grove-surface dark:bg-grove-surface-dk ring-1 ring-copper-200 dark:ring-copper-800"
                >
                  <UserPlus className="h-3 w-3 text-copper-600 dark:text-copper-400" />
                  <span className="text-grove-ink dark:text-grove-ink-dk truncate max-w-[220px]">
                    {name}
                  </span>
                </li>
              ))}
              {actors.length > 8 && (
                <li className="inline-flex items-center px-2 py-0.5 rounded text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">
                  +{actors.length - 8} more
                </li>
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// BurstsSection — collapsed change-cluster rows
// ============================================================================

interface BurstRow {
  actor: string
  section: string
  event_count: number
  start: string
  end: string
  duration_seconds: number
  max_blast: number
  dominant_tier: BlastTier
  sample_displays: string[]
}

function BurstsSection({ bursts }: { bursts: BurstRow[] }) {
  return (
    <Card variant="bordered">
      <CardContent className="py-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800 flex-shrink-0">
            <Boxes className="h-5 w-5 text-primary-700 dark:text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              Change bursts
            </p>
            <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
              Clusters of 3+ events from the same actor in the same section
              within a 5-minute window — usually mass profile deploys or
              batch permission-set grants. Collapsed here so the timeline
              stays scannable.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-grove-border dark:divide-grove-border-dk">
          {bursts.map((b, i) => (
            <li key={`${b.actor}-${b.start}-${i}`} className="py-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TIER_COLORS[b.dominant_tier] }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                      {b.section}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300"
                      title={`${b.event_count} events collapsed`}
                    >
                      {b.event_count.toLocaleString()} events
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${TIER_COLORS[b.dominant_tier]}22`,
                        color: TIER_COLORS[b.dominant_tier],
                      }}
                    >
                      {b.dominant_tier} · max {Math.round(b.max_blast)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                    <span>by {b.actor}</span>
                    <span> · </span>
                    <span>
                      {formatDateTime(b.start)} → {formatDateTime(b.end)}
                    </span>
                    <span> · </span>
                    <span>
                      {b.duration_seconds < 60
                        ? `${b.duration_seconds}s`
                        : `${Math.round(b.duration_seconds / 60)} min`}{' '}
                      window
                    </span>
                  </div>
                  {b.sample_displays.length > 0 && (
                    <ul className="mt-1.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 space-y-0.5 max-w-3xl">
                      {b.sample_displays.slice(0, 2).map((d, j) => (
                        <li key={j} className="truncate">
                          <span className="text-grove-ink/40 dark:text-grove-ink-dk/40">·</span>{' '}
                          {d}
                        </li>
                      ))}
                      {b.event_count > b.sample_displays.length && (
                        <li className="text-grove-ink/45 dark:text-grove-ink-dk/45 italic">
                          + {b.event_count - b.sample_displays.length} more like these
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// ActorRiskTable — actor breakdown with avg blast + off-hours flag
// ============================================================================

function ActorRiskTable({
  actors,
  onSelect,
  activeSelection,
  newActors,
}: {
  actors: {
    name: string
    count: number
    avg_blast: number
    max_blast: number
    max_tier: BlastTier
    off_hours_count: number
  }[]
  onSelect: (name: string) => void
  activeSelection?: string
  newActors?: Set<string>
}) {
  if (actors.length === 0) {
    return (
      <p className="text-xs italic text-grove-ink/45 dark:text-grove-ink-dk/45">
        No actor data yet.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto -mx-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] font-mono uppercase tracking-[0.1em] text-grove-ink/55 dark:text-grove-ink-dk/55">
            <th className="text-left px-3 py-1.5 font-medium">Actor</th>
            <th className="text-right px-3 py-1.5 font-medium tabular-nums">Events</th>
            <th className="text-right px-3 py-1.5 font-medium tabular-nums">Avg</th>
            <th className="text-right px-3 py-1.5 font-medium tabular-nums">Max</th>
            <th className="text-right px-3 py-1.5 font-medium tabular-nums">Off-hrs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-grove-border/60 dark:divide-grove-border-dk/60">
          {actors.map((a) => {
            const isActive = activeSelection === a.name
            return (
              <tr
                key={a.name}
                onClick={() => onSelect(a.name)}
                className={
                  isActive
                    ? 'bg-primary-50/60 dark:bg-primary-900/25 cursor-pointer'
                    : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/15 cursor-pointer'
                }
                title={`Filter timeline to ${a.name}`}
              >
                <td className="px-3 py-1.5 text-grove-ink dark:text-grove-ink-dk max-w-[220px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{a.name}</span>
                    {newActors?.has(a.name) && (
                      <span
                        className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wider bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-400 flex-shrink-0"
                        title="First time we've seen this actor in the org's audit history"
                      >
                        <UserPlus className="h-2.5 w-2.5" />
                        New
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right text-grove-ink/85 dark:text-grove-ink-dk/85">
                  {a.count.toLocaleString()}
                </td>
                <td
                  className="px-3 py-1.5 tabular-nums text-right"
                  style={{
                    color: blastColorForScore(a.avg_blast),
                  }}
                >
                  {Math.round(a.avg_blast)}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right">
                  <TierPill tier={a.max_tier} score={a.max_blast} />
                </td>
                <td className="px-3 py-1.5 tabular-nums text-right text-grove-ink/70 dark:text-grove-ink-dk/70">
                  {a.off_hours_count > 0 ? (
                    <span className="inline-flex items-center gap-1 text-copper-700 dark:text-copper-400 font-medium">
                      <MoonStar className="h-3 w-3" />
                      {a.off_hours_count}
                    </span>
                  ) : (
                    <span className="text-grove-ink/40 dark:text-grove-ink-dk/40">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TierPill({ tier, score }: { tier: BlastTier; score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${blastToneClasses(tier, true)}`}
      title={`Max blast ${Math.round(score)}/100 in this window`}
    >
      {tier}
    </span>
  )
}

function blastColorForScore(score: number): string {
  if (score >= 80) return TIER_COLORS.critical
  if (score >= 65) return TIER_COLORS.high
  if (score >= 40) return TIER_COLORS.medium
  return TIER_COLORS.low
}

// ============================================================================
// Reused primitives from v1 (KPI card, tier chip, timeline event)
// ============================================================================

function KpiCard({
  label,
  value,
  icon: Icon,
  iconTone,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  iconTone: 'primary' | 'copper'
  hint?: string
}) {
  return (
    <Card variant="bordered" className="p-6" title={hint}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk tabular-nums">
            {value.toLocaleString()}
          </p>
        </div>
        <div
          className={
            iconTone === 'copper'
              ? 'p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25 ring-1 ring-copper-200 dark:ring-copper-800'
              : 'p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800'
          }
        >
          <Icon
            className={
              iconTone === 'copper'
                ? 'h-6 w-6 text-copper-600 dark:text-copper-400'
                : 'h-6 w-6 text-primary-700 dark:text-primary-400'
            }
          />
        </div>
      </div>
    </Card>
  )
}

function TierChip({
  tone,
  active,
  onClick,
  count,
  children,
}: {
  tone?: BlastTier
  active: boolean
  onClick: () => void
  count?: number
  children: React.ReactNode
}) {
  const toneClass = tone ? blastToneClasses(tone, active) : neutralToneClasses(active)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${toneClass}`}
    >
      {children}
      {typeof count === 'number' && (
        <span className="ml-1 tabular-nums opacity-60">
          {count.toLocaleString()}
        </span>
      )}
    </button>
  )
}

function ActiveFilterPill({
  label,
  value,
  onClear,
}: {
  label: string
  value: string
  onClear: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk">
      <span className="font-mono text-[10px] uppercase tracking-wider text-grove-ink/55 dark:text-grove-ink-dk/55">
        {label}
      </span>
      <span className="text-grove-ink dark:text-grove-ink-dk">{value}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="text-grove-ink/50 dark:text-grove-ink-dk/50 hover:text-grove-ink dark:hover:text-grove-ink-dk"
      >
        ×
      </button>
    </span>
  )
}

function TimelineEvent({ event: e }: { event: ChangeEvent }) {
  const isOff = isOffHours(e.created_at_sf)
  const isWeekend = isWeekendDay(e.created_at_sf)
  return (
    <li className="py-3 px-2 flex items-start gap-3">
      <BlastTierDot tier={e.blast_tier} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
            {e.section ?? 'Uncategorised'}
          </span>
          {e.action && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/55 dark:text-grove-ink-dk/55">
              {e.action}
            </span>
          )}
          <BlastTierBadge tier={e.blast_tier} score={e.blast_radius} />
          {(isOff || isWeekend) && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-300"
              title="Change happened outside 9-6 UTC weekdays"
            >
              <MoonStar className="h-3 w-3" />
              {isWeekend ? 'Weekend' : 'Off-hours'}
            </span>
          )}
        </div>
        <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 mt-0.5">
          {e.display}
        </p>
        <div className="mt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 flex items-center gap-2 flex-wrap">
          <span>{formatDateTime(e.created_at_sf)}</span>
          {e.actor_name && (
            <>
              <span>·</span>
              <span>by {e.actor_name}</span>
            </>
          )}
          {e.delegate_user && (
            <>
              <span>·</span>
              <span>delegate: {e.delegate_user}</span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

function BlastTierDot({ tier }: { tier: BlastTier }) {
  const cls =
    tier === 'critical'
      ? 'bg-red-500'
      : tier === 'high'
      ? 'bg-copper-500'
      : tier === 'medium'
      ? 'bg-yellow-500'
      : 'bg-primary-400'
  return (
    <span
      className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-grove-canvas dark:ring-grove-canvas-dk ${cls}`}
      aria-hidden
    />
  )
}

function BlastTierBadge({ tier, score }: { tier: BlastTier; score: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${blastToneClasses(tier, true)}`}
      title={`Blast radius ${Math.round(score)}/100`}
    >
      {tier}
      <span className="tabular-nums opacity-70">
        {Math.round(score)}
      </span>
    </span>
  )
}

function blastToneClasses(tier: BlastTier, active: boolean): string {
  const filled: Record<BlastTier, string> = {
    critical:
      'bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-900/25 dark:text-red-300 dark:ring-red-800',
    high:
      'bg-copper-100 text-copper-700 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-300 dark:ring-copper-800',
    medium:
      'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/25 dark:text-yellow-300 dark:ring-yellow-800',
    low:
      'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:ring-primary-800',
  }
  const outline: Record<BlastTier, string> = {
    critical:
      'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15',
    high:
      'text-copper-700 dark:text-copper-400 hover:bg-copper-50 dark:hover:bg-copper-900/15',
    medium:
      'text-yellow-800 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/15',
    low:
      'text-primary-700 dark:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/15',
  }
  return active ? filled[tier] : outline[tier]
}

function neutralToneClasses(active: boolean): string {
  return active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
}

// ---------- Formatting + helpers ----------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.round((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return formatDate(iso)
}

function formatRunError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as Record<string, unknown> & { message?: string }
  const errorData = (e.errorData as Record<string, unknown> | undefined) ?? undefined
  const detail = errorData?.detail as Record<string, unknown> | string | undefined
  if (detail && typeof detail === 'object') {
    const t = detail.error_type as string | undefined
    const msg = detail.error as string | undefined
    if (t && msg) return `${t}: ${msg}`
    if (msg) return msg
  }
  if (typeof detail === 'string') return detail
  if (e.message) return e.message
  return JSON.stringify(err)
}

function daysCovered(sinceIso: string | null): number {
  if (!sinceIso) return 30
  try {
    const since = new Date(sinceIso).getTime()
    const days = Math.round((Date.now() - since) / (1000 * 60 * 60 * 24))
    return days > 0 ? days : 30
  } catch {
    return 30
  }
}

/** Weekend (Sat / Sun) — mirrors the backend definition. */
function isWeekendDay(iso: string): boolean {
  const d = new Date(iso)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** Off-hours = weekend OR outside 09:00-18:00 UTC on weekdays.
 *  Mirrors the backend's `_is_off_hours`. */
function isOffHours(iso: string): boolean {
  const d = new Date(iso)
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return true
  const hour = d.getUTCHours()
  return hour < 9 || hour >= 18
}

// ============================================================================
// Business hours config — per-org localStorage + popover UI
// ============================================================================

/** Shape of the persisted config. Keys match backend params, in the
 *  frontend's cased convention. */
interface BusinessHoursConfig {
  start: number       // 0-24
  end: number         // 0-24
  timezone: string    // IANA name
  weekdays: number[]  // Python weekday indices (Mon=0, Sun=6)
}

const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  start: 9,
  end: 18,
  timezone: 'UTC',
  weekdays: [0, 1, 2, 3, 4],
}

// Curated timezone dropdown. Covers most consulting engagements
// without offering the full IANA list (~500 entries) which would
// overwhelm the popover. "Detect" resolves the browser's IANA name.
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Toronto', label: 'Eastern (Toronto)' },
  { value: 'America/Sao_Paulo', label: 'Brasilia (São Paulo)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (Paris)' },
  { value: 'Europe/Berlin', label: 'Central Europe (Berlin)' },
  { value: 'Asia/Dubai', label: 'Gulf (Dubai)' },
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]

/**
 * Persisted-per-org business-hours config. On first read we fall back
 * to the browser's detected timezone so the default matches "what the
 * user is probably looking at", not literal UTC.
 */
function useBusinessHoursConfig(
  orgId: string,
): [BusinessHoursConfig, (next: BusinessHoursConfig) => void] {
  const key = `newton:change-risk:business-hours:${orgId}`
  const [state, setState] = useState<BusinessHoursConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_BUSINESS_HOURS
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BusinessHoursConfig>
        return {
          start: clampHour(parsed.start ?? DEFAULT_BUSINESS_HOURS.start),
          end: clampHour(parsed.end ?? DEFAULT_BUSINESS_HOURS.end),
          timezone:
            typeof parsed.timezone === 'string'
              ? parsed.timezone
              : detectTimezone(),
          weekdays:
            Array.isArray(parsed.weekdays) && parsed.weekdays.length > 0
              ? parsed.weekdays.filter(
                  (n) => typeof n === 'number' && n >= 0 && n <= 6,
                )
              : DEFAULT_BUSINESS_HOURS.weekdays,
        }
      }
    } catch {
      // Malformed JSON — fall through to defaults.
    }
    return { ...DEFAULT_BUSINESS_HOURS, timezone: detectTimezone() }
  })
  const persistedRef = useRef(state)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (persistedRef.current === state) return
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
      persistedRef.current = state
    } catch {
      // Storage full / private mode — ignore silently, config is
      // still valid for this session.
    }
  }, [key, state])
  return [state, setState]
}

function clampHour(n: number): number {
  return Math.max(0, Math.min(24, Math.round(n)))
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Formats a 0-24 hour as "9am" / "6pm" / "midnight". */
function formatHour(h: number): string {
  if (h === 0 || h === 24) return 'midnight'
  if (h === 12) return 'noon'
  if (h < 12) return `${h}am`
  return `${h - 12}pm`
}

const WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
]

/**
 * Popover button that lets the user set business hours + timezone +
 * business days. Config is applied on the NEXT "Run pull" click; a
 * hint at the bottom of the popover reminds the user of that.
 */
function BusinessHoursConfigButton({
  config,
  onSave,
  disabled,
}: {
  config: BusinessHoursConfig
  onSave: (next: BusinessHoursConfig) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(config)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Reset the draft whenever the popover opens so partial edits
  // don't stick around after closing without a save.
  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])

  // Click-outside to close.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15 border border-grove-border dark:border-grove-border-dk disabled:opacity-50 disabled:cursor-not-allowed"
        title="Configure business hours + timezone used to classify off-hours activity"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>
          {formatHour(config.start)}–{formatHour(config.end)}{' '}
          <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">
            {config.timezone.replace('_', ' ')}
          </span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 rounded-lg border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk shadow-grove-hero p-4">
          <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
            Business hours
          </p>
          <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 mt-0.5">
            Sets the window used to classify off-hours activity on the
            next pull.
          </p>

          <div className="mt-4 space-y-3">
            {/* Start / End hour */}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Start
                </span>
                <select
                  value={draft.start}
                  onChange={(e) =>
                    setDraft({ ...draft, start: Number(e.target.value) })
                  }
                  className="mt-1 w-full text-xs rounded border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-canvas-dk px-2 py-1 text-grove-ink dark:text-grove-ink-dk"
                >
                  {Array.from({ length: 25 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatHour(h)} ({String(h).padStart(2, '0')}:00)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                  End
                </span>
                <select
                  value={draft.end}
                  onChange={(e) =>
                    setDraft({ ...draft, end: Number(e.target.value) })
                  }
                  className="mt-1 w-full text-xs rounded border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-canvas-dk px-2 py-1 text-grove-ink dark:text-grove-ink-dk"
                >
                  {Array.from({ length: 25 }, (_, h) => (
                    <option key={h} value={h}>
                      {formatHour(h)} ({String(h).padStart(2, '0')}:00)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Timezone */}
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                Timezone
              </span>
              <select
                value={draft.timezone}
                onChange={(e) =>
                  setDraft({ ...draft, timezone: e.target.value })
                }
                className="mt-1 w-full text-xs rounded border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-canvas-dk px-2 py-1 text-grove-ink dark:text-grove-ink-dk"
              >
                {/* If the browser's detected TZ isn't in our curated
                    list, still offer it at the top. */}
                {!TIMEZONE_OPTIONS.some((o) => o.value === detectTimezone()) && (
                  <option value={detectTimezone()}>
                    {detectTimezone()} (detected)
                  </option>
                )}
                {TIMEZONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Business days */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                Business days
              </span>
              <div className="mt-1 flex gap-1 flex-wrap">
                {WEEKDAY_LABELS.map((wd) => {
                  const active = draft.weekdays.includes(wd.value)
                  return (
                    <button
                      key={wd.value}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          weekdays: active
                            ? draft.weekdays.filter((v) => v !== wd.value)
                            : [...draft.weekdays, wd.value].sort(),
                        })
                      }
                      className={
                        active
                          ? 'px-2 py-1 rounded text-[11px] font-medium bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-800'
                          : 'px-2 py-1 rounded text-[11px] font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 ring-1 ring-grove-border dark:ring-grove-border-dk hover:text-grove-ink dark:hover:text-grove-ink-dk'
                      }
                    >
                      {wd.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55 mt-4 leading-relaxed">
            Saves per-org in this browser. Applies to the next Run pull.
          </p>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs px-2.5 py-1 rounded text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-grove-ink dark:hover:text-grove-ink-dk"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                // Validate: ensure end > start (else fall back to +1)
                const end = draft.end > draft.start ? draft.end : draft.start + 1
                const weekdays =
                  draft.weekdays.length > 0
                    ? draft.weekdays
                    : DEFAULT_BUSINESS_HOURS.weekdays
                onSave({ ...draft, end: clampHour(end), weekdays })
                setOpen(false)
              }}
              className="text-xs px-2.5 py-1 rounded bg-primary-700 text-grove-canvas hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-500"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PaginationBar — 30-events-per-page controls
// ============================================================================

function PaginationBar({
  total,
  page,
  pageSize,
  onChange,
}: {
  total: number
  page: number
  pageSize: number
  onChange: (next: number) => void
}) {
  if (total <= pageSize) {
    // Single-page result — omit controls but still show a small
    // "N events" caption so the counter is always visible.
    return (
      <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 text-center py-3">
        {total.toLocaleString()} matching event{total === 1 ? '' : 's'}
      </p>
    )
  }
  const totalPages = Math.ceil(total / pageSize)
  const currentPage = page + 1
  const firstOnPage = page * pageSize + 1
  const lastOnPage = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-t border-grove-border dark:border-grove-border-dk">
      <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
        Showing{' '}
        <span className="tabular-nums text-grove-ink dark:text-grove-ink-dk">
          {firstOnPage.toLocaleString()}–{lastOnPage.toLocaleString()}
        </span>{' '}
        of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-grove-ink dark:hover:text-grove-ink-dk disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="text-xs tabular-nums text-grove-ink/60 dark:text-grove-ink-dk/60">
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-grove-ink dark:hover:text-grove-ink-dk disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
