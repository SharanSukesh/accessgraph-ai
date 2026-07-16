'use client'

/**
 * Integration Sprawl view — inventory of every integration surface
 * in the org across 5 types (Connected Apps + Named Credentials +
 * External Data Sources + Auth Providers + Remote Sites), tiered by
 * activity + activation state.
 *
 * Same shape as AutomationSprawlView: PageHeader (skipped when
 * embedded in the merged Sprawl page), KPI strip, type + tier
 * filters, item cards with expandable evidence, pagination.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Plug,
  Sparkles,
  Loader2,
  AlertTriangle,
  Search,
  Key,
  Cloud,
  Globe,
  ShieldCheck,
  Link2,
  ChevronDown,
  ChevronUp,
  Activity,
  Ghost,
  AlertCircle,
  HelpCircle,
  Clock,
  Copy,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useIntegrationSprawlLatest,
  useIntegrationSprawlItems,
  useRunIntegrationSprawl,
  type IntegrationItem,
  type IntegrationTier,
  type IntegrationType,
  type IntegrationSourceDiagnostics,
} from '@/lib/api/hooks/useIntegrationSprawl'

const PAGE_SIZE = 30

export function IntegrationSprawlView({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const params = useParams()
  const orgId = params.orgId as string

  const [tier, setTier] = useState<IntegrationTier | undefined>(undefined)
  const [type, setType] = useState<IntegrationType | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useIntegrationSprawlLatest(orgId)
  const {
    data: itemPage,
    isLoading: itemsLoading,
    error: itemsError,
  } = useIntegrationSprawlItems(orgId, {
    tier,
    integration_type: type,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const runMutation = useRunIntegrationSprawl(orgId)

  const changeFilter = (fn: () => void) => {
    fn()
    setPage(0)
  }

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load integration-sprawl summary."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          icon={Plug}
          title="Integration Sprawl"
          subtitle={
            summary?.has_data && summary.snapshot_at
              ? `Last analysed ${formatRelative(summary.snapshot_at)} · ${summary.items_total.toLocaleString()} integration${summary.items_total === 1 ? '' : 's'} inventoried`
              : 'Inventory + tier scoring for every integration surface'
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
                : 'Analyse integrations'}
            </Button>
          }
        />
      )}

      {embedded && (
        // When wrapped by the merged Sprawl page we still need the
        // Re-analyse CTA — put it on its own line above the KPI strip.
        <div className="flex items-center justify-end">
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
              : 'Analyse integrations'}
          </Button>
        </div>
      )}

      {runMutation.isError && (
        <Card
          variant="bordered"
          className="p-4 border-red-300 dark:border-red-800"
        >
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
          title="No integration analysis yet"
          description="Click Analyse integrations to inventory every Connected App, Named Credential, External Data Source, Auth Provider, and Remote Site — then score each by activity."
        />
      ) : summary.items_total === 0 ? (
        <CleanShopState summary={summary} />
      ) : (
        <>
          {/* KPI strip — 5 cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <TierKpi
              label="Total"
              value={summary.items_total}
              icon={Plug}
              tone="neutral"
              hint={`${summary.connected_apps_total.toLocaleString()} apps + ${summary.named_credentials_total.toLocaleString()} credentials + ${summary.external_data_sources_total.toLocaleString()} data sources + ${summary.auth_providers_total.toLocaleString()} SSO + ${summary.remote_sites_total.toLocaleString()} legacy sites`}
            />
            <TierKpi
              label="Healthy"
              value={summary.items_healthy}
              icon={Activity}
              tone="primary"
              hint="Active with recent LoginHistory activity"
            />
            <TierKpi
              label="Stale"
              value={summary.items_stale}
              icon={Ghost}
              tone="copper"
              hint={`No LoginHistory activity in 180 days — cleanup candidates`}
            />
            <TierKpi
              label="Broken"
              value={summary.items_broken}
              icon={AlertCircle}
              tone="danger"
              hint={
                summary.failed_logins_180d > 0
                  ? `${summary.failed_logins_180d.toLocaleString()} failed logins across all integrations`
                  : 'Deactivated integrations or repeated auth failures'
              }
            />
            <TierKpi
              label="Unknown"
              value={summary.items_unknown}
              icon={HelpCircle}
              tone="neutral"
              hint="Outbound surfaces without direct usage telemetry"
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
                <strong>broken &gt; stale &gt; healthy &gt; unknown</strong>.
                Inbound Connected Apps + Auth Providers are joined
                against LoginHistory by name; outbound integrations
                (Named Credentials, External Data Sources) don&rsquo;t
                leave LoginHistory breadcrumbs so we surface them
                without usage tiering — a v2 enhancement will correlate
                Apex callout jobs for those.
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
                  placeholder="Search by name or developer name…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>

              <div className="flex gap-1 flex-wrap">
                <TypeChip
                  active={type === undefined}
                  onClick={() => changeFilter(() => setType(undefined))}
                >
                  All types
                </TypeChip>
                <TypeChip
                  icon={Plug}
                  active={type === 'connected_app'}
                  onClick={() =>
                    changeFilter(() => setType('connected_app'))
                  }
                >
                  Connected Apps
                </TypeChip>
                <TypeChip
                  icon={Key}
                  active={type === 'named_credential'}
                  onClick={() =>
                    changeFilter(() => setType('named_credential'))
                  }
                >
                  Named Credentials
                </TypeChip>
                <TypeChip
                  icon={Cloud}
                  active={type === 'external_data_source'}
                  onClick={() =>
                    changeFilter(() => setType('external_data_source'))
                  }
                >
                  Data Sources
                </TypeChip>
                <TypeChip
                  icon={ShieldCheck}
                  active={type === 'auth_provider'}
                  onClick={() =>
                    changeFilter(() => setType('auth_provider'))
                  }
                >
                  SSO
                </TypeChip>
                <TypeChip
                  icon={Globe}
                  active={type === 'remote_site'}
                  onClick={() =>
                    changeFilter(() => setType('remote_site'))
                  }
                >
                  Remote Sites
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
                tone="stale"
                active={tier === 'stale'}
                onClick={() => changeFilter(() => setTier('stale'))}
              >
                Stale ({summary.items_stale.toLocaleString()})
              </TierChip>
              <TierChip
                tone="healthy"
                active={tier === 'healthy'}
                onClick={() => changeFilter(() => setTier('healthy'))}
              >
                Healthy ({summary.items_healthy.toLocaleString()})
              </TierChip>
              <TierChip
                tone="unknown"
                active={tier === 'unknown'}
                onClick={() => changeFilter(() => setTier('unknown'))}
              >
                Unknown ({summary.items_unknown.toLocaleString()})
              </TierChip>
            </div>
          </Card>

          {/* Item list */}
          {itemsError ? (
            <ErrorState
              message="Failed to load integrations."
              onRetry={() => window.location.reload()}
            />
          ) : itemsLoading ? (
            <TableSkeleton />
          ) : !itemPage || itemPage.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="No integrations match the filters"
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
    source_diagnostics: IntegrationSourceDiagnostics | null
  }
}) {
  const diag = summary.source_diagnostics
  return (
    <Card variant="bordered" className="p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-2xl mx-auto">
        <div className="p-4 rounded-full bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800">
          <Plug className="h-10 w-10 text-primary-700 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
            Analysis complete — 0 integrations found
          </h3>
          <p className="mt-2 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70 leading-relaxed">
            The sprawl scan ran successfully
            {summary.duration_ms !== null && (
              <> ({(summary.duration_ms / 1000).toFixed(1)}s)</>
            )}{' '}
            but returned nothing across all five integration surfaces.
          </p>
        </div>

        {diag && (
          <div className="w-full text-left rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk p-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-3">
              What Salesforce returned
            </div>
            <dl className="space-y-2 text-sm">
              <DiagRow
                label="ConnectedApplication"
                count={diag.connected_apps?.raw_count ?? null}
                error={diag.connected_apps?.error ?? null}
              />
              <DiagRow
                label="NamedCredential"
                count={diag.named_credentials?.raw_count ?? null}
                error={diag.named_credentials?.error ?? null}
              />
              <DiagRow
                label="ExternalDataSource"
                count={diag.external_data_sources?.raw_count ?? null}
                error={diag.external_data_sources?.error ?? null}
              />
              <DiagRow
                label="AuthProvider"
                count={diag.auth_providers?.raw_count ?? null}
                error={diag.auth_providers?.error ?? null}
              />
              <DiagRow
                label="RemoteSiteSetting"
                count={diag.remote_sites?.raw_count ?? null}
                error={diag.remote_sites?.error ?? null}
              />
              <DiagRow
                label="LoginHistory"
                count={diag.login_history?.raw_count ?? null}
                error={diag.login_history?.error ?? null}
                unit="events"
              />
            </dl>
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
  tone?: IntegrationTier
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

function tierChipClasses(tier: IntegrationTier, active: boolean): string {
  if (tier === 'broken') {
    return active
      ? 'bg-red-600 text-white'
      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/25 dark:text-red-400 dark:hover:bg-red-900/40'
  }
  if (tier === 'stale') {
    return active
      ? 'bg-copper-600 text-white'
      : 'bg-copper-50 text-copper-700 hover:bg-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:hover:bg-copper-900/40'
  }
  if (tier === 'healthy') {
    return active
      ? 'bg-primary-600 text-white'
      : 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-400 dark:hover:bg-primary-900/40'
  }
  // unknown
  return active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'bg-grove-canvas text-grove-ink/70 hover:bg-primary-50/40 ring-1 ring-grove-border dark:bg-grove-surface-dk dark:text-grove-ink-dk/70 dark:hover:bg-primary-900/15 dark:ring-grove-border-dk'
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

const TYPE_LABEL: Record<IntegrationType, string> = {
  connected_app: 'CONNECTED APP',
  named_credential: 'NAMED CREDENTIAL',
  external_data_source: 'DATA SOURCE',
  auth_provider: 'SSO PROVIDER',
  remote_site: 'REMOTE SITE',
}

const TYPE_ICON: Record<
  IntegrationType,
  React.ComponentType<{ className?: string }>
> = {
  connected_app: Plug,
  named_credential: Key,
  external_data_source: Cloud,
  auth_provider: ShieldCheck,
  remote_site: Globe,
}

function ItemCard({
  item,
  expanded,
  onToggle,
}: {
  item: IntegrationItem
  expanded: boolean
  onToggle: () => void
}) {
  const ringClass =
    item.tier === 'broken'
      ? 'ring-1 ring-red-200 dark:ring-red-900/60'
      : item.tier === 'stale'
      ? 'ring-1 ring-copper-200 dark:ring-copper-900/60'
      : ''

  const evidence = (item.evidence || {}) as Record<string, unknown>
  const tierReason =
    typeof evidence.tier_reason === 'string' ? evidence.tier_reason : null

  const TypeIcon = TYPE_ICON[item.integration_type]

  return (
    <Card variant="bordered" className={`overflow-hidden ${ringClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <TierDot tier={item.tier} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50 inline-flex items-center gap-1">
                <TypeIcon className="h-3 w-3" />
                {TYPE_LABEL[item.integration_type]}
              </div>
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                {item.name}
              </h3>
              <TierBadge tier={item.tier} />
              {item.is_active === false && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400">
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
              {item.endpoint && (
                <span className="inline-flex items-center gap-1 max-w-md truncate">
                  <Link2 className="h-3 w-3 flex-shrink-0" />
                  <span className="font-mono truncate">
                    {item.endpoint}
                  </span>
                </span>
              )}
              {item.login_count_180d !== null && (
                <span className="inline-flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {item.login_count_180d.toLocaleString()} logins / 180d
                </span>
              )}
              {(item.failed_login_count_180d ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  {item.failed_login_count_180d?.toLocaleString()} failed
                </span>
              )}
              {item.last_used_at && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  last used {formatRelative(item.last_used_at)}
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
            {item.endpoint && (
              <DetailRow
                label="Endpoint"
                value={item.endpoint}
                mono
                copyable
              />
            )}
            <DetailRow
              label="Direction"
              value={item.direction.toUpperCase()}
            />
            {typeof evidence.provider_type === 'string' && (
              <DetailRow
                label="Provider type"
                value={evidence.provider_type}
              />
            )}
            {typeof evidence.principal_type === 'string' && (
              <DetailRow
                label="Auth principal"
                value={evidence.principal_type}
              />
            )}
            {typeof evidence.protocol_type === 'string' && (
              <DetailRow
                label="Protocol"
                value={evidence.protocol_type}
              />
            )}
            {typeof evidence.external_type === 'string' && (
              <DetailRow
                label="External type"
                value={evidence.external_type}
              />
            )}
            {typeof evidence.is_writable === 'boolean' && (
              <DetailRow
                label="Writable"
                value={evidence.is_writable ? 'Yes' : 'No'}
              />
            )}
            {typeof evidence.admin_approved_only === 'boolean' && (
              <DetailRow
                label="Admin-approved only"
                value={
                  evidence.admin_approved_only ? 'Yes' : 'No'
                }
              />
            )}
            {typeof evidence.description === 'string' &&
              evidence.description && (
                <DetailRow
                  label="Description"
                  value={evidence.description}
                />
              )}
            {item.login_count_180d !== null &&
              item.login_count_180d > 0 && (
                <DetailRow
                  label="Logins (180d)"
                  value={item.login_count_180d.toLocaleString()}
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
  copyable = false,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50 sm:w-32 flex-shrink-0">
        {label}
      </div>
      <div
        className={`flex-1 flex items-start gap-2 ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        <span className="break-all">{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(value)}
            className="p-1 rounded hover:bg-grove-ink/5 dark:hover:bg-grove-ink-dk/10 text-grove-ink/50 dark:text-grove-ink-dk/50 flex-shrink-0"
            title="Copy"
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}

function TierBadge({ tier }: { tier: IntegrationTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tierChipClasses(tier, true)}`}
    >
      {tier}
    </span>
  )
}

function TierDot({ tier }: { tier: IntegrationTier }) {
  const cls =
    tier === 'broken'
      ? 'bg-red-500'
      : tier === 'stale'
      ? 'bg-copper-500'
      : tier === 'healthy'
      ? 'bg-primary-500'
      : 'bg-grove-ink/30 dark:bg-grove-ink-dk/30'
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
