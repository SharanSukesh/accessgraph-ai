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

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  DollarSign,
  Download,
  FileText,
  Info,
  PlayCircle,
  RefreshCw,
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
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  formatMoneyCents,
  useLicensePriceBook,
  useOrgAnalyzerFindings,
  useOrgAnalyzerHistory,
  useOrgAnalyzerLatest,
  useRunOrgAnalyzer,
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Findings"
          value={summary.findings_count.toString()}
          icon={AlertTriangle}
          accent="text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          label="Est. annual savings"
          value={formatMoneyCents(summary.total_estimated_annual_savings_cents)}
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
  icon: Icon,
  accent,
  small,
}: {
  label: string
  value: string
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
                className={SEVERITY_COLORS[s]}
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
  const [selected, setSelected] = useState<OrgFinding | null>(null)

  const findings = useOrgAnalyzerFindings(orgId, {
    category,
    severity,
    limit: 500,
  })

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
                    selected?.id === f.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/20'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${SEVERITY_COLORS[f.severity]}`}
                    >
                      {SEVERITY_LABELS[f.severity]}
                    </span>
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
            {selected ? 'Finding detail' : 'Click a finding to inspect'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <p className="text-sm text-gray-500 italic">
              Pick a finding from the list to see its evidence, recommended
              action, and Salesforce deeplink.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${SEVERITY_COLORS[selected.severity]}`}
                >
                  {SEVERITY_LABELS[selected.severity]}
                </span>
                <span className="text-xs text-gray-500">
                  {CATEGORY_LABELS[selected.category]}
                </span>
              </div>
              <h3 className="text-base font-semibold">{selected.title}</h3>
              <p className="text-gray-700 dark:text-gray-300">{selected.description}</p>
              {selected.recommended_action && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">
                    Recommended action
                  </p>
                  <p className="text-xs">{selected.recommended_action}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Affected" value={String(selected.affected_count)} />
                <Stat
                  label="Savings/yr"
                  value={formatMoneyCents(selected.estimated_annual_savings_cents)}
                />
              </div>
              {selected.sf_setup_deeplink && (
                <a
                  href={selected.sf_setup_deeplink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open in Salesforce Setup
                  <ArrowRight className="h-3 w-3" />
                </a>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  Evidence
                </p>
                <pre className="text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded p-2 overflow-auto max-h-64">
                  {JSON.stringify(selected.evidence, null, 2)}
                </pre>
              </div>
              <p className="text-[10px] text-gray-400 font-mono">
                Code: {selected.code}
              </p>
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

// ----------------------------------------------------------- Savings tab

function SavingsTab({ orgId }: { orgId: string }) {
  const findings = useOrgAnalyzerFindings(orgId, { limit: 500 })
  const byCat = useMemo(() => {
    const out: Record<string, number> = {}
    for (const f of findings.data?.findings ?? []) {
      out[f.category] =
        (out[f.category] ?? 0) + (f.estimated_annual_savings_cents ?? 0)
    }
    return out
  }, [findings.data])
  const sorted = Object.entries(byCat).sort(([, a], [, b]) => b - a)
  const max = Math.max(1, ...sorted.map(([, v]) => v))
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Estimated annual savings by category</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No quantifiable savings yet. License-waste findings (inactive
            users, oversized licenses) drive most of this number — once
            those rules fire, savings show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {sorted.map(([cat, cents]) => (
              <li key={cat}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{CATEGORY_LABELS[cat as FindingCategory] ?? cat}</span>
                  <span className="font-mono font-semibold text-green-700 dark:text-green-400">
                    {formatMoneyCents(cents)}
                  </span>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full"
                    style={{ width: `${(cents / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------- Trends tab

function TrendsTab({ history, summary }: { history: any[]; summary: any }) {
  return (
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
          <CardTitle>Storage utilisation</CardTitle>
        </CardHeader>
        <CardContent>
          <LimitsBars limits={summary?.org_limits ?? {}} />
        </CardContent>
      </Card>
    </div>
  )
}

function LimitsBars({ limits }: { limits: Record<string, any> }) {
  const keys = [
    'DataStorageMB',
    'FileStorageMB',
    'DailyApiRequests',
    'DailyBulkApiBatches',
  ]
  const rows = keys
    .filter(k => limits[k] && limits[k].Max)
    .map(k => {
      const { Max, Remaining } = limits[k]
      const usedPct = Math.round(((Max - Remaining) / Max) * 100)
      return { key: k, max: Max, remaining: Remaining, usedPct }
    })
  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        Org limits unavailable. Run analysis to fetch them.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {rows.map(r => (
        <li key={r.key}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span>{r.key}</span>
            <span className="text-xs font-mono">
              {r.usedPct}% used
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
              style={{ width: `${r.usedPct}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
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
          Monthly cost per license SKU in cents. Drives the per-finding
          savings estimates. Override the defaults with the customer's
          actual contracted prices.
        </p>
        {pb.isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-800">
                <th className="py-2 pr-3 text-xs uppercase tracking-wide text-gray-500">License</th>
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
