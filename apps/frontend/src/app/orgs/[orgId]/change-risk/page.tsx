'use client'

/**
 * Change-Risk Radar page.
 *
 * Pulls SetupAuditTrail via the /change-risk/run endpoint and renders
 * every event on a chronological timeline, badged by a "blast radius"
 * tier (critical / high / medium / low). KPI strip at the top shows
 * how many high-blast events landed in the pull window and the top
 * change agents. Filter chips let the user narrow to a specific tier /
 * section / actor without a new fetch.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Radar,
  Sparkles,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  Users,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useChangeRiskLatest,
  useChangeRiskEvents,
  useRunChangeRisk,
  type BlastTier,
} from '@/lib/api/hooks/useChangeRiskRadar'

export default function ChangeRiskPage() {
  const params = useParams()
  const orgId = params.orgId as string

  // Filter state — kept URL-independent for v1; can promote to
  // searchParams later if we need shareable filter links.
  const [tier, setTier] = useState<BlastTier | undefined>(undefined)
  const [section, setSection] = useState<string | undefined>(undefined)
  const [actor, setActor] = useState<string | undefined>(undefined)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useChangeRiskLatest(orgId)

  const {
    data: eventPage,
    isLoading: eventsLoading,
    error: eventsError,
  } = useChangeRiskEvents(orgId, { tier, section, actor, limit: 100 })

  const runMutation = useRunChangeRisk(orgId)

  const hasFilters = Boolean(tier || section || actor)

  const topSections = useMemo(() => {
    const bySection = summary?.rollups?.by_section ?? {}
    return Object.entries(bySection)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [summary])

  const topActors = useMemo(() => {
    const byActor = summary?.rollups?.by_actor ?? {}
    return Object.entries(byActor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [summary])

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
            : 'Timeline of SetupAuditTrail changes, scored by blast radius'
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runMutation.mutate()}
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
        }
      />

      {/* Inline error from a failed run — makes 500s visible without
          devtools. Mirrors the pattern in /objects. */}
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
              description="Click Run pull to fetch the last 30 days of SetupAuditTrail from Salesforce and score every change by blast radius."
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
                  ? `Since ${formatDate(summary.since)}`
                  : undefined
              }
            />
            <KpiCard
              label="High-blast (≥ 65)"
              value={summary.high_blast_count}
              icon={ShieldAlert}
              iconTone={summary.high_blast_count > 0 ? 'copper' : 'primary'}
              hint="Changes with a blast radius of 65+ — profile edits, permission-set grants, sharing rule tweaks, connected-app installs."
            />
            <KpiCard
              label="Unique actors"
              value={summary.unique_actors}
              icon={Users}
              iconTone="primary"
              hint="Distinct admins who made a logged change in the window."
            />
            <KpiCard
              label="Avg. blast radius"
              value={Math.round(summary.avg_blast_radius)}
              icon={Radar}
              iconTone={
                summary.avg_blast_radius >= 60 ? 'copper' : 'primary'
              }
              hint="Mean 0-100 blast radius across every event. Higher = riskier."
            />
          </div>

          {/* Rollups: top sections + top actors. */}
          {(topSections.length > 0 || topActors.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <RollupCard
                title="Top sections"
                subtitle="Where changes are landing"
                items={topSections}
                onSelect={(name) =>
                  setSection((s) => (s === name ? undefined : name))
                }
                activeSelection={section}
              />
              <RollupCard
                title="Top change agents"
                subtitle="Who's making changes"
                items={topActors}
                onSelect={(name) =>
                  setActor((s) => (s === name ? undefined : name))
                }
                activeSelection={actor}
              />
            </div>
          )}

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
                      <li
                        key={e.id}
                        className="py-3 px-2 flex items-start gap-3"
                      >
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
                    ))}
                  </ul>
                  {eventPage.total > eventPage.events.length && (
                    <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 text-center py-3">
                      Showing {eventPage.events.length} of{' '}
                      {eventPage.total.toLocaleString()} matching events
                    </p>
                  )}
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
                      : 'The pull returned zero SetupAuditTrail rows — nothing changed in the last 30 days, or the connected user lacks View Setup and Configuration.'
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
// Presentational helpers
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

function RollupCard({
  title,
  subtitle,
  items,
  onSelect,
  activeSelection,
}: {
  title: string
  subtitle: string
  items: [string, number][]
  onSelect: (name: string) => void
  activeSelection?: string
}) {
  return (
    <Card variant="bordered">
      <CardContent className="py-5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
            {title}
          </p>
          <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
            {subtitle}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="text-xs italic text-grove-ink/45 dark:text-grove-ink-dk/45">
            No data yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map(([name, count]) => {
              const isActive = activeSelection === name
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onSelect(name)}
                    className={
                      isActive
                        ? 'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800 text-sm text-primary-800 dark:text-primary-200 transition-colors'
                        : 'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 transition-colors'
                    }
                    title={`Filter timeline to ${name}`}
                  >
                    <span className="truncate">{name}</span>
                    <span className="tabular-nums text-grove-ink/60 dark:text-grove-ink-dk/60">
                      {count.toLocaleString()}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
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

// ---------- Formatting ----------

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
