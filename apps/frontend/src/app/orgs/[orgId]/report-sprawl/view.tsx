'use client'

/**
 * Report & Dashboard Sprawl page.
 *
 * Every Report + Dashboard in the org, tiered by activity + ownership,
 * with drill-down evidence per item. Mirror of the Managed-Package
 * Sprawl UX at a higher item count.
 *
 * Tiers (precedence — orphaned > duplicate > zombie > live):
 *   - orphaned:  owner is inactive
 *   - duplicate: normalised name matches ≥1 sibling in the same run
 *   - zombie:    not referenced for >12 months
 *   - live:      referenced within last 12 months
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  FileBarChart,
  Sparkles,
  Loader2,
  AlertTriangle,
  Search,
  Users,
  Copy,
  Ghost,
  UserX,
  Activity,
  Folder,
  ChevronDown,
  ChevronUp,
  UserCheck,
  FileText,
  LayoutDashboard,
  Clock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useReportSprawlLatest,
  useReportSprawlItems,
  useRunReportSprawl,
  type ReportItem,
  type ReportTier,
  type ReportItemType,
} from '@/lib/api/hooks/useReportSprawl'

const PAGE_SIZE = 30

export function ReportSprawlView({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useParams()
  const orgId = params.orgId as string

  const [tier, setTier] = useState<ReportTier | undefined>(undefined)
  const [itemType, setItemType] = useState<ReportItemType | undefined>(
    undefined,
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useReportSprawlLatest(orgId)
  const {
    data: itemPage,
    isLoading: itemsLoading,
    error: itemsError,
  } = useReportSprawlItems(orgId, {
    tier,
    item_type: itemType,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const runMutation = useRunReportSprawl(orgId)

  const changeFilter = (fn: () => void) => {
    fn()
    setPage(0)
  }

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load report-sprawl summary."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {!embedded && <PageHeader
        icon={FileBarChart}
        title="Report &amp; Dashboard Sprawl"
        subtitle={
          summary?.has_data && summary.snapshot_at
            ? `Last analysed ${formatRelative(summary.snapshot_at)} · ${summary.items_total.toLocaleString()} item${summary.items_total === 1 ? '' : 's'} inventoried`
            : 'Inventory + tier scoring for every Report and Dashboard'
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
              : 'Analyse reports'}
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
          description="Click Analyse reports to inventory every Report + Dashboard and tier each by activity and ownership."
        />
      ) : summary.items_total === 0 ? (
        <CleanShopState summary={summary} />
      ) : (
        <>
          {/* KPI strip — 5 cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <TierKpi
              label="Total items"
              value={summary.items_total}
              icon={FileBarChart}
              tone="neutral"
              hint={`${summary.reports_total.toLocaleString()} reports + ${summary.dashboards_total.toLocaleString()} dashboards`}
            />
            <TierKpi
              label="Live"
              value={summary.items_live}
              icon={Activity}
              tone="primary"
              hint="Referenced within the last 12 months — in active use"
            />
            <TierKpi
              label="Zombie"
              value={summary.items_zombie}
              icon={Ghost}
              tone="copper"
              hint={
                summary.avg_days_since_last_view
                  ? `Avg. ${summary.avg_days_since_last_view} days since view across viewed items`
                  : 'Not referenced in >12 months — cleanup candidate'
              }
            />
            <TierKpi
              label="Orphaned"
              value={summary.items_orphaned}
              icon={UserX}
              tone="danger"
              hint="Owner is inactive — nobody accountable for this item"
            />
            <TierKpi
              label="Duplicate"
              value={summary.items_duplicate}
              icon={Copy}
              tone="danger"
              hint={`${summary.duplicate_groups} duplicate name group${summary.duplicate_groups === 1 ? '' : 's'} detected`}
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
                <strong>orphaned &gt; duplicate &gt; zombie &gt; live</strong>,
                so an item that's both orphaned and duplicate lands under
                &ldquo;orphaned&rdquo;. Zombie cutoff is 12 months since last
                reference. Duplicates group by name (lowercased, stripped of
                common suffixes like &ldquo;copy&rdquo; and &ldquo;(1)&rdquo;)
                within the same item type.
              </div>
            </div>
          </Card>

          {/* Filters */}
          <Card variant="bordered" className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) =>
                    changeFilter(() => setSearch(e.target.value))
                  }
                  placeholder="Search by name or folder…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>

              {/* Type filter */}
              <div className="flex gap-1">
                <TypeChip
                  active={itemType === undefined}
                  onClick={() => changeFilter(() => setItemType(undefined))}
                >
                  All types
                </TypeChip>
                <TypeChip
                  icon={FileText}
                  active={itemType === 'report'}
                  onClick={() => changeFilter(() => setItemType('report'))}
                >
                  Reports
                </TypeChip>
                <TypeChip
                  icon={LayoutDashboard}
                  active={itemType === 'dashboard'}
                  onClick={() => changeFilter(() => setItemType('dashboard'))}
                >
                  Dashboards
                </TypeChip>
              </div>
            </div>

            {/* Tier chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <TierChip
                active={tier === undefined}
                onClick={() => changeFilter(() => setTier(undefined))}
              >
                All tiers ({summary.items_total.toLocaleString()})
              </TierChip>
              <TierChip
                tone="orphaned"
                active={tier === 'orphaned'}
                onClick={() => changeFilter(() => setTier('orphaned'))}
              >
                Orphaned ({summary.items_orphaned.toLocaleString()})
              </TierChip>
              <TierChip
                tone="duplicate"
                active={tier === 'duplicate'}
                onClick={() => changeFilter(() => setTier('duplicate'))}
              >
                Duplicate ({summary.items_duplicate.toLocaleString()})
              </TierChip>
              <TierChip
                tone="zombie"
                active={tier === 'zombie'}
                onClick={() => changeFilter(() => setTier('zombie'))}
              >
                Zombie ({summary.items_zombie.toLocaleString()})
              </TierChip>
              <TierChip
                tone="live"
                active={tier === 'live'}
                onClick={() => changeFilter(() => setTier('live'))}
              >
                Live ({summary.items_live.toLocaleString()})
              </TierChip>
            </div>
          </Card>

          {/* Item list */}
          {itemsError ? (
            <ErrorState
              message="Failed to load items."
              onRetry={() => window.location.reload()}
            />
          ) : itemsLoading ? (
            <TableSkeleton />
          ) : !itemPage || itemPage.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="No items match the filters"
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
// Zero-items state — analysis ran successfully but found nothing
// ============================================================================

function CleanShopState({
  summary,
}: {
  summary: {
    snapshot_at: string | null
    duration_ms: number | null
    reports_total: number
    dashboards_total: number
  }
}) {
  return (
    <Card variant="bordered" className="p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-2xl mx-auto">
        <div className="p-4 rounded-full bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800">
          <FileBarChart className="h-10 w-10 text-primary-700 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
            Analysis complete — 0 Reports, 0 Dashboards
          </h3>
          <p className="mt-2 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70 leading-relaxed">
            The sprawl scan ran successfully
            {summary.duration_ms !== null && (
              <> ({(summary.duration_ms / 1000).toFixed(1)}s)</>
            )}{' '}
            but Salesforce returned no analytics content for this org.
          </p>
        </div>

        <div className="mt-2 w-full text-left rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-3">
            Three things could explain a zero result
          </div>
          <ol className="space-y-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                1
              </span>
              <span>
                <strong>The org genuinely has no reports or
                dashboards.</strong> Fresh dev / scratch orgs and orgs
                that only use Analytics Studio (CRMA) for reporting
                often have 0 rows in the classic Report and Dashboard
                SObjects. This is the most common cause and it&rsquo;s
                fine — nothing to clean up.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                2
              </span>
              <span>
                <strong>The connected OAuth user can&rsquo;t see
                any.</strong> Report / Dashboard visibility respects
                folder sharing. If the OAuth integration user
                isn&rsquo;t in the sharing rules for any report folder,
                they see 0 rows even in an org full of content.
                Reconnect from a System Admin account if this is a
                real client engagement.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 mt-0.5">
                3
              </span>
              <span>
                <strong>Analytics access is disabled on the OAuth
                scope.</strong> Rare, but some connected apps are
                created with a restricted OAuth scope that omits{' '}
                <code className="text-xs px-1 py-0.5 rounded bg-grove-ink/5 dark:bg-grove-ink-dk/10">
                  api
                </code>{' '}
                or restricts to a permission set that doesn&rsquo;t
                grant Report Read. Check the Connected App&rsquo;s
                scopes.
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
  tone?: ReportTier
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

function tierChipClasses(tier: ReportTier, active: boolean): string {
  if (tier === 'orphaned') {
    return active
      ? 'bg-red-600 text-white'
      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/25 dark:text-red-400 dark:hover:bg-red-900/40'
  }
  if (tier === 'duplicate') {
    return active
      ? 'bg-purple-600 text-white'
      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/25 dark:text-purple-400 dark:hover:bg-purple-900/40'
  }
  if (tier === 'zombie') {
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
  item: ReportItem
  expanded: boolean
  onToggle: () => void
}) {
  const ringClass =
    item.tier === 'orphaned'
      ? 'ring-1 ring-red-200 dark:ring-red-900/60'
      : item.tier === 'duplicate'
      ? 'ring-1 ring-purple-200 dark:ring-purple-900/60'
      : item.tier === 'zombie'
      ? 'ring-1 ring-copper-200 dark:ring-copper-900/60'
      : ''

  const evidence = (item.evidence || {}) as Record<string, unknown>
  const dupGroup = evidence.duplicate_group as
    | { key: string; size: number; sibling_ids: string[] }
    | undefined
  const tierReason =
    typeof evidence.tier_reason === 'string' ? evidence.tier_reason : null

  return (
    <Card variant="bordered" className={`overflow-hidden ${ringClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <TierDot tier={item.tier} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50">
                {item.item_type === 'dashboard' ? 'DASHBOARD' : 'REPORT'}
              </div>
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                {item.name}
              </h3>
              <TierBadge tier={item.tier} />
              {item.report_format && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink/60 dark:text-grove-ink-dk/60">
                  {item.report_format}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-4 flex-wrap text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
              {item.folder_name && (
                <span className="inline-flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  {item.folder_name}
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
                {item.days_since_last_view === null
                  ? 'never viewed'
                  : `viewed ${item.days_since_last_view}d ago`}
              </span>
              {dupGroup && (
                <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                  <Copy className="h-3 w-3" />
                  {dupGroup.size} copies
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
            {item.developer_name && (
              <DetailRow
                label="API name"
                value={item.developer_name}
                mono
              />
            )}
            {item.description && (
              <DetailRow label="Description" value={item.description} />
            )}
            {item.last_referenced_at && (
              <DetailRow
                label="Last referenced"
                value={new Date(item.last_referenced_at).toLocaleString()}
              />
            )}
            {item.last_run_at && (
              <DetailRow
                label="Last run"
                value={new Date(item.last_run_at).toLocaleString()}
              />
            )}
            {item.last_modified_at && (
              <DetailRow
                label="Last modified"
                value={new Date(item.last_modified_at).toLocaleString()}
              />
            )}
            {item.created_at_sf && (
              <DetailRow
                label="Created"
                value={new Date(item.created_at_sf).toLocaleString()}
              />
            )}
            {dupGroup && (
              <DetailRow
                label={`${dupGroup.size} duplicates`}
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

function TierBadge({ tier }: { tier: ReportTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tierChipClasses(tier, true)}`}
    >
      {tier}
    </span>
  )
}

function TierDot({ tier }: { tier: ReportTier }) {
  const cls =
    tier === 'orphaned'
      ? 'bg-red-500'
      : tier === 'duplicate'
      ? 'bg-purple-500'
      : tier === 'zombie'
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
