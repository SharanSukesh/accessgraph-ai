'use client'

/**
 * Org Analyzer Page — consulting-grade org-health dashboard.
 *
 * Five-tab layout:
 *  - Overview       headline cards + sparkline + run/download buttons
 *  - Findings       filterable table grouped by category, drill-down panel
 *  - Cost savings   per-category savings bar chart
 *  - Trends         findings count over time
 *  - Price book     license SKU editor
 *
 * Reads from /orgs/{id}/org-analyzer/* endpoints. PDF download is a
 * direct <a> to the report.pdf endpoint with `credentials: include`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  EyeOff,
  FileText,
  Info,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Stethoscope,
  TrendingUp,
  X as XIcon,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  formatMoneyCents,
  useApplyFix,
  useBrandSettings,
  useIgnoreFinding,
  useLicensePriceBook,
  useOrgAnalyzerFindings,
  useOrgAnalyzerHistory,
  useOrgAnalyzerLatest,
  useRunOrgAnalyzer,
  useUnignoreFinding,
  useUpdateBrandSettings,
  useUpdateLicensePriceBook,
  useUploadBrandLogo,
  type FindingCategory,
  type FindingSeverity,
  type OrgFinding,
  type PriceBookRow,
  type SnapshotSummary,
} from '@/lib/api/hooks/useOrgAnalyzer'
import { endpoints } from '@/lib/api/endpoints'
import { PageHeader } from '@/components/shared/PageHeader'

type Tab = 'overview' | 'findings' | 'savings' | 'trends' | 'price-book'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'findings', label: 'Findings', icon: AlertTriangle },
  { id: 'savings', label: 'Cost savings', icon: DollarSign },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'price-book', label: 'Price book', icon: Settings2 },
]

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Severity badge classes — literal switch instead of a dict lookup so
// Tailwind's content scanner reliably picks up each class string. The
// tailwind.config safelist also lists these as belt-and-braces.
function severityBadgeClasses(s: FindingSeverity): string {
  switch (s) {
    case 'critical': return 'bg-red-700 text-white'
    case 'high':     return 'bg-red-500 text-white'
    case 'medium':   return 'bg-amber-500 text-white'
    case 'low':      return 'bg-yellow-500 text-grove-ink'
    case 'info':     return 'bg-primary-600 text-grove-canvas'
  }
}

export default function OrgAnalyzerPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const [tab, setTab] = useState<Tab>('overview')

  const latest = useOrgAnalyzerLatest(orgId)
  const history = useOrgAnalyzerHistory(orgId)
  const run = useRunOrgAnalyzer(orgId)
  const [toast, setToast] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null)

  const handleRun = async () => {
    setToast(null)
    try {
      const result = await run.mutateAsync()
      setToast({
        kind: 'success',
        message: `Analysis complete — ${result.findings_count} findings, ${formatMoneyCents(result.total_estimated_annual_savings_cents)}/yr potential savings.`,
      })
    } catch (err: any) {
      setToast({
        kind: 'error',
        message: `Analysis failed: ${err?.data?.detail || err?.message || 'Unknown error'}`,
      })
    }
  }

  if (latest.error) {
    return <ErrorState message="Failed to load Org Analyzer." />
  }

  const summary = latest.data
  const hasRun = !!summary?.has_data

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Stethoscope}
        title="Health Report"
        subtitle={
          <>
            License waste, configuration bloat, automation hygiene,
            security posture, storage risk &mdash; with dollar-impact
            estimates.
          </>
        }
        actions={
          <>
            {hasRun && (
              <a
                href={`${API_BASE}${endpoints.orgAnalyzerReportPdf(orgId)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-grove-border dark:border-grove-border-dk rounded-md hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            )}
            <Button
              variant="primary"
              size="md"
              disabled={run.isPending}
              onClick={handleRun}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${run.isPending ? 'animate-spin' : ''}`}
              />
              {run.isPending
                ? 'Analyzing…'
                : hasRun
                  ? 'Re-run analysis'
                  : 'Run analysis'}
            </Button>
          </>
        }
      />

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
            toast.kind === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {toast.kind === 'success' ? (
            <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          )}
          <p className="flex-1">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* No-data state */}
      {!hasRun && !latest.isLoading && (
        <Card variant="bordered">
          <CardContent className="p-8 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-primary-600 mb-3" />
            <p className="text-base font-medium mb-1">
              No analysis yet
            </p>
            <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mb-4">
              Click <strong>Run analysis</strong> to scan this org for
              license waste, configuration bloat, automation hygiene
              issues, and security posture concerns.
            </p>
          </CardContent>
        </Card>
      )}

      {hasRun && summary && (
        <>
          {/* Tab bar */}
          <div className="flex border-b border-grove-border dark:border-grove-border-dk">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    active
                      ? 'border-indigo-600 text-primary-700 dark:text-primary-400'
                      : 'border-transparent text-grove-ink/55 hover:text-grove-ink/85 dark:hover:text-grove-border'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {tab === 'overview' && (
            <OverviewTab
              orgId={orgId}
              summary={summary}
              history={history.data ?? []}
            />
          )}
          {tab === 'findings' && <FindingsTab orgId={orgId} />}
          {tab === 'savings' && <SavingsTab orgId={orgId} />}
          {tab === 'trends' && (
            <TrendsTab history={history.data ?? []} summary={summary} />
          )}
          {tab === 'price-book' && <PriceBookTab orgId={orgId} />}
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------- Overview tab

function OverviewTab({
  orgId,
  summary,
  history,
}: {
  orgId: string
  summary: SnapshotSummary
  history: any[]
}) {
  const sevCounts = (summary.findings_by_severity || {}) as Record<string, number>
  const catCounts = (summary.findings_by_category || {}) as Record<string, number>
  const topCategories = Object.entries(catCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
  const snapshotAt = summary.snapshot_at
    ? new Date(summary.snapshot_at).toLocaleString()
    : '—'
  const healthScore: number | undefined =
    summary.metrics?.org_health_score
  // Prefer active (post-ignore) totals when present; fall back to the
  // captured snapshot numbers for older backend versions.
  const activeFindings = summary.active_findings_count ?? summary.findings_count
  const activeSavings =
    summary.active_savings_cents ?? summary.total_estimated_annual_savings_cents
  const ignoredCount = summary.ignored_findings_count ?? 0
  const healthAccent =
    healthScore == null
      ? 'text-grove-ink/50'
      : healthScore >= 80
        ? 'text-green-600 dark:text-green-400'
        : healthScore >= 60
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400'
  const isPayingOrg = summary.is_paying_org !== false
  const orgEdition = (
    summary.is_sandbox ? 'Sandbox'
    : summary.is_trial ? 'Trial'
    : (summary.org_type || 'Non-production')
  )
  return (
    <div className="space-y-4">
      {!isPayingOrg && (
        <div
          className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 text-sm"
          role="status"
        >
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{orgEdition} org detected — list-price calculations don&apos;t apply.</p>
            <p className="text-xs mt-1 text-amber-800 dark:text-amber-200">
              Salesforce bundles license seats at $0 on this edition.
              Per-finding savings are shown as Info only; re-run on a
              production org for a billable savings estimate, or flip the{' '}
              <strong>Billed</strong> toggle in the Price book to override
              specific SKUs.
            </p>
          </div>
        </div>
      )}
      {/* Hero row: Org Health Score becomes the visual anchor of the
          page. Sits left, with the four secondary stat cards stacked
          to its right so the score reads first at a glance. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <HeroHealthCard
          score={healthScore ?? null}
          rubric={summary.metrics?.org_health_rubric}
        />
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard
            label="Findings"
            value={activeFindings.toString()}
            subValue={ignoredCount ? `(+${ignoredCount} ignored)` : undefined}
            icon={AlertTriangle}
            accent="text-primary-700 dark:text-primary-400"
          />
          <StatCard
            label="Est. annual savings"
            value={formatMoneyCents(activeSavings)}
            icon={DollarSign}
            accent="text-green-600 dark:text-green-400"
          />
          <StatCard
            label="High + Critical"
            value={(
              (sevCounts.critical || 0) + (sevCounts.high || 0)
            ).toString()}
            icon={AlertCircle}
            accent="text-red-600 dark:text-red-400"
          />
          <StatCard
            label="Last run"
            value={snapshotAt}
            subValue={
              summary.delta?.new_high_critical
                ? `+${summary.delta.new_high_critical} new H/C`
                : undefined
            }
            icon={FileText}
            accent="text-grove-ink/85 dark:text-grove-ink-dk/85"
            small
          />
        </div>
      </div>

      {/* Executive summary — narrative paragraph composed at run time.
          Hidden on snapshots from before v1.8 where the field is null. */}
      {summary.executive_summary && (
        <Card variant="bordered">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-grove-ink/55 mb-2">
              Executive summary
            </p>
            <p className="text-sm leading-relaxed text-grove-ink dark:text-grove-ink-dk/85">
              {summary.executive_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick wins — the top-5-by-savings shortlist so the consultant
          knows where to focus. Reuses the existing findings query. */}
      <QuickWinsPanel orgId={orgId} />


      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Severity breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <SeverityBars counts={sevCounts} />
          </CardContent>
        </Card>
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-sm text-grove-ink/55">No findings.</p>
            ) : (
              <ul className="space-y-2">
                {topCategories.map(([cat, count]) => (
                  <li key={cat} className="flex items-center justify-between text-sm">
                    <span>{CATEGORY_LABELS[cat as FindingCategory] ?? cat}</span>
                    <Badge variant="info" size="sm">
                      {count} {count === 1 ? 'finding' : 'findings'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Findings over time</CardTitle>
        </CardHeader>
        <CardContent>
          <Sparkline points={history} />
        </CardContent>
      </Card>
    </div>
  )
}

// Hero card for the Org Health Score — visually dominates the
// Overview tab so the consultant sees the single most important
// metric at a glance. A coloured ring around the score signals band.
function HeroHealthCard({
  score,
  rubric,
}: {
  score: number | null
  rubric?: Record<string, any>
}) {
  const accent =
    score == null
      ? { ring: 'text-grove-ink/50', text: 'text-grove-ink/50', band: 'No data' }
      : score >= 80
        ? { ring: 'text-green-500', text: 'text-green-600 dark:text-green-400', band: 'Excellent' }
        : score >= 60
          ? { ring: 'text-amber-500', text: 'text-amber-600 dark:text-amber-400', band: 'Needs attention' }
          : { ring: 'text-red-500', text: 'text-red-600 dark:text-red-400', band: 'Critical' }
  // Build the SVG ring: 0-100 → 0-360deg arc length.
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score))
  const radius = 52
  const circ = 2 * Math.PI * radius
  const dash = (pct / 100) * circ
  return (
    <Card variant="bordered" className="overflow-hidden">
      <CardContent className="p-6 flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120" aria-hidden>
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-grove-border dark:text-grove-ink-dk/85"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              className={accent.ring}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-3xl font-bold ${accent.text}`}>
              {score == null ? '—' : score}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-grove-ink/55 mb-1">
            Org Health Score
          </p>
          <p className={`text-lg font-semibold ${accent.text}`}>{accent.band}</p>
          {rubric && (
            <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
              {rubric.deduction} pts deducted from a starting score of 100,
              weighted by severity.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Top-5-by-savings shortlist — gives the consultant a "fix these
// first" panel right on the Overview tab. Reuses the existing
// findings query, filters to actionable items, sorts by dollar.
function QuickWinsPanel({ orgId }: { orgId: string }) {
  const findings = useOrgAnalyzerFindings(orgId, { limit: 500 })
  const wins = useMemo(() => {
    const all = findings.data?.findings ?? []
    return [...all]
      .filter(
        f =>
          !f.is_ignored
          && !f.is_resolved
          && (f.estimated_annual_savings_cents ?? 0) > 0,
      )
      .sort(
        (a, b) =>
          (b.estimated_annual_savings_cents ?? 0)
          - (a.estimated_annual_savings_cents ?? 0),
      )
      .slice(0, 5)
  }, [findings.data])

  if (findings.isLoading) {
    return (
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Quick wins</CardTitle>
        </CardHeader>
        <CardContent>
          <TableSkeleton rows={4} />
        </CardContent>
      </Card>
    )
  }
  if (wins.length === 0) {
    return null  // No actionable $-bearing findings → don't show the card.
  }
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Quick wins — top 5 by annual savings</span>
          <span className="text-xs font-normal text-grove-ink/55">
            Sorted by estimated $/yr
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-gray-200 dark:divide-gray-800">
          {wins.map((f, i) => (
            <li
              key={f.id}
              className="py-2.5 flex items-start gap-3 first:pt-0 last:pb-0"
            >
              <span className="text-xs font-mono text-grove-ink/50 w-5 flex-shrink-0 mt-0.5">
                {i + 1}.
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${severityBadgeClasses(f.severity)} flex-shrink-0 mt-0.5`}
              >
                {SEVERITY_LABELS[f.severity]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.title}</p>
                <p className="text-xs text-grove-ink/55 truncate">
                  {CATEGORY_LABELS[f.category]}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-green-700 dark:text-green-400 flex-shrink-0">
                {formatMoneyCents(f.estimated_annual_savings_cents)}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  accent,
  small,
}: {
  label: string
  value: string
  subValue?: string
  icon: any
  accent: string
  small?: boolean
}) {
  return (
    <Card variant="bordered">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wide text-grove-ink/55">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <p className={`font-bold ${accent} ${small ? 'text-sm' : 'text-2xl'}`}>
          {value}
          {subValue && (
            <span className="text-xs font-normal text-grove-ink/55 ml-1">{subValue}</span>
          )}
        </p>
      </CardContent>
    </Card>
  )
}

function SeverityBars({ counts }: { counts: Record<string, number> }) {
  const order: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
  const max = Math.max(1, ...order.map(s => counts[s] ?? 0))
  return (
    <div className="space-y-2">
      {order.map(s => {
        const c = counts[s] ?? 0
        return (
          <div key={s} className="flex items-center gap-2">
            <span className="text-xs w-20">{SEVERITY_LABELS[s]}</span>
            <div className="flex-1 bg-primary-50 dark:bg-primary-900/20 rounded h-2 overflow-hidden">
              <div
                className={severityBadgeClasses(s)}
                style={{ width: `${(c / max) * 100}%`, height: '100%' }}
              />
            </div>
            <span className="text-xs font-mono w-8 text-right">{c}</span>
          </div>
        )
      })}
    </div>
  )
}

function Sparkline({ points }: { points: any[] }) {
  if (!points || points.length === 0) {
    return (
      <p className="text-sm text-grove-ink/55 italic">
        More history needed — run analysis again to start charting trends.
      </p>
    )
  }
  const w = 600
  const h = 80
  const counts = points.map((p: any) => p.findings_count)
  const max = Math.max(1, ...counts)
  const step = points.length > 1 ? w / (points.length - 1) : 0
  const path = counts
    .map((c: number, i: number) => {
      const x = i * step
      const y = h - (c / max) * h
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-20"
      preserveAspectRatio="none"
    >
      <path d={path} stroke="#6366f1" strokeWidth={2} fill="none" />
    </svg>
  )
}

// ----------------------------------------------------------- Findings tab

function FindingsTab({ orgId }: { orgId: string }) {
  const [category, setCategory] = useState<FindingCategory | null>(null)
  const [severity, setSeverity] = useState<FindingSeverity | null>(null)
  const [search, setSearch] = useState('')
  const [includeIgnored, setIncludeIgnored] = useState(false)
  const [selected, setSelected] = useState<OrgFinding | null>(null)
  const [ignoreReason, setIgnoreReason] = useState('')

  const findings = useOrgAnalyzerFindings(orgId, {
    category,
    severity,
    include_ignored: includeIgnored,
    limit: 500,
  })
  const ignore = useIgnoreFinding(orgId)
  const unignore = useUnignoreFinding(orgId)
  const applyFix = useApplyFix(orgId)
  const [fixResult, setFixResult] = useState<
    { kind: 'success' | 'error' | 'partial'; message: string } | null
  >(null)

  // Keep `selected` in sync with refreshed data — after ignore/unignore
  // the panel should reflect the new is_ignored state.
  const refreshedSelected = useMemo(() => {
    if (!selected || !findings.data) return selected
    return (
      findings.data.findings.find(f => f.id === selected.id) ?? selected
    )
  }, [findings.data, selected])

  const handleIgnore = async () => {
    if (!refreshedSelected) return
    await ignore.mutateAsync({
      findingId: refreshedSelected.id,
      reason: ignoreReason.trim() || undefined,
    })
    setIgnoreReason('')
  }

  const handleUnignore = async () => {
    if (!refreshedSelected) return
    await unignore.mutateAsync(refreshedSelected.id)
  }

  const handleApplyFix = async () => {
    if (!refreshedSelected) return
    setFixResult(null)
    try {
      const result = await applyFix.mutateAsync({
        findingId: refreshedSelected.id,
      })
      if (result.error) {
        setFixResult({ kind: 'error', message: result.error })
      } else if (result.failed_count > 0 && result.succeeded_count > 0) {
        setFixResult({
          kind: 'partial',
          message: `Partial: ${result.succeeded_count} succeeded, ${result.failed_count} failed.`,
        })
      } else if (result.failed_count > 0) {
        setFixResult({
          kind: 'error',
          message: `All ${result.failed_count} write-backs failed.`,
        })
      } else {
        setFixResult({
          kind: 'success',
          message: `Applied fix to ${result.succeeded_count} target${result.succeeded_count === 1 ? '' : 's'} in Salesforce.`,
        })
      }
    } catch (err: any) {
      setFixResult({
        kind: 'error',
        message: err?.data?.detail || err?.message || 'Apply-fix failed.',
      })
    }
  }

  const filtered = useMemo(() => {
    const rows = findings.data?.findings ?? []
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q),
    )
  }, [findings.data, search])

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Filters + list */}
      <Card variant="bordered" className="col-span-12 lg:col-span-7">
        <CardHeader>
          <CardTitle>
            Findings ({filtered.length}
            {findings.data && filtered.length !== findings.data.findings.length
              ? ` of ${findings.data.findings.length}`
              : ''}
            )
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-grove-ink/50" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search findings…"
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk"
              />
            </div>
            <select
              value={category ?? ''}
              onChange={e =>
                setCategory((e.target.value || null) as FindingCategory | null)
              }
              className="text-sm rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk py-1.5 px-2"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={severity ?? ''}
              onChange={e =>
                setSeverity((e.target.value || null) as FindingSeverity | null)
              }
              className="text-sm rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk py-1.5 px-2"
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeIgnored}
                onChange={e => setIncludeIgnored(e.target.checked)}
                className="rounded border-grove-border dark:border-grove-border-dk"
              />
              Show ignored
            </label>
            <a
              href={
                `${API_BASE}${endpoints.orgAnalyzerFindingsCsv(orgId)}?`
                + new URLSearchParams({
                  ...(category ? { category } : {}),
                  ...(severity ? { severity } : {}),
                  ...(includeIgnored ? { include_ignored: 'true' } : {}),
                }).toString()
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-grove-border dark:border-grove-border-dk text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
              title="Download the filtered findings list as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          </div>
          {findings.isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-grove-ink/55 italic">No findings match.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {filtered.map(f => (
                <li
                  key={f.id}
                  onClick={() => setSelected(f)}
                  className={`py-3 cursor-pointer hover:bg-primary-50/40 dark:hover:bg-primary-900/15/50 px-2 -mx-2 rounded ${
                    refreshedSelected?.id === f.id
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : ''
                  } ${f.is_ignored ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${severityBadgeClasses(f.severity)}`}
                    >
                      {SEVERITY_LABELS[f.severity]}
                    </span>
                    {f.is_ignored && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-grove-border/60 dark:bg-grove-border-dk/70 text-grove-ink/70 dark:text-grove-ink-dk/85 inline-flex items-center gap-1">
                        <EyeOff className="h-2.5 w-2.5" />
                        Ignored
                      </span>
                    )}
                    {f.is_resolved && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 inline-flex items-center gap-1">
                        <Check className="h-2.5 w-2.5" />
                        Resolved
                      </span>
                    )}
                    {f.evidence?.non_billable_org && (
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        title="No dollar savings attributed: this org's license seats are bundled at no cost."
                      >
                        Non-billable
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-grove-ink/55 truncate">
                        {CATEGORY_LABELS[f.category]} &middot;{' '}
                        {f.affected_count} affected
                        {f.estimated_annual_savings_cents
                          ? ` · ${formatMoneyCents(f.estimated_annual_savings_cents)}/yr`
                          : ''}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-grove-border flex-shrink-0 mt-1" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Drill-down */}
      <Card variant="bordered" className="col-span-12 lg:col-span-5">
        <CardHeader>
          <CardTitle>
            {refreshedSelected ? 'Finding detail' : 'Click a finding to inspect'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!refreshedSelected ? (
            <p className="text-sm text-grove-ink/55 italic">
              Pick a finding from the list to see its evidence, recommended
              action, and Salesforce deeplink.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${severityBadgeClasses(refreshedSelected.severity)}`}
                >
                  {SEVERITY_LABELS[refreshedSelected.severity]}
                </span>
                {refreshedSelected.is_ignored && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-grove-border/60 dark:bg-grove-border-dk/70 text-grove-ink/70 dark:text-grove-ink-dk/85 inline-flex items-center gap-1">
                    <EyeOff className="h-2.5 w-2.5" />
                    Ignored
                  </span>
                )}
                {refreshedSelected.is_resolved && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 inline-flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" />
                    Resolved
                  </span>
                )}
                {refreshedSelected.evidence?.non_billable_org && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    title={
                      refreshedSelected.evidence?.non_billable_reason
                      || 'No dollar savings attributed: this org bundles the SKU at no cost.'
                    }
                  >
                    Non-billable
                  </span>
                )}
                <span className="text-xs text-grove-ink/55">
                  {CATEGORY_LABELS[refreshedSelected.category]}
                </span>
              </div>
              <h3 className="text-base font-semibold">{refreshedSelected.title}</h3>
              <p className="text-grove-ink/85 dark:text-grove-ink-dk/85">{refreshedSelected.description}</p>
              {refreshedSelected.recommended_action && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300 mb-1">
                    Recommended action
                  </p>
                  <p className="text-xs">{refreshedSelected.recommended_action}</p>
                </div>
              )}

              {/* Apply-fix — only shown when the backend reports
                  has_apply_fix for this code AND the finding isn't
                  already resolved. Confirmation lives inline via the
                  button label + toast so we don't add a modal. */}
              {refreshedSelected.has_apply_fix && !refreshedSelected.is_resolved && (
                <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded p-2 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                    Apply fix in Salesforce
                  </p>
                  <p className="text-[11px] text-primary-800 dark:text-primary-200">
                    This finding can be auto-fixed:{' '}
                    {refreshedSelected.code === 'LICENSE_INACTIVE_USER'
                      || refreshedSelected.code === 'LICENSE_NEVER_LOGGED_IN'
                      ? 'deactivate the affected users (User.IsActive = false). Each PATCH is audit-logged.'
                      : 'the backend will apply the change.'}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={applyFix.isPending}
                    onClick={handleApplyFix}
                  >
                    {applyFix.isPending
                      ? 'Applying…'
                      : `Apply fix (${refreshedSelected.affected_count} target${refreshedSelected.affected_count === 1 ? '' : 's'})`}
                  </Button>
                  {fixResult && (
                    <p
                      className={`text-[11px] ${
                        fixResult.kind === 'success'
                          ? 'text-green-700 dark:text-green-300'
                          : fixResult.kind === 'partial'
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-red-700 dark:text-red-300'
                      }`}
                    >
                      {fixResult.message}
                    </p>
                  )}
                </div>
              )}
              {refreshedSelected.is_resolved && refreshedSelected.resolved_at && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    <strong>Resolved</strong>{' '}
                    {refreshedSelected.resolved_by ? `by ${refreshedSelected.resolved_by} ` : ''}
                    on{' '}
                    {new Date(refreshedSelected.resolved_at).toLocaleString()}.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Affected" value={String(refreshedSelected.affected_count)} />
                <Stat
                  label="Savings/yr"
                  value={formatMoneyCents(refreshedSelected.estimated_annual_savings_cents)}
                />
              </div>
              {refreshedSelected.sf_setup_deeplink && (
                <a
                  href={refreshedSelected.sf_setup_deeplink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary-700 dark:text-primary-400 hover:underline"
                >
                  Open in Salesforce Setup
                  <ArrowRight className="h-3 w-3" />
                </a>
              )}
              {refreshedSelected.evidence?.cost_calculation && (
                <CostCalculationCard
                  calc={refreshedSelected.evidence.cost_calculation}
                />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-grove-ink/55 mb-1">
                  Evidence
                </p>
                <pre className="text-[10px] bg-grove-canvas dark:bg-grove-canvas-dk border border-grove-border dark:border-grove-border-dk rounded p-2 overflow-auto max-h-64">
                  {JSON.stringify(refreshedSelected.evidence, null, 2)}
                </pre>
              </div>
              <p className="text-[10px] text-grove-ink/50 font-mono">
                Code: {refreshedSelected.code}
              </p>

              {/* Ignore controls — let the consultant flag intentional or
                  out-of-scope findings without losing the row. Stays under
                  the evidence so it's a deliberate action, not the default. */}
              <div className="border-t border-grove-border dark:border-grove-border-dk pt-3">
                {refreshedSelected.is_ignored ? (
                  <div className="space-y-2">
                    <p className="text-xs text-grove-ink/55">
                      Ignored
                      {refreshedSelected.ignored_by && (
                        <> by <strong>{refreshedSelected.ignored_by}</strong></>
                      )}
                      {refreshedSelected.ignored_at && (
                        <> on {new Date(refreshedSelected.ignored_at).toLocaleString()}</>
                      )}
                      {refreshedSelected.ignore_reason && (
                        <>
                          {' — '}
                          <em>"{refreshedSelected.ignore_reason}"</em>
                        </>
                      )}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={unignore.isPending}
                      onClick={handleUnignore}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      {unignore.isPending ? 'Restoring…' : 'Restore this finding'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-grove-ink/55">
                      Ignore this finding
                    </p>
                    <p className="text-xs text-grove-ink/55">
                      Intentional configuration, out-of-scope, or a known
                      false positive? Ignoring drops it from the report and
                      the savings total. The row is preserved so you can
                      restore it later.
                    </p>
                    <input
                      value={ignoreReason}
                      onChange={e => setIgnoreReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full text-xs rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk px-2 py-1.5"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={ignore.isPending}
                      onClick={handleIgnore}
                    >
                      <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                      {ignore.isPending ? 'Ignoring…' : 'Ignore finding'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-grove-border dark:border-grove-border-dk rounded p-2">
      <p className="text-[10px] uppercase tracking-wide text-grove-ink/55">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

// Shows the math behind a finding's dollar estimate so the consultant
// can defend the number in front of a CFO. Two shapes:
//   - Flat (single-license): "9 inactive users × $165/mo × 12 = $17,820"
//   - Mixed (by_license): one row per SKU the affected users hold, with
//     free / unpriced rows flagged inline so the total reflects reality.
function CostCalculationCard({ calc }: { calc: any }) {
  if (!calc) return null
  const byLicense: any[] | undefined = calc.by_license
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300 mb-1">
        How we calculated this
      </p>
      {byLicense && byLicense.length > 0 ? (
        <div className="space-y-1">
          {byLicense.map((row, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-2 text-xs"
            >
              <span className="font-mono text-green-900 dark:text-green-100 flex-1">
                {row.count} {row.license_name}
                {row.monthly_cents > 0 ? (
                  <> × ${(row.monthly_cents / 100).toFixed(2)}/mo × 12</>
                ) : (
                  <span className="text-grove-ink/55 dark:text-grove-ink-dk/55 italic">
                    {' '}— {row.note ?? 'no monetary impact'}
                  </span>
                )}
              </span>
              <span className="font-mono font-semibold text-green-700 dark:text-green-400 flex-shrink-0">
                {row.monthly_cents > 0
                  ? formatMoneyCents(row.annual_cents)
                  : '$0'}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between pt-1 mt-1 border-t border-green-200 dark:border-green-800 text-xs">
            <span className="text-green-800 dark:text-green-200 font-semibold">
              Total annual savings
            </span>
            <span className="font-mono font-bold text-green-700 dark:text-green-400">
              {formatMoneyCents(calc.total_annual_cents)}
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-mono text-green-900 dark:text-green-100">
            {calc.formula ?? '—'}
          </p>
          <p className="text-xs mt-1 text-green-800 dark:text-green-200">
            =&nbsp;
            <strong>{formatMoneyCents(calc.total_annual_cents)}</strong>
            &nbsp;/year
            {calc.license_name && (
              <span className="text-[10px] text-green-700 dark:text-green-400 ml-1">
                ({calc.license_name})
              </span>
            )}
          </p>
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------- Savings tab

function SavingsTab({ orgId }: { orgId: string }) {
  const findings = useOrgAnalyzerFindings(orgId, { limit: 500 })
  // Group findings by category and roll up dollar amounts; expanded by
  // default for the highest-savings category so the breakdown is visible
  // without an extra click.
  const grouped = useMemo(() => {
    const map = new Map<string, { total: number; rows: OrgFinding[] }>()
    for (const f of findings.data?.findings ?? []) {
      const slot = map.get(f.category) ?? { total: 0, rows: [] }
      slot.total += f.estimated_annual_savings_cents ?? 0
      slot.rows.push(f)
      map.set(f.category, slot)
    }
    const sorted = Array.from(map.entries()).sort(
      ([, a], [, b]) => b.total - a.total,
    )
    // Sort within each category by savings desc.
    for (const [, slot] of sorted) {
      slot.rows.sort(
        (a, b) =>
          (b.estimated_annual_savings_cents ?? 0) -
          (a.estimated_annual_savings_cents ?? 0),
      )
    }
    return sorted
  }, [findings.data])

  const topCategory = grouped[0]?.[0]
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Auto-expand the top category once data arrives.
  useEffect(() => {
    if (topCategory && expanded.size === 0) {
      setExpanded(new Set([topCategory]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topCategory])

  const toggle = (cat: string) => {
    const next = new Set(expanded)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    setExpanded(next)
  }

  const grandTotal = grouped.reduce((s, [, slot]) => s + slot.total, 0)
  const max = Math.max(1, ...grouped.map(([, s]) => s.total))

  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Estimated annual savings — broken down by finding</span>
          {grandTotal > 0 && (
            <span className="text-base font-mono text-green-700 dark:text-green-400">
              {formatMoneyCents(grandTotal)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-sm text-grove-ink/55 italic">
            No quantifiable savings yet. License-waste findings (inactive
            users, unused seats, oversized licenses) drive most of this
            number — once those rules fire, the math shows up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {grouped.map(([cat, slot]) => {
              const isOpen = expanded.has(cat)
              const label = CATEGORY_LABELS[cat as FindingCategory] ?? cat
              return (
                <li
                  key={cat}
                  className="border border-grove-border dark:border-grove-border-dk rounded"
                >
                  <button
                    onClick={() => toggle(cat)}
                    className="w-full text-left px-3 py-2 hover:bg-primary-50/40 dark:hover:bg-primary-900/15/50 rounded"
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-grove-ink/50" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-grove-ink/50" />
                        )}
                        {label}
                        <span className="text-xs text-grove-ink/55 font-normal">
                          ({slot.rows.length}{' '}
                          {slot.rows.length === 1 ? 'finding' : 'findings'})
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-green-700 dark:text-green-400">
                        {formatMoneyCents(slot.total)}
                      </span>
                    </div>
                    <div className="bg-primary-50 dark:bg-primary-900/20 rounded h-2 overflow-hidden">
                      <div
                        className="bg-green-500 h-full"
                        style={{ width: `${(slot.total / max) * 100}%` }}
                      />
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="border-t border-grove-border dark:border-grove-border-dk divide-y divide-grove-border dark:divide-grove-border-dk">
                      {slot.rows.map(f => (
                        <SavingsBreakdownRow key={f.id} finding={f} />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SavingsBreakdownRow({ finding }: { finding: OrgFinding }) {
  const calc = finding.evidence?.cost_calculation
  const dollars = finding.estimated_annual_savings_cents
  const byLicense: any[] | undefined = calc?.by_license
  return (
    <li className="px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{finding.title}</p>
          {byLicense && byLicense.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {byLicense.map((row, i) => (
                <li
                  key={i}
                  className="text-[11px] font-mono text-grove-ink/55 dark:text-grove-ink-dk/55 flex items-baseline justify-between gap-2"
                >
                  <span>
                    {row.count} {row.license_name}
                    {row.monthly_cents > 0 ? (
                      <> × ${(row.monthly_cents / 100).toFixed(2)}/mo × 12</>
                    ) : (
                      <span className="italic text-grove-ink/50">
                        {' '}— {row.note ?? 'no monetary impact'}
                      </span>
                    )}
                  </span>
                  <span className="text-green-700 dark:text-green-400">
                    {row.monthly_cents > 0
                      ? formatMoneyCents(row.annual_cents)
                      : '$0'}
                  </span>
                </li>
              ))}
            </ul>
          ) : calc?.formula ? (
            <p className="text-[11px] font-mono text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
              {calc.formula}
              {calc.total_annual_cents != null && (
                <>
                  {' = '}
                  <span className="text-green-700 dark:text-green-400 font-semibold">
                    {formatMoneyCents(calc.total_annual_cents)}/yr
                  </span>
                </>
              )}
            </p>
          ) : finding.description ? (
            <p className="text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5 line-clamp-2">
              {finding.description}
            </p>
          ) : null}
        </div>
        <span className="font-mono text-sm font-semibold text-green-700 dark:text-green-400 flex-shrink-0">
          {dollars ? formatMoneyCents(dollars) : '—'}
        </span>
      </div>
    </li>
  )
}

// ----------------------------------------------------------- Trends tab

function TrendsTab({ history, summary }: { history: any[]; summary: any }) {
  const licenseRows: any[] = summary?.metrics?.license_utilization ?? []
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Findings count over time</CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline points={history} />
            <p className="text-xs text-grove-ink/55 mt-2">
              {history.length} snapshot{history.length === 1 ? '' : 's'} on file.
            </p>
          </CardContent>
        </Card>
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Org limits</CardTitle>
          </CardHeader>
          <CardContent>
            <LimitsBars limits={summary?.org_limits ?? {}} />
          </CardContent>
        </Card>
      </div>
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>License utilisation (purchased vs assigned)</CardTitle>
        </CardHeader>
        <CardContent>
          <LicenseUtilizationTable rows={licenseRows} />
        </CardContent>
      </Card>
    </div>
  )
}

function LicenseUtilizationTable({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-grove-ink/55 italic">
        License inventory unavailable. Run analysis to fetch UserLicense
        and PermissionSetLicense from the org.
      </p>
    )
  }
  // Sort highest-surplus first — that's where the savings story lives.
  const sorted = [...rows].sort((a, b) => (b.total - b.used) - (a.total - a.used))
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b border-grove-border dark:border-grove-border-dk">
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55">License</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55 text-right">Used</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55 text-right">Total</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55 text-right">Surplus</th>
          <th className="py-2 text-xs uppercase tracking-wide text-grove-ink/55">Utilisation</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const surplus = (r.total ?? 0) - (r.used ?? 0)
          return (
            <tr key={`${r.developer_key}-${i}`} className="border-b border-grove-border/60 dark:border-grove-border-dk">
              <td className="py-2 pr-3">
                <div className="text-sm">{r.license_name}</div>
                <div className="text-[10px] text-grove-ink/55">{r.kind} license</div>
              </td>
              <td className="py-2 pr-3 text-right font-mono text-sm">{r.used}</td>
              <td className="py-2 pr-3 text-right font-mono text-sm">{r.total}</td>
              <td className="py-2 pr-3 text-right font-mono text-sm">
                <span className={surplus > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                  {surplus}
                </span>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-primary-50 dark:bg-primary-900/20 rounded h-2 overflow-hidden min-w-[60px]">
                    <div
                      className={
                        r.utilization_pct >= 90
                          ? 'bg-green-500 h-full'
                          : r.utilization_pct >= 50
                            ? 'bg-amber-500 h-full'
                            : 'bg-red-500 h-full'
                      }
                      style={{ width: `${r.utilization_pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">
                    {r.utilization_pct}%
                  </span>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Pretty formatting for /limits payload values. SF returns MB for storage
// and integers for request counters; we choose the unit per metric.
function _formatLimit(key: string, n: number): string {
  if (key.endsWith('MB')) {
    if (n >= 1024) return `${(n / 1024).toFixed(2)} GB`
    return `${n.toLocaleString()} MB`
  }
  return n.toLocaleString()
}

const LIMIT_LABELS: Record<string, string> = {
  DataStorageMB: 'Data storage',
  FileStorageMB: 'File storage',
  DailyApiRequests: 'Daily API requests',
  DailyBulkApiBatches: 'Daily bulk API batches',
  DailyAsyncApexExecutions: 'Daily async Apex',
  DailyWorkflowEmails: 'Daily workflow emails',
  HourlyAsyncReportRuns: 'Hourly async report runs',
  MassEmail: 'Mass email (24h)',
  SingleEmail: 'Single email (24h)',
}

function LimitsBars({ limits }: { limits: Record<string, any> }) {
  const allKeys = Object.keys(LIMIT_LABELS)
  const rows = allKeys
    .filter(k => limits[k] && typeof limits[k].Max === 'number')
    .map(k => {
      const { Max, Remaining } = limits[k]
      const used = Math.max(0, Max - Remaining)
      const usedPct = Max > 0 ? Math.round((used / Max) * 100) : 0
      return {
        key: k,
        label: LIMIT_LABELS[k] || k,
        max: Max,
        remaining: Remaining,
        used,
        usedPct,
      }
    })

  if (rows.length === 0) {
    return (
      <p className="text-sm text-grove-ink/55 italic">
        Org limits unavailable. Run analysis to fetch them.
      </p>
    )
  }

  const totalAcrossAll = rows.reduce((sum, r) => sum + r.used, 0)
  return (
    <div>
      {totalAcrossAll === 0 && (
        <p className="text-xs text-grove-ink/55 italic mb-3">
          Note: every metric below reports 0% used. For a developer / scratch
          org this is normal &mdash; the bars will populate as the org accrues
          real usage.
        </p>
      )}
      <ul className="space-y-3">
        {rows.map(r => (
          <li key={r.key}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span>{r.label}</span>
              <span className="text-xs font-mono text-grove-ink/55">
                {_formatLimit(r.key, r.used)} / {_formatLimit(r.key, r.max)}{' '}
                <span
                  className={
                    r.usedPct >= 90
                      ? 'text-red-600 font-semibold'
                      : r.usedPct >= 75
                        ? 'text-amber-600 font-semibold'
                        : ''
                  }
                >
                  ({r.usedPct}%)
                </span>
              </span>
            </div>
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded h-2 overflow-hidden">
              <div
                className={
                  r.usedPct >= 90
                    ? 'bg-red-600 h-full'
                    : r.usedPct >= 75
                      ? 'bg-amber-500 h-full'
                      : 'bg-primary-600 h-full'
                }
                style={{
                  width: `${Math.max(r.usedPct, r.used > 0 ? 1 : 0)}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ----------------------------------------------------------- Price book tab

function PriceBookTab({ orgId }: { orgId: string }) {
  const pb = useLicensePriceBook(orgId)
  const update = useUpdateLicensePriceBook(orgId)
  const [rows, setRows] = useState<PriceBookRow[] | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [brandOpen, setBrandOpen] = useState(false)

  const display = rows ?? pb.data?.rows ?? []

  const handleSet = (i: number, key: keyof PriceBookRow, val: string) => {
    const next = [...display]
    if (key === 'monthly_cost_cents') {
      next[i] = { ...next[i], monthly_cost_cents: Math.max(0, parseInt(val) || 0) }
    } else {
      next[i] = { ...next[i], license_name: val }
    }
    setRows(next)
  }

  const handleToggleBilled = (i: number) => {
    const next = [...display]
    next[i] = { ...next[i], is_billed: !(next[i].is_billed ?? true) }
    setRows(next)
  }

  const handleAdd = () => {
    setRows([
      ...(display ?? []),
      { license_name: 'New SKU', monthly_cost_cents: 0, is_billed: true },
    ])
  }

  const handleDelete = (i: number) => {
    const next = [...display]
    next.splice(i, 1)
    setRows(next)
  }

  const handleSave = async () => {
    if (!rows) return
    setSavedMessage(null)
    try {
      await update.mutateAsync(rows)
      setRows(null)
      setSavedMessage('Price book saved. Re-run analysis to recompute savings.')
      setTimeout(() => setSavedMessage(null), 5000)
    } catch (err: any) {
      setSavedMessage(`Save failed: ${err?.message ?? 'Unknown error'}`)
    }
  }

  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>License price book</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-grove-ink/55 mb-3">
          Monthly cost per license SKU in cents. SKUs labelled{' '}
          <span className="font-semibold text-primary-700 dark:text-primary-300">In org</span>{' '}
          are the actual{' '}
          <code>UserLicense</code> + <code>PermissionSetLicense</code>{' '}
          records this org owns. Default prices come from a built-in
          catalog of Salesforce Enterprise list prices; rows flagged{' '}
          <span className="font-semibold text-green-700 dark:text-green-400">Custom</span>{' '}
          have been overridden by you. The{' '}
          <span className="font-semibold">Billed</span> toggle controls
          whether the SKU contributes to savings calculations — flip to{' '}
          <span className="font-semibold">Bundled</span> for SKUs that
          ship at $0 with your customer&apos;s contract (Dev / Sandbox /
          Trial orgs auto-default to Bundled for all SKUs). Hover the
          toggle for the auto-detection reason.
        </p>
        {pb.isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-grove-border dark:border-grove-border-dk">
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55">License</th>
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55">Source</th>
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55">Billed?</th>
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-grove-ink/55">Cost (cents/mo)</th>
                <th className="py-2 text-xs uppercase tracking-wide text-grove-ink/55">Cost (USD/mo)</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {display.map((r, i) => {
                const billed = r.is_billed ?? true
                return (
                  <tr key={i} className={`border-b border-grove-border/60 dark:border-grove-border-dk ${!billed ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''}`}>
                    <td className="py-1 pr-3">
                      <input
                        value={r.license_name}
                        onChange={e => handleSet(i, 'license_name', e.target.value)}
                        className="w-full px-2 py-1 rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk text-sm"
                      />
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {r.in_org && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300"
                            title="Detected in the org's UserLicense / PSL inventory"
                          >
                            In org
                          </span>
                        )}
                        {r.is_override ? (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                            title="You have set this price; it overrides the catalog default"
                          >
                            Custom
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-50 text-grove-ink/85 dark:bg-primary-900/20 dark:text-grove-ink-dk/70"
                            title="From the built-in Salesforce list-price catalog"
                          >
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 pr-3">
                      <button
                        type="button"
                        onClick={() => handleToggleBilled(i)}
                        title={r.billed_reason || (billed ? 'This SKU contributes to savings calculations' : 'This SKU is treated as bundled — $0 savings attributed')}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition ${
                          billed
                            ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300'
                            : 'bg-primary-50 border-grove-border text-grove-ink/85 dark:bg-primary-900/20 dark:border-grove-border-dk dark:text-grove-ink-dk/70'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            billed ? 'bg-green-500' : 'bg-grove-ink/40'
                          }`}
                        />
                        {billed ? 'Billed' : 'Bundled'}
                      </button>
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={r.monthly_cost_cents}
                        onChange={e => handleSet(i, 'monthly_cost_cents', e.target.value)}
                        disabled={!billed}
                        className={`w-32 px-2 py-1 rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk text-sm font-mono ${
                          !billed ? 'opacity-50' : ''
                        }`}
                      />
                    </td>
                    <td className="py-1 text-xs text-grove-ink/55 font-mono">
                      {billed
                        ? `$${(r.monthly_cost_cents / 100).toFixed(2)}`
                        : <span className="italic">bundled — $0</span>
                      }
                    </td>
                    <td className="py-1 text-right">
                      <button
                        onClick={() => handleDelete(i)}
                        className="text-grove-ink/50 hover:text-red-600"
                        title="Remove SKU"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleAdd}>
            <PlayCircle className="h-4 w-4 mr-1.5" /> Add SKU
          </Button>
          {rows && (
            <Button
              variant="primary"
              size="sm"
              disabled={update.isPending}
              onClick={handleSave}
            >
              {update.isPending ? 'Saving…' : 'Save price book'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBrandOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-1.5" /> Brand settings
          </Button>
          {savedMessage && (
            <span className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
              <Info className="inline h-3.5 w-3.5 mr-1" />
              {savedMessage}
            </span>
          )}
        </div>
      </CardContent>
      {brandOpen && (
        <BrandSettingsModal orgId={orgId} onClose={() => setBrandOpen(false)} />
      )}
    </Card>
  )
}

// Brand settings modal — firm name + accent color + logo upload.
// Renders the white-labeled report by the next PDF download. All UI;
// no analyzer-logic changes.
function BrandSettingsModal({
  orgId,
  onClose,
}: {
  orgId: string
  onClose: () => void
}) {
  const brand = useBrandSettings(orgId)
  const update = useUpdateBrandSettings(orgId)
  const upload = useUploadBrandLogo(orgId)
  const [firmName, setFirmName] = useState('')
  const [accent, setAccent] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Seed local state once data lands. Empty fields => no override.
  useEffect(() => {
    if (brand.data) {
      setFirmName(brand.data.firm_name ?? '')
      setAccent(brand.data.accent_hex ?? '')
    }
  }, [brand.data])

  const handleSave = async () => {
    setSaved(null)
    try {
      await update.mutateAsync({
        firm_name: firmName || null,
        accent_hex: accent || null,
      })
      setSaved('Brand saved. Next PDF download uses these settings.')
      setTimeout(() => setSaved(null), 5000)
    } catch (err: any) {
      setSaved(`Save failed: ${err?.data?.detail || err?.message || 'unknown'}`)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync(file)
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed.')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-grove-surface dark:bg-grove-canvas-dk rounded-lg shadow-xl max-w-lg w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Brand settings</h2>
            <p className="text-xs text-grove-ink/55 mt-1">
              White-label the PDF report with your firm logo and accent
              color. Leave blank to use the Newton defaults.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-grove-ink/50 hover:text-grove-ink/70"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs uppercase tracking-wider text-grove-ink/55 mb-1">
              Firm name
            </label>
            <input
              value={firmName}
              onChange={e => setFirmName(e.target.value)}
              placeholder="e.g. Acme Salesforce Consulting"
              className="w-full px-2 py-1.5 rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-grove-ink/55 mb-1">
              Accent color (#RRGGBB)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={accent}
                onChange={e => setAccent(e.target.value)}
                placeholder="#1e1b4b"
                className="flex-1 px-2 py-1.5 rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk text-sm font-mono"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
              {accent && /^#[0-9A-Fa-f]{6}$/.test(accent) && (
                <span
                  className="w-8 h-8 rounded border border-grove-border dark:border-grove-border-dk"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-grove-ink/55 mb-1">
              Firm logo (PNG / JPEG / SVG, 256KB max)
            </label>
            <div className="flex items-center gap-3">
              {brand.data?.has_logo && (
                <img
                  src={`${API_BASE}${endpoints.orgAnalyzerBrandLogo(orgId)}?t=${Date.now()}`}
                  alt="Current firm logo"
                  className="h-12 max-w-[120px] object-contain rounded border border-grove-border dark:border-grove-border-dk bg-white p-1"
                />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleUpload}
                className="text-xs"
                disabled={upload.isPending}
              />
            </div>
            {upload.isPending && (
              <p className="text-xs text-grove-ink/55 mt-1">Uploading…</p>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {uploadError}
              </p>
            )}
          </div>
          {saved && (
            <p className="text-xs text-grove-ink/85 dark:text-grove-ink-dk/85 italic">
              <Info className="inline h-3.5 w-3.5 mr-1" />
              {saved}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={update.isPending}
            onClick={handleSave}
          >
            {update.isPending ? 'Saving…' : 'Save brand settings'}
          </Button>
        </div>
      </div>
    </div>
  )
}
