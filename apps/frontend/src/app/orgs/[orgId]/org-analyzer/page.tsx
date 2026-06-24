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
  useIgnoreFinding,
  useLicensePriceBook,
  useOrgAnalyzerFindings,
  useOrgAnalyzerHistory,
  useOrgAnalyzerLatest,
  useRunOrgAnalyzer,
  useUnignoreFinding,
  useUpdateLicensePriceBook,
  type FindingCategory,
  type FindingSeverity,
  type OrgFinding,
  type PriceBookRow,
} from '@/lib/api/hooks/useOrgAnalyzer'
import { endpoints } from '@/lib/api/endpoints'

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
    case 'low':      return 'bg-yellow-500 text-gray-900'
    case 'info':     return 'bg-blue-500 text-white'
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <Stethoscope className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Org Analyzer
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              License waste, configuration bloat, automation hygiene,
              security posture, storage risk &mdash; with dollar-impact
              estimates.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasRun && (
            <a
              href={`${API_BASE}${endpoints.orgAnalyzerReportPdf(orgId)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
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
        </div>
      </div>

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
            <Sparkles className="h-10 w-10 mx-auto text-indigo-500 mb-3" />
            <p className="text-base font-medium mb-1">
              No analysis yet
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
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
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    active
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>

          {tab === 'overview' && (
            <OverviewTab summary={summary} history={history.data ?? []} />
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

function OverviewTab({ summary, history }: { summary: any; history: any[] }) {
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
      ? 'text-gray-400'
      : healthScore >= 80
        ? 'text-green-600 dark:text-green-400'
        : healthScore >= 60
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          label="Org health score"
          value={healthScore != null ? `${healthScore}` : '—'}
          subValue={healthScore != null ? '/ 100' : undefined}
          icon={Stethoscope}
          accent={healthAccent}
        />
        <StatCard
          label="Findings"
          value={activeFindings.toString()}
          subValue={ignoredCount ? `(+${ignoredCount} ignored)` : undefined}
          icon={AlertTriangle}
          accent="text-indigo-600 dark:text-indigo-400"
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
          icon={FileText}
          accent="text-gray-700 dark:text-gray-300"
          small
        />
      </div>

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
              <p className="text-sm text-gray-500">No findings.</p>
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
          <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <p className={`font-bold ${accent} ${small ? 'text-sm' : 'text-2xl'}`}>
          {value}
          {subValue && (
            <span className="text-xs font-normal text-gray-500 ml-1">{subValue}</span>
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
            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded h-2 overflow-hidden">
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
      <p className="text-sm text-gray-500 italic">
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
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search findings…"
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
              />
            </div>
            <select
              value={category ?? ''}
              onChange={e =>
                setCategory((e.target.value || null) as FindingCategory | null)
              }
              className="text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 px-2"
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
              className="text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 py-1.5 px-2"
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeIgnored}
                onChange={e => setIncludeIgnored(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              Show ignored
            </label>
          </div>
          {findings.isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No findings match.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {filtered.map(f => (
                <li
                  key={f.id}
                  onClick={() => setSelected(f)}
                  className={`py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 -mx-2 rounded ${
                    refreshedSelected?.id === f.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/20'
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
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 inline-flex items-center gap-1">
                        <EyeOff className="h-2.5 w-2.5" />
                        Ignored
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {CATEGORY_LABELS[f.category]} &middot;{' '}
                        {f.affected_count} affected
                        {f.estimated_annual_savings_cents
                          ? ` · ${formatMoneyCents(f.estimated_annual_savings_cents)}/yr`
                          : ''}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
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
            <p className="text-sm text-gray-500 italic">
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
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 inline-flex items-center gap-1">
                    <EyeOff className="h-2.5 w-2.5" />
                    Ignored
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {CATEGORY_LABELS[refreshedSelected.category]}
                </span>
              </div>
              <h3 className="text-base font-semibold">{refreshedSelected.title}</h3>
              <p className="text-gray-700 dark:text-gray-300">{refreshedSelected.description}</p>
              {refreshedSelected.recommended_action && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">
                    Recommended action
                  </p>
                  <p className="text-xs">{refreshedSelected.recommended_action}</p>
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
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
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
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Evidence
                </p>
                <pre className="text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-2 overflow-auto max-h-64">
                  {JSON.stringify(refreshedSelected.evidence, null, 2)}
                </pre>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                Code: {refreshedSelected.code}
              </p>

              {/* Ignore controls — let the consultant flag intentional or
                  out-of-scope findings without losing the row. Stays under
                  the evidence so it's a deliberate action, not the default. */}
              <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
                {refreshedSelected.is_ignored ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
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
                    <p className="text-xs uppercase tracking-wide text-gray-500">
                      Ignore this finding
                    </p>
                    <p className="text-xs text-gray-500">
                      Intentional configuration, out-of-scope, or a known
                      false positive? Ignoring drops it from the report and
                      the savings total. The row is preserved so you can
                      restore it later.
                    </p>
                    <input
                      value={ignoreReason}
                      onChange={e => setIgnoreReason(e.target.value)}
                      placeholder="Reason (optional)"
                      className="w-full text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5"
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
    <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
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
                  <span className="text-gray-500 dark:text-gray-400 italic">
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
          <p className="text-sm text-gray-500 italic">
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
                  className="border border-gray-200 dark:border-gray-800 rounded"
                >
                  <button
                    onClick={() => toggle(cat)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded"
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium flex items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        {label}
                        <span className="text-xs text-gray-500 font-normal">
                          ({slot.rows.length}{' '}
                          {slot.rows.length === 1 ? 'finding' : 'findings'})
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-green-700 dark:text-green-400">
                        {formatMoneyCents(slot.total)}
                      </span>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded h-2 overflow-hidden">
                      <div
                        className="bg-green-500 h-full"
                        style={{ width: `${(slot.total / max) * 100}%` }}
                      />
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="border-t border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-900">
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
                  className="text-[11px] font-mono text-gray-500 dark:text-gray-400 flex items-baseline justify-between gap-2"
                >
                  <span>
                    {row.count} {row.license_name}
                    {row.monthly_cents > 0 ? (
                      <> × ${(row.monthly_cents / 100).toFixed(2)}/mo × 12</>
                    ) : (
                      <span className="italic text-gray-400">
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
            <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
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
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
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
            <p className="text-xs text-gray-500 mt-2">
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
      <p className="text-sm text-gray-500 italic">
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
        <tr className="text-left border-b border-gray-200 dark:border-gray-800">
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">License</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500 text-right">Used</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500 text-right">Total</th>
          <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500 text-right">Surplus</th>
          <th className="py-2 text-xs uppercase tracking-wide text-gray-500">Utilisation</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const surplus = (r.total ?? 0) - (r.used ?? 0)
          return (
            <tr key={`${r.developer_key}-${i}`} className="border-b border-gray-100 dark:border-gray-900">
              <td className="py-2 pr-3">
                <div className="text-sm">{r.license_name}</div>
                <div className="text-[10px] text-gray-500">{r.kind} license</div>
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
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded h-2 overflow-hidden min-w-[60px]">
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
      <p className="text-sm text-gray-500 italic">
        Org limits unavailable. Run analysis to fetch them.
      </p>
    )
  }

  const totalAcrossAll = rows.reduce((sum, r) => sum + r.used, 0)
  return (
    <div>
      {totalAcrossAll === 0 && (
        <p className="text-xs text-gray-500 italic mb-3">
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
              <span className="text-xs font-mono text-gray-500">
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
            <div className="bg-gray-100 dark:bg-gray-800 rounded h-2 overflow-hidden">
              <div
                className={
                  r.usedPct >= 90
                    ? 'bg-red-600 h-full'
                    : r.usedPct >= 75
                      ? 'bg-amber-500 h-full'
                      : 'bg-indigo-500 h-full'
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

  const handleAdd = () => {
    setRows([...(display ?? []), { license_name: 'New SKU', monthly_cost_cents: 0 }])
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
        <p className="text-xs text-gray-500 mb-3">
          Monthly cost per license SKU in cents. SKUs labelled{' '}
          <span className="font-semibold text-indigo-700 dark:text-indigo-300">In org</span>{' '}
          are the actual{' '}
          <code>UserLicense</code> + <code>PermissionSetLicense</code>{' '}
          records this org owns. Default prices come from a built-in
          catalog of Salesforce Enterprise list prices (refreshed
          periodically); rows flagged{' '}
          <span className="font-semibold text-green-700 dark:text-green-400">Custom</span>{' '}
          have been overridden by you. Replace the defaults with the
          customer's actual contracted prices — those numbers drive
          every license-savings estimate.
        </p>
        {pb.isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-800">
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">License</th>
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">Source</th>
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">Cost (cents/mo)</th>
                <th className="py-2 text-xs uppercase tracking-wide text-gray-500">Cost (USD/mo)</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {display.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-900">
                  <td className="py-1 pr-3">
                    <input
                      value={r.license_name}
                      onChange={e => handleSet(i, 'license_name', e.target.value)}
                      className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                  </td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {r.in_org && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
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
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          title="From the built-in Salesforce list-price catalog"
                        >
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1 pr-3">
                    <input
                      type="number"
                      min={0}
                      value={r.monthly_cost_cents}
                      onChange={e => handleSet(i, 'monthly_cost_cents', e.target.value)}
                      className="w-32 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                    />
                  </td>
                  <td className="py-1 text-xs text-gray-500 font-mono">
                    ${(r.monthly_cost_cents / 100).toFixed(2)}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      onClick={() => handleDelete(i)}
                      className="text-gray-400 hover:text-red-600"
                      title="Remove SKU"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex items-center gap-2">
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
          {savedMessage && (
            <span className="text-xs text-gray-600 dark:text-gray-400">
              <Info className="inline h-3.5 w-3.5 mr-1" />
              {savedMessage}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
