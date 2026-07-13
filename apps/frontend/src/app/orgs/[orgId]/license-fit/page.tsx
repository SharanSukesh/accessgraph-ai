'use client'

/**
 * License-to-Persona Fit page.
 *
 * The CFO-facing right-sizing analysis. Every active user gets
 * classified into a persona (Sales / Service / Admin / Platform /
 * Read-only / Inactive / Unknown) and compared to their current
 * license SKU. Where the SKU is more expensive than the persona
 * needs, we recommend a right-size and quote annual savings.
 *
 * Fit categories:
 *   right_sized     — SKU matches usage
 *   overbuilt       — could downgrade to Platform or similar
 *   wrong_cloud     — Sales SKU acting Service (or vice versa)
 *   underused       — paid seat, no recent activity
 *   inactive_billed — deactivated but still billed
 *   unknown         — insufficient evidence (fail-safe)
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  DollarSign,
  Sparkles,
  Loader2,
  AlertTriangle,
  Search,
  UserX,
  UserCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  TrendingDown,
  Users,
  ArrowRight,
  Info,
  Building,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useLicenseFitLatest,
  useLicenseFitItems,
  useRunLicenseFit,
  type LicenseFitAssessment,
  type LicenseFitCategory,
  type LicenseFitPersona,
  type LicenseFitSourceDiagnostics,
} from '@/lib/api/hooks/useLicenseFit'

const PAGE_SIZE = 30

export default function LicenseFitPage() {
  const params = useParams()
  const orgId = params.orgId as string

  const [category, setCategory] = useState<LicenseFitCategory | undefined>(
    undefined,
  )
  const [persona, setPersona] = useState<LicenseFitPersona | undefined>(
    undefined,
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useLicenseFitLatest(orgId)
  const {
    data: itemPage,
    isLoading: itemsLoading,
    error: itemsError,
  } = useLicenseFitItems(orgId, {
    fit_category: category,
    persona,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })
  const runMutation = useRunLicenseFit(orgId)

  const changeFilter = (fn: () => void) => {
    fn()
    setPage(0)
  }

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load license-fit summary."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="License-to-Persona Fit"
        subtitle={
          summary?.has_data && summary.snapshot_at
            ? `Last analysed ${formatRelative(summary.snapshot_at)} · ${summary.users_assessed.toLocaleString()} user${summary.users_assessed === 1 ? '' : 's'} assessed`
            : 'Right-sizing recommendations based on actual usage vs assigned SKU'
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
              : 'Analyse licenses'}
          </Button>
        }
      />

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
          icon="users"
          title="No right-sizing analysis yet"
          description="Click Analyse licenses to classify every user's persona and compare it against their license SKU."
        />
      ) : summary.users_assessed === 0 ? (
        <CleanShopState diagnostics={summary.source_diagnostics} />
      ) : (
        <>
          {/* Headline savings banner */}
          <SavingsBanner summary={summary} />

          {/* Fit category KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FitKpi
              label="Right-sized"
              value={summary.users_right_sized}
              tone="primary"
              hint="Persona matches the assigned SKU"
            />
            <FitKpi
              label="Overbuilt"
              value={summary.users_overbuilt}
              tone="copper"
              hint="Could downgrade to a cheaper SKU"
            />
            <FitKpi
              label="Wrong cloud"
              value={summary.users_wrong_cloud}
              tone="danger"
              hint="Sales SKU acting Service (or vice versa)"
            />
            <FitKpi
              label="Underused"
              value={summary.users_underused}
              tone="danger"
              hint="Paid seat, no login in 90+ days"
            />
            <FitKpi
              label="Inactive billed"
              value={summary.users_inactive_billed}
              tone="danger"
              hint="Deactivated user still on a paid seat"
            />
            <FitKpi
              label="Unknown"
              value={summary.users_unknown}
              tone="neutral"
              hint="Insufficient evidence — manual review recommended"
            />
          </div>

          {/* Methodology + pricing caveat */}
          <Card variant="bordered" className="p-4">
            <div className="flex items-start gap-3 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
              <Info className="h-4 w-4 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed space-y-1">
                <div>
                  <strong className="text-grove-ink dark:text-grove-ink-dk">
                    How this is scored
                  </strong>{' '}
                  — persona is derived from owned-record counts across
                  Opportunity / Case / Lead / Contact / Account plus
                  login recency (&le; 90 days). Users without clear
                  behavioural evidence land in{' '}
                  <strong>unknown</strong> rather than being force-
                  classified. Recommendations are only made when
                  confidence is medium or high.
                </div>
                <div>
                  <strong className="text-grove-ink dark:text-grove-ink-dk">
                    Pricing source
                  </strong>{' '}
                  —{' '}
                  {summary.source_diagnostics?.price_book_source ===
                  'org_override'
                    ? 'per-org price book (customer contract prices)'
                    : 'Salesforce list prices from the default catalog — your customer contract may differ. Edit prices in Org Analyzer → Price Book to reflect actuals.'}
                </div>
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
                  placeholder="Search by name or username…"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
            </div>

            {/* Fit category chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip
                active={category === undefined}
                onClick={() => changeFilter(() => setCategory(undefined))}
              >
                All ({summary.users_assessed.toLocaleString()})
              </Chip>
              <Chip
                tone="danger"
                active={category === 'inactive_billed'}
                onClick={() =>
                  changeFilter(() => setCategory('inactive_billed'))
                }
              >
                Inactive billed ({summary.users_inactive_billed})
              </Chip>
              <Chip
                tone="danger"
                active={category === 'underused'}
                onClick={() =>
                  changeFilter(() => setCategory('underused'))
                }
              >
                Underused ({summary.users_underused})
              </Chip>
              <Chip
                tone="danger"
                active={category === 'wrong_cloud'}
                onClick={() =>
                  changeFilter(() => setCategory('wrong_cloud'))
                }
              >
                Wrong cloud ({summary.users_wrong_cloud})
              </Chip>
              <Chip
                tone="copper"
                active={category === 'overbuilt'}
                onClick={() =>
                  changeFilter(() => setCategory('overbuilt'))
                }
              >
                Overbuilt ({summary.users_overbuilt})
              </Chip>
              <Chip
                tone="primary"
                active={category === 'right_sized'}
                onClick={() =>
                  changeFilter(() => setCategory('right_sized'))
                }
              >
                Right-sized ({summary.users_right_sized})
              </Chip>
            </div>

            {/* Persona chips */}
            <div className="mt-2 flex flex-wrap gap-2">
              <PersonaChip
                active={persona === undefined}
                onClick={() => changeFilter(() => setPersona(undefined))}
              >
                All personas
              </PersonaChip>
              {(
                [
                  'sales',
                  'service',
                  'admin',
                  'platform',
                  'readonly',
                  'community',
                  'inactive',
                  'unknown',
                ] as LicenseFitPersona[]
              ).map((p) => (
                <PersonaChip
                  key={p}
                  active={persona === p}
                  onClick={() => changeFilter(() => setPersona(p))}
                >
                  {p}
                </PersonaChip>
              ))}
            </div>
          </Card>

          {/* Assessment list */}
          {itemsError ? (
            <ErrorState
              message="Failed to load assessments."
              onRetry={() => window.location.reload()}
            />
          ) : itemsLoading ? (
            <TableSkeleton />
          ) : !itemPage || itemPage.items.length === 0 ? (
            <EmptyState
              icon="search"
              title="No users match the filters"
              description="Adjust the fit category / persona filters, or clear the search."
            />
          ) : (
            <>
              <div className="space-y-3">
                {itemPage.items.map((item) => (
                  <AssessmentCard
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
// Savings banner — the CFO number, front and centre
// ============================================================================

function SavingsBanner({
  summary,
}: {
  summary: {
    total_annual_savings_cents: number
    total_current_annual_cost_cents: number
    users_assessed: number
  }
}) {
  const savingsUsd = summary.total_annual_savings_cents / 100
  const currentUsd = summary.total_current_annual_cost_cents / 100
  const savingsPct =
    currentUsd > 0 ? (savingsUsd / currentUsd) * 100 : 0

  return (
    <Card
      variant="bordered"
      className="p-6 bg-gradient-to-br from-primary-50 to-copper-50 dark:from-primary-950/40 dark:to-copper-950/40 ring-1 ring-primary-200 dark:ring-primary-900"
    >
      <div className="flex items-center gap-4">
        <div className="p-3 rounded-lg bg-white dark:bg-grove-surface-dk ring-1 ring-primary-200 dark:ring-primary-800">
          <TrendingDown className="h-7 w-7 text-primary-700 dark:text-primary-400" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
            Projected annual savings
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <div className="text-4xl font-bold text-grove-ink dark:text-grove-ink-dk tabular-nums">
              {formatUsd(savingsUsd)}
            </div>
            {savingsPct > 0 && (
              <div className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
                {savingsPct.toFixed(1)}% of {formatUsd(currentUsd)} current spend
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// Zero-users state
// ============================================================================

function CleanShopState({
  diagnostics,
}: {
  diagnostics: LicenseFitSourceDiagnostics | null
}) {
  const users = diagnostics?.users?.count ?? null
  return (
    <Card variant="bordered" className="p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-2xl mx-auto">
        <div className="p-4 rounded-full bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800">
          <Users className="h-10 w-10 text-primary-700 dark:text-primary-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
            Analysis complete — no users assessed
          </h3>
          <p className="mt-2 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70 leading-relaxed">
            {users === 0
              ? "The user snapshot for this org has 0 rows. Run a full sync from the sidebar before re-analysing."
              : "License-fit couldn't score any of the synced users — most commonly because the profile / user-license join couldn't be resolved."}
          </p>
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// KPI + filter primitives
// ============================================================================

function FitKpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone: 'primary' | 'copper' | 'danger' | 'neutral'
  hint: string
}) {
  const valueCls =
    tone === 'danger'
      ? 'text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums'
      : tone === 'copper'
      ? 'text-2xl font-bold text-copper-600 dark:text-copper-400 tabular-nums'
      : tone === 'primary'
      ? 'text-2xl font-bold text-primary-700 dark:text-primary-400 tabular-nums'
      : 'text-2xl font-bold text-grove-ink dark:text-grove-ink-dk tabular-nums'
  return (
    <Card variant="bordered" className="p-4" title={hint}>
      <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
        {label}
      </div>
      <div className={`mt-1 ${valueCls}`}>{value.toLocaleString()}</div>
    </Card>
  )
}

function Chip({
  tone,
  active,
  onClick,
  children,
}: {
  tone?: 'primary' | 'copper' | 'danger'
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const cls = tone
    ? active
      ? tone === 'primary'
        ? 'bg-primary-600 text-white'
        : tone === 'copper'
        ? 'bg-copper-600 text-white'
        : 'bg-red-600 text-white'
      : tone === 'primary'
      ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-400 dark:hover:bg-primary-900/40'
      : tone === 'copper'
      ? 'bg-copper-50 text-copper-700 hover:bg-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:hover:bg-copper-900/40'
      : 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/25 dark:text-red-400 dark:hover:bg-red-900/40'
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

function PersonaChip({
  active,
  onClick,
  children,
}: {
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
      className={`px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider transition-colors ${cls}`}
    >
      {children}
    </button>
  )
}

// ============================================================================
// Assessment card
// ============================================================================

function AssessmentCard({
  item,
  expanded,
  onToggle,
}: {
  item: LicenseFitAssessment
  expanded: boolean
  onToggle: () => void
}) {
  const ringClass =
    item.fit_category === 'inactive_billed' ||
    item.fit_category === 'wrong_cloud'
      ? 'ring-1 ring-red-200 dark:ring-red-900/60'
      : item.fit_category === 'underused'
      ? 'ring-1 ring-red-200 dark:ring-red-900/60'
      : item.fit_category === 'overbuilt'
      ? 'ring-1 ring-copper-200 dark:ring-copper-900/60'
      : ''

  const evidence = (item.evidence || {}) as Record<string, unknown>
  const personaReason =
    typeof evidence.persona_reason === 'string'
      ? evidence.persona_reason
      : null
  const fitReason =
    typeof evidence.fit_reason === 'string' ? evidence.fit_reason : null
  const savingsUsd = item.annual_savings_cents / 100

  return (
    <Card variant="bordered" className={`overflow-hidden ${ringClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <FitDot category={item.fit_category} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                {item.user_name || item.user_username || item.user_sf_id}
              </h3>
              <FitBadge category={item.fit_category} />
              <PersonaBadge persona={item.persona} confidence={item.confidence} />
              {!item.user_is_active && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-400">
                  Deactivated
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center gap-4 flex-wrap text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
              {item.user_profile_name && (
                <span className="inline-flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {item.user_profile_name}
                </span>
              )}
              {item.current_license_name && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono">SKU:</span>{' '}
                  <strong className="text-grove-ink dark:text-grove-ink-dk">
                    {item.current_license_name}
                  </strong>{' '}
                  ({formatUsdPerMonth(item.current_monthly_cost_cents)})
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.days_since_login === null
                  ? 'never logged in'
                  : `login ${item.days_since_login}d ago`}
              </span>
            </div>

            {savingsUsd > 0 && item.recommended_license_name && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-grove-ink/70 dark:text-grove-ink-dk/70">
                  Recommend →
                </span>
                <strong className="text-grove-ink dark:text-grove-ink-dk">
                  {item.recommended_license_name}
                </strong>
                <ArrowRight className="h-3 w-3 text-primary-600 dark:text-primary-400" />
                <span className="text-primary-700 dark:text-primary-400 font-semibold tabular-nums">
                  save {formatUsd(savingsUsd)} / year
                </span>
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
            {personaReason && (
              <DetailRow label="Why this persona" value={personaReason} />
            )}
            {fitReason && (
              <DetailRow label="Why this fit" value={fitReason} />
            )}
            <DetailRow
              label="User SF ID"
              value={item.user_sf_id}
              mono
            />
            {item.user_username && (
              <DetailRow
                label="Username"
                value={item.user_username}
                mono
              />
            )}
            {item.user_department && (
              <DetailRow
                label="Department"
                value={item.user_department}
              />
            )}
            {item.user_title && (
              <DetailRow label="Title" value={item.user_title} />
            )}
            {item.last_login_at && (
              <DetailRow
                label="Last login"
                value={new Date(item.last_login_at).toLocaleString()}
              />
            )}
            <div className="pt-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-2">
                Ownership footprint
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <OwnCountCell label="Accounts" value={item.accounts_owned} />
                <OwnCountCell
                  label="Opps"
                  value={item.opportunities_owned}
                />
                <OwnCountCell label="Cases" value={item.cases_owned} />
                <OwnCountCell label="Leads" value={item.leads_owned} />
                <OwnCountCell
                  label="Contacts"
                  value={item.contacts_owned}
                />
              </div>
            </div>
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

function OwnCountCell({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div
      className={`rounded p-2 ring-1 ${
        value > 0
          ? 'bg-primary-50/50 ring-primary-200 dark:bg-primary-900/15 dark:ring-primary-900'
          : 'bg-grove-canvas ring-grove-border dark:bg-grove-surface-dk dark:ring-grove-border-dk'
      }`}
    >
      <div className="text-sm font-semibold tabular-nums text-grove-ink dark:text-grove-ink-dk">
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50">
        {label}
      </div>
    </div>
  )
}

function FitBadge({ category }: { category: LicenseFitCategory }) {
  const cls =
    category === 'inactive_billed' || category === 'underused' || category === 'wrong_cloud'
      ? 'bg-red-600 text-white'
      : category === 'overbuilt'
      ? 'bg-copper-600 text-white'
      : category === 'right_sized'
      ? 'bg-primary-600 text-white'
      : 'bg-grove-ink/40 text-white dark:bg-grove-ink-dk/40'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {category.replace('_', ' ')}
    </span>
  )
}

function PersonaBadge({
  persona,
  confidence,
}: {
  persona: LicenseFitPersona
  confidence: string
}) {
  const confDot =
    confidence === 'high'
      ? '●●●'
      : confidence === 'medium'
      ? '●●○'
      : '●○○'
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink/70 dark:text-grove-ink-dk/70"
      title={`Confidence: ${confidence}`}
    >
      {persona}
      <span className="text-[8px] text-grove-ink/40 dark:text-grove-ink-dk/40">
        {confDot}
      </span>
    </span>
  )
}

function FitDot({ category }: { category: LicenseFitCategory }) {
  const cls =
    category === 'inactive_billed' ||
    category === 'wrong_cloud' ||
    category === 'underused'
      ? 'bg-red-500'
      : category === 'overbuilt'
      ? 'bg-copper-500'
      : category === 'right_sized'
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

function formatUsd(amount: number): string {
  if (Math.abs(amount) >= 1_000_000)
    return `$${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 10_000)
    return `$${(amount / 1000).toFixed(1)}k`
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatUsdPerMonth(cents: number): string {
  const usd = cents / 100
  return `${formatUsd(usd)}/mo`
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
