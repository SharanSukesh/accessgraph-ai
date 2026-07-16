'use client'

/**
 * Compliance Scorecards — Roadmap #8.
 *
 * One-click scoring against SOX 404 / SOC 2 / HIPAA / GDPR / PCI DSS
 * control libraries. Every control maps to a signal Newton already
 * computes (Health Report findings, Access + Session anomalies, License
 * Fit, Integration Sprawl) so a scorecard run is fast and doesn't need
 * any new Salesforce data pulls.
 *
 * Layout: framework picker → score header → per-control cards. Each
 * control card carries a pass/fail chip, the source metric, evidence
 * bullets, a recommendation, and a deep link into the Newton surface
 * that produced the finding.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ExternalLink,
  Clock,
} from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  useComplianceFrameworks,
  useLatestScorecard,
  useRunScorecard,
  type ComplianceControlResult,
} from '@/lib/api/hooks/useCompliance'

const DEFAULT_FRAMEWORK = 'SOX'

export default function CompliancePage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const {
    data: frameworks,
    isLoading: frameworksLoading,
    error: frameworksError,
  } = useComplianceFrameworks(orgId)

  const [framework, setFramework] = useState<string>(DEFAULT_FRAMEWORK)

  // If the default framework isn't in the returned list (unlikely — the
  // library ships SOX by default), fall back to the first one available
  // so we don't render a "no data yet" for a framework that doesn't exist.
  useEffect(() => {
    if (frameworks && frameworks.length && !frameworks.find((f) => f.framework === framework)) {
      setFramework(frameworks[0].framework)
    }
  }, [frameworks, framework])

  const {
    data: scorecard,
    isLoading: scorecardLoading,
    error: scorecardError,
  } = useLatestScorecard(orgId, framework)

  const runScorecard = useRunScorecard(orgId)

  const busy = runScorecard.isPending

  if (frameworksError) {
    return (
      <ErrorState
        message="Failed to load compliance frameworks."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Compliance"
        subtitle="One-click auditor-ready scorecards mapped to SOX, SOC 2, HIPAA, GDPR, and PCI DSS controls"
      />

      {/* Framework picker */}
      <div className="flex flex-wrap gap-2">
        {frameworksLoading ? (
          <div className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
            Loading frameworks…
          </div>
        ) : (
          frameworks?.map((fw) => {
            const active = fw.framework === framework
            return (
              <button
                key={fw.framework}
                onClick={() => setFramework(fw.framework)}
                title={fw.label}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  active
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk border-grove-border dark:border-grove-border-dk hover:border-primary-500'
                }`}
              >
                {fw.framework === 'SOC2' ? 'SOC 2'
                  : fw.framework === 'PCI' ? 'PCI DSS'
                  : fw.framework}
                <span className="ml-2 opacity-80">({fw.control_count})</span>
              </button>
            )
          })
        )}
      </div>

      {/* Score header */}
      <ScoreHeader
        scorecard={scorecard}
        loading={scorecardLoading}
        error={!!scorecardError}
        onRun={() => runScorecard.mutate(framework)}
        busy={busy}
      />

      {/* Per-control cards */}
      {scorecardLoading || (busy && !scorecard?.has_data) ? (
        <TableSkeleton rows={6} />
      ) : scorecard?.has_data ? (
        <div className="space-y-3">
          {scorecard.results.map((c) => (
            <ControlCard
              key={c.control_id}
              control={c}
              onOpen={(link) => router.push(link)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="default"
          title={`No ${scorecard?.label ?? framework} scorecard yet`}
          description="Run the scorecard to see pass/fail evidence for each control in this framework."
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- score header

function ScoreHeader({
  scorecard,
  loading,
  error,
  onRun,
  busy,
}: {
  scorecard: any
  loading: boolean
  error: boolean
  onRun: () => void
  busy: boolean
}) {
  const passed = scorecard?.controls_passed ?? 0
  const failed = scorecard?.controls_failed ?? 0
  const na = scorecard?.controls_not_applicable ?? 0
  const total = scorecard?.controls_total ?? 0
  const denom = passed + failed
  const scorePct = scorecard?.score_pct ?? 0
  const scoreColour =
    scorePct >= 90
      ? 'text-emerald-600 dark:text-emerald-400'
      : scorePct >= 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400'

  return (
    <Card variant="bordered">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
              {scorecard?.label ?? 'Framework score'}
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              {loading || error ? (
                <span className="text-4xl font-bold text-grove-ink/40 dark:text-grove-ink-dk/40">
                  —
                </span>
              ) : (
                <>
                  <span className={`text-5xl font-bold tabular-nums ${scoreColour}`}>
                    {scorecard?.has_data ? `${Math.round(scorePct)}%` : '—'}
                  </span>
                  {scorecard?.has_data && (
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      {passed} of {denom} passing
                      {na > 0 ? ` (${na} not applicable)` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
            {scorecard?.snapshot_at && (
              <p className="mt-2 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Refreshed {new Date(scorecard.snapshot_at).toLocaleString()}
                {typeof scorecard.duration_ms === 'number' &&
                  ` — computed in ${scorecard.duration_ms}ms`}
              </p>
            )}
          </div>

          {/* Segmented pass/fail bar */}
          {scorecard?.has_data && total > 0 && (
            <div className="w-full md:w-72">
              <div className="flex h-3 rounded-full overflow-hidden bg-grove-canvas dark:bg-grove-surface-dk">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(passed / total) * 100}%` }}
                  title={`${passed} passing`}
                />
                <div
                  className="bg-rose-500"
                  style={{ width: `${(failed / total) * 100}%` }}
                  title={`${failed} failing`}
                />
                <div
                  className="bg-grove-ink/20 dark:bg-grove-ink-dk/20"
                  style={{ width: `${(na / total) * 100}%` }}
                  title={`${na} not applicable`}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Pass</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Fail</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-grove-ink/20 dark:bg-grove-ink-dk/20" /> N/A</span>
              </div>
            </div>
          )}

          <Button onClick={onRun} disabled={busy} variant="primary">
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {scorecard?.has_data ? 'Refresh' : 'Run scorecard'}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- control card

function ControlCard({
  control,
  onOpen,
}: {
  control: ComplianceControlResult
  onOpen: (link: string) => void
}) {
  const Icon = control.status === 'passed'
    ? CheckCircle2
    : control.status === 'failed'
    ? XCircle
    : MinusCircle
  const chip = control.status === 'passed'
    ? { label: 'PASS', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800' }
    : control.status === 'failed'
    ? { label: 'FAIL', cls: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-800' }
    : { label: 'N/A', cls: 'bg-grove-canvas text-grove-ink/70 dark:bg-grove-surface-dk dark:text-grove-ink-dk/70 ring-1 ring-grove-border dark:ring-grove-border-dk' }
  const iconColour = control.status === 'passed'
    ? 'text-emerald-600 dark:text-emerald-400'
    : control.status === 'failed'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-grove-ink/40 dark:text-grove-ink-dk/40'

  return (
    <Card variant="bordered">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Icon className={`h-6 w-6 mt-0.5 flex-shrink-0 ${iconColour}`} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip.cls}`}>
                {chip.label}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-grove-ink/50 dark:text-grove-ink-dk/50">
                {control.control_id}
              </span>
              <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-grove-ink/45 dark:text-grove-ink-dk/45">
                · {control.section}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              {control.name}
            </h3>
            <p className="mt-1 text-sm text-grove-ink/75 dark:text-grove-ink-dk/75">
              {control.description}
            </p>

            <p className="mt-3 text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
              {control.metric}
            </p>

            {control.evidence?.length > 0 && (
              <ul className="mt-2 list-disc pl-5 space-y-0.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
                {control.evidence.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}

            {control.recommendation && control.status !== 'passed' && (
              <p className="mt-3 text-xs italic text-grove-ink/70 dark:text-grove-ink-dk/70">
                Recommendation: {control.recommendation}
              </p>
            )}

            {control.deep_link && (
              <button
                onClick={() => onOpen(control.deep_link!)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700 dark:text-primary-400 hover:underline"
              >
                Investigate in Newton <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
