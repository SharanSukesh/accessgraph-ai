'use client'

/**
 * Automation Sprawl page.
 *
 * Inventory of every Flow + Apex Trigger in the org, tiered by
 * validity + ownership + staleness. Mirror of the Report Sprawl UX.
 *
 * Tiers (precedence — broken > orphaned > dormant > active):
 *   - broken:   Flow IsOutOfDate=true OR ApexTrigger IsValid=false.
 *               Actively causing runtime errors.
 *   - orphaned: Last modifier is inactive — no one accountable.
 *   - dormant:  Active but not modified in 12+ months.
 *   - active:   Modified in last 12 months + owner active.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Workflow,
  Sparkles,
  Loader2,
  AlertTriangle,
  Search,
  Copy,
  UserX,
  UserCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  Cpu,
  AlertCircle,
  PauseCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useAutomationSprawlLatest,
  useAutomationSprawlItems,
  useRunAutomationSprawl,
  type AutomationItem,
  type AutomationTier,
  type AutomationItemType,
  type AutomationSourceDiagnostics,
} from '@/lib/api/hooks/useAutomationSprawl'

const PAGE_SIZE = 30

export function AutomationSprawlView({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useParams()
  const orgId = params.orgId as string

  const [tier, setTier] = useState<AutomationTier | undefined>(undefined)
  const [itemType, setItemType] = useState<AutomationItemType | undefined>(
    undefined,
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useAutomationSprawlLatest(orgId)
  const {
    data: itemPage,
    isLoading: itemsLoading,
    error: itemsError,
  } = useAutomationSprawlItems(orgId, {
    tier,
    item_type: itemType,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const runMutation = useRunAutomationSprawl(orgId)

  const changeFilter = (fn: () => void) => {
    fn()
    setPage(0)
  }

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load automation-sprawl summary."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {!embedded && <PageHeader
        icon={Workflow}
        title="Automation Sprawl"
        subtitle={
          summary?.has_data && summary.snapshot_at
            ? `Last analysed ${formatRelative(summary.snapshot_at)} · ${summary.items_total.toLocaleString()} automation${summary.items_total === 1 ? '' : 's'} inventoried`
            : 'Inventory + tier scoring for every Flow and Apex Trigger'
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
              ? 'Re-analyse'
              : 'Analyse automations'}
          </Button>
        }
      />}

      {runMutation.isError && (
        <Card variant="bordered" className="p-4 border-red-300 dark:border-red-800">
          <div className="flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-700 dark:text-red-400">
                Analysis failed
              </div>
              <div className="text-red-700/80 dark:text-red-400/80 mt-1">
                {formatRunError(runMutation.error)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {summaryLoading ? (
        <TableSkeleton />
      ) : !summary?.has_data ? (
        <EmptyState
          icon="database"
          title="No sprawl analysis yet"
          description="Click Analyse automations to inventory every Flow + Apex Trigger and tier each by compile validity, ownership, and staleness."
        />
      ) : summary.items_total === 0 ? (
        <CleanShopState summary={summary} />
      ) : (
        <>
          {/* KPI strip — 5 cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <TierKpi
              label="Total automations"
              value={summary.items_total}
              icon={Workflow}
              tone="neutral"
              hint={`${summary.flows_total.toLocaleString()} flow${summary.flows_total === 1 ? '' : 's'} + ${summary.triggers_total.toLocaleString()} trigger${summary.triggers_total === 1 ? '' : 's'}`}
            />
            <TierKpi
              label="Active"
              value={summary.items_active}
              icon={Zap}
              tone="primary"
              hint="Modified in the last 12 months with an active owner"
            />
            <TierKpi
              label="Dormant"
              value={summary.items_dormant}
              icon={PauseCircle}
              tone="copper"
              hint={
                summary.avg_days_since_modified
                  ? `Avg. ${summary.avg_days_since_modified} days since last modification`
                  : 'Currently active but not modified in >12 months'
              }
            />
            <TierKpi
              label="Orphaned"
              value={summary.items_orphaned}
              icon={UserX}
              tone="danger"
              hint="Last modifier is inactive — no one accountable"
            />
            <TierKpi
              label="Broken"
              value={summary.items_broken}
              icon={AlertCircle}
              tone="danger"
              hint="Flow out-of-date OR trigger fails to compile — actively causing runtime errors"
            />
          </div>

          {/* Methodology caveat */}
          <Card variant="bordered" className="p-4">
            <div className="flex items-start gap-3 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
              <AlertTriangle className="h-4 w-4 text-copper-600 dark:text-copper-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-grove-ink dark:text-grove-ink-dk">
                  How this is scored
                </strong>{' '}
                — tiers use precedence{' '}
                <strong>
                  broken &gt; orphaned &gt; dormant &gt; active
                </strong>
                . Broken tops the list because these are actively firing
                with invalid logic or against a stale schema (silent data
                errors). Dormant means "still switched on but nobody has
                touched it in a year" — the classic Salesforce cleanup
                surface. Duplicate name clusters are surfaced on individual
                cards but don&rsquo;t override tier.
              </div>
            </div>
          </Card>

          {/* Filters */}
          <Card variant="bordered" className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) =>
                    changeFilter(() => setSearch(e.target.value))
                  }
                  placeholder="Search by name or API name…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>

              <div className="flex gap-1">
                <TypeChip
                  active={itemType === undefined}
                  onClick={() => changeFilter(() => setItemType(undefined))}
                >
                  All types
                </TypeChip>
                <TypeChip
                  icon={Workflow}
                  active={itemType === 'flow'}
                  onClick={() => changeFilter(() => setItemType('flow'))}
                >
                  Flows
                </TypeChip>
                <TypeChip
                  icon={Cpu}
                  active={itemType === 'trigger'}
                  onClick={() => changeFilter(() => setItemType('trigger'))}
                >
                  Triggers
                </TypeChip>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <TierChip
                active={tier === undefined}
                onClick={() => changeFilter(() => setTier(undefined))}
              >
                All tiers ({summary.items_total.toLocaleString()})
              </TierChip>
              <TierChip
                tone="broken"
                active={tier === 'broken'}
                onClick={() => changeFilter(() => setTier('broken'))}
              >
                Broken ({summary.items_broken.toLocaleString()})
              </TierChip>
              <TierChip
                tone="orphaned"
                active={tier === 'orphaned'}
                onClick={() => changeFilter(() => setTier('orphaned'))}
              >
                Orphaned ({summary.items_orphaned.toLocaleString()})
              </TierChip>
              <TierChip
                tone="dormant"
                active={tier === 'dormant'}
                onClick={() => changeFilter(() => setTier('dormant'))}
              >
                Dormant ({summary.items_dormant.toLocaleString()})
              </TierChip>
              <TierChip
                tone="active"
                active={tier === 'active'}
                onClick={() => changeFilter(() => setTier('active'))}
              >
                Active ({summary.items_active.toLocaleString()})
              </TierChip>
            </div>
          </Card>

          {/* Item list */}
          {itemsError ? (
            <ErrorState
              message="Failed to load automations."
              onRetry={() => window.location.reload()}
            />
          ) : itemsLoading ? (
            <TableSkeleton />
          ) : !itemPage || itemPage.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="No automations match the filters"
              description="Adjust the tier or type filters, or clear the search."
            />
          ) : (
            <>
              <div className="space-y-3">
                {itemPage.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    expanded={expandedId === item.id}
                    onToggle={() =>
                      setExpandedId(
                        expandedId === item.id ? null : item.id,
                      )
                    }
                  />
                ))}
              </div>

              <PaginationBar
                total={itemPage.total}
                page={page}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Zero-items state
// ============================================================================

function CleanShopState({
  summary,
}: {
  summary: {
    snapshot_at: string | null
    duration_ms: number | null
    source_diagnostics: AutomationSourceDiagnostics | null
  }
}) {
  const diag = summary.source_diagnostics
  const flowsCount = diag?.flows?.raw_count ?? null
  const triggersCount = diag?.triggers?.raw_count ?? null
  const flowsError = diag?.flows?.error ?? null
  const triggersError = diag?.triggers?.error ?? null
  const usersError = diag?.users?.error ?? null
  const hasAnyError = Boolean(flowsError || triggersError || usersError)

  return (
    <Card variant="bordered" className="p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-3xl mx-auto">
        <div className="p-4 rounded-full bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800">
          <Workflow className="h-10 w-10 text-primary-700 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
            Analysis complete — 0 automations found
          </h3>
          <p className="mt-2 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70 leading-relaxed">
            The sprawl scan ran successfully
            {summary.duration_ms !== null && (
              <> ({(summary.duration_ms / 1000).toFixed(1)}s)</>
            )}
            .{' '}
            {hasAnyError
              ? 'One or more Salesforce queries hit an error — see below.'
              : 'Salesforce returned no Flow or ApexTrigger rows.'}
          </p>
        </div>

        {/* Actual diagnostics from this run — never a silent zero. */}
        {diag && (
          <div className="w-full text-left rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-3">
              What Salesforce actually returned
            </div>
            <dl className="space-y-2 text-sm">
              <DiagRow
                label="FlowDefinitionView"
                count={flowsCount}
                error={flowsError}
              />
              <DiagRow
                label="ApexTrigger"
                count={triggersCount}
                error={triggersError}
              />
              <DiagRow
                label="User lookup"
                count={diag.users?.resolved_count ?? null}
                error={usersError}
                unit="resolved"
              />
            </dl>
          </div>
        )}

        <div className="w-full text-left rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-3">
            Likely causes when raw counts are 0
          </div>
          <ol className="space-y-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                1
              </span>
              <span>
                <strong>Freshly-created content hasn&rsquo;t propagated.</strong>{' '}
                If you just created a trigger, the SF metadata index
                sometimes lags a minute or two before the row appears
                in Tooling queries. Wait 30-60 seconds and re-analyse.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                2
              </span>
              <span>
                <strong>The org genuinely has no Flows or
                Triggers.</strong> Fresh dev / scratch orgs and
                declarative-only shops often have no Apex triggers and
                only sample flows.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                3
              </span>
              <span>
                <strong>The OAuth user lacks Tooling API
                access.</strong> FlowDefinitionView and ApexTrigger both
                require Tooling API scope + &ldquo;View All Data&rdquo;
                or &ldquo;Author Apex&rdquo; permission. If the
                integration user is missing these, both queries return
                zero rows.
              </span>
            </li>
          </ol>
        </div>

        {summary.snapshot_at && (
          <div className="text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50 mt-1">
            Snapshot at {new Date(summary.snapshot_at).toLocaleString()}
          </div>
        )}
      </div>
    </Card>
  )
}

function DiagRow({
  label,
  count,
  error,
  unit = 'rows',
}: {
  label: string
  count: number | null
  error: string | null
  unit?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="text-xs font-mono text-grove-ink/70 dark:text-grove-ink-dk/70">
        {label}
      </div>
      <div className="flex-1 text-right">
        {error ? (
          <span className="text-red-600 dark:text-red-400 text-xs">
            {error}
          </span>
        ) : count === null ? (
          <span className="text-grove-ink/40 dark:text-grove-ink-dk/40 text-xs italic">
            not queried
          </span>
        ) : (
          <span
            className={`text-sm font-semibold tabular-nums ${
              count === 0
                ? 'text-copper-600 dark:text-copper-400'
                : 'text-primary-700 dark:text-primary-400'
            }`}
          >
            {count.toLocaleString()} {unit}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// KPI + filter primitives
// ============================================================================

function TierKpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'primary' | 'copper' | 'danger' | 'neutral'
  hint: string
}) {
  const wrapperCls =
    tone === 'primary'
      ? 'p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800'
      : tone === 'copper'
      ? 'p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25 ring-1 ring-copper-200 dark:ring-copper-800'
      : tone === 'danger'
      ? 'p-3 rounded-lg bg-red-100 dark:bg-red-900/25 ring-1 ring-red-200 dark:ring-red-800'
      : 'p-3 rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk'
  const iconCls =
    tone === 'primary'
      ? 'h-5 w-5 text-primary-700 dark:text-primary-400'
      : tone === 'copper'
      ? 'h-5 w-5 text-copper-600 dark:text-copper-400'
      : tone === 'danger'
      ? 'h-5 w-5 text-red-600 dark:text-red-400'
      : 'h-5 w-5 text-grove-ink/70 dark:text-grove-ink-dk/70'
  const valueCls =
    tone === 'danger'
      ? 'mt-2 text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums'
      : tone === 'copper'
      ? 'mt-2 text-2xl font-bold text-copper-600 dark:text-copper-400 tabular-nums'
      : 'mt-2 text-2xl font-bold text-grove-ink dark:text-grove-ink-dk tabular-nums'

  return (
    <Card variant="bordered" className="p-5" title={hint}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
            {label}
          </p>
          <p className={valueCls}>{value.toLocaleString()}</p>
        </div>
        <div className={wrapperCls}>
          <Icon className={iconCls} />
        </div>
      </div>
    </Card>
  )
}

function TierChip({
  tone,
  active,
  onClick,
  children,
}: {
  tone?: AutomationTier
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const cls = tone
    ? tierChipClasses(tone, active)
    : active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  )
}

function tierChipClasses(tier: AutomationTier, active: boolean): string {
  if (tier === 'broken') {
    return active
      ? 'bg-red-600 text-white'
      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/25 dark:text-red-400 dark:hover:bg-red-900/40'
  }
  if (tier === 'orphaned') {
    return active
      ? 'bg-orange-600 text-white'
      : 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/25 dark:text-orange-400 dark:hover:bg-orange-900/40'
  }
  if (tier === 'dormant') {
    return active
      ? 'bg-copper-600 text-white'
      : 'bg-copper-50 text-copper-700 hover:bg-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:hover:bg-copper-900/40'
  }
  return active
    ? 'bg-primary-600 text-white'
    : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-400 dark:hover:bg-primary-900/40'
}

function TypeChip({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const cls = active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15 border border-grove-border dark:border-grove-border-dk'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${cls}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  )
}

// ============================================================================
// Item card
// ============================================================================

function ItemCard({
  item,
  expanded,
  onToggle,
}: {
  item: AutomationItem
  expanded: boolean
  onToggle: () => void
}) {
  const ringClass =
    item.tier === 'broken'
      ? 'ring-1 ring-red-200 dark:ring-red-900/60'
      : item.tier === 'orphaned'
      ? 'ring-1 ring-orange-200 dark:ring-orange-900/60'
      : item.tier === 'dormant'
      ? 'ring-1 ring-copper-200 dark:ring-copper-900/60'
      : ''

  const evidence = (item.evidence || {}) as Record<string, unknown>
  const dupGroup = evidence.duplicate_group as
    | { key: string; size: number; sibling_ids: string[] }
    | undefined
  const tierReason =
    typeof evidence.tier_reason === 'string' ? evidence.tier_reason : null

  const typeLabel = item.item_type === 'flow' ? 'FLOW' : 'APEX TRIGGER'

  return (
    <Card variant="bordered" className={`overflow-hidden ${ringClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <TierDot tier={item.tier} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50">
                {typeLabel}
              </div>
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                {item.name}
              </h3>
              <TierBadge tier={item.tier} />
              {item.is_active === false && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink/60 dark:text-grove-ink-dk/60">
                  Inactive
                </span>
              )}
              {item.namespace_prefix && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink/60 dark:text-grove-ink-dk/60">
                  {item.namespace_prefix}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-4 flex-wrap text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
              {item.target_object && (
                <span className="inline-flex items-center gap-1">
                  <Cpu className="h-3 w-3" />
                  {item.target_object}
                </span>
              )}
              {item.process_type && (
                <span className="inline-flex items-center gap-1">
                  <Workflow className="h-3 w-3" />
                  {item.process_type}
                  {item.trigger_type && ` (${item.trigger_type})`}
                </span>
              )}
              {item.owner_name && (
                <span className="inline-flex items-center gap-1">
                  {item.owner_is_active ? (
                    <UserCheck className="h-3 w-3 text-primary-600" />
                  ) : (
                    <UserX className="h-3 w-3 text-red-500" />
                  )}
                  {item.owner_name}
                  {item.owner_is_active === false && (
                    <span className="text-red-500">(inactive)</span>
                  )}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.days_since_modified === null
                  ? 'no modification history'
                  : `modified ${item.days_since_modified}d ago`}
              </span>
              {dupGroup && (
                <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                  <Copy className="h-3 w-3" />
                  {dupGroup.size} similar names
                </span>
              )}
            </div>

            {tierReason && !expanded && (
              <div className="mt-2 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 italic">
                {tierReason}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-grove-ink/5 dark:hover:bg-grove-ink-dk/10 text-grove-ink/60 dark:text-grove-ink-dk/60"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-grove-border/60 dark:border-grove-border-dk/60 space-y-3 text-xs text-grove-ink/80 dark:text-grove-ink-dk/80">
            {tierReason && (
              <DetailRow label="Why this tier" value={tierReason} />
            )}
            <DetailRow label="Salesforce ID" value={item.sf_id} mono />
            {item.api_name && (
              <DetailRow label="API name" value={item.api_name} mono />
            )}
            {item.target_object && (
              <DetailRow
                label="Trigger object"
                value={item.target_object}
                mono
              />
            )}
            {item.process_type && (
              <DetailRow label="Process type" value={item.process_type} />
            )}
            {item.trigger_type && (
              <DetailRow label="Trigger type" value={item.trigger_type} />
            )}
            {item.api_version && (
              <DetailRow
                label="API version"
                value={item.api_version}
                mono
              />
            )}
            {typeof item.length_without_comments === 'number' && (
              <DetailRow
                label="Code length"
                value={`${item.length_without_comments.toLocaleString()} chars (excl. comments)`}
              />
            )}
            {item.description && (
              <DetailRow label="Description" value={item.description} />
            )}
            {typeof item.is_valid === 'boolean' && (
              <DetailRow
                label="Valid"
                value={item.is_valid ? 'Yes' : 'No — compile / schema check failed'}
              />
            )}
            {typeof item.is_active === 'boolean' && (
              <DetailRow
                label="Active"
                value={item.is_active ? 'Yes' : 'No — admin-deactivated'}
              />
            )}
            {item.last_modified_at && (
              <DetailRow
                label="Last modified"
                value={new Date(item.last_modified_at).toLocaleString()}
              />
            )}
            {dupGroup && (
              <DetailRow
                label={`${dupGroup.size} similar names`}
                value={dupGroup.sibling_ids
                  .filter((s) => s !== item.sf_id)
                  .join(', ')}
                mono
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50 sm:w-32 flex-shrink-0">
        {label}
      </div>
      <div className={`flex-1 ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: AutomationTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tierChipClasses(tier, true)}`}
    >
      {tier}
    </span>
  )
}

function TierDot({ tier }: { tier: AutomationTier }) {
  const cls =
    tier === 'broken'
      ? 'bg-red-500'
      : tier === 'orphaned'
      ? 'bg-orange-500'
      : tier === 'dormant'
      ? 'bg-copper-500'
      : 'bg-primary-500'
  return (
    <div
      className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cls}`}
      aria-hidden
    />
  )
}

// ============================================================================
// Pagination
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
  onChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
      <div>
        Showing <strong>{from.toLocaleString()}</strong>–
        <strong>{to.toLocaleString()}</strong> of{' '}
        <strong>{total.toLocaleString()}</strong>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2.5 py-1 rounded-md border border-grove-border dark:border-grove-border-dk disabled:opacity-40 hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
        >
          Prev
        </button>
        <span className="px-2 tabular-nums">
          Page {page + 1} / {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page + 1 >= totalPages}
          className="px-2.5 py-1 rounded-md border border-grove-border dark:border-grove-border-dk disabled:opacity-40 hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
        >
          Next
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Formatters
// ============================================================================

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
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatRunError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as Record<string, unknown> & { message?: string }
  const errorData = (e.errorData as Record<string, unknown> | undefined) ?? undefined
  const detail = errorData?.detail as
    | Record<string, unknown>
    | string
    | undefined
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
