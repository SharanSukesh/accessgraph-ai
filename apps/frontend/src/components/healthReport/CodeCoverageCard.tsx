'use client'

/**
 * Health Report: org code coverage against the 75% deployment gate.
 * One bar (org-wide %) with the gate marked, the 0% lists, and how
 * current the figures are. Reads metrics.code_coverage from the snapshot.
 */

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { type CodeCoverage, coverageStatus, lastRunLabel } from '@/lib/codeCoverage'

const TONE = {
  critical: 'text-rose-700 dark:text-rose-300',
  warning: 'text-amber-700 dark:text-amber-300',
  good: 'text-emerald-700 dark:text-emerald-300',
} as const

function NameList({ title, items }: { title: string; items: { name: string }[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
        {title} ({items.length})
      </p>
      <p className="mt-1 text-xs leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
        {items.map((i) => i.name).join(', ')}
      </p>
    </div>
  )
}

export function CodeCoverageCard({ coverage }: { coverage?: CodeCoverage | null }) {
  if (!coverage) return null
  const status = coverageStatus(coverage)
  const pct = coverage.org_wide_pct ?? 0
  const StatusIcon = status.tone === 'good' ? CheckCircle2 : AlertTriangle

  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Code coverage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="v2-num text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
              {coverage.org_wide_pct == null ? '—' : `${coverage.org_wide_pct}%`}
            </p>
            <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Org-wide Apex coverage
              {coverage.org_wide_source !== 'ApexOrgWideCoverage' && ` (${coverage.org_wide_source})`}
            </p>
          </div>
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${TONE[status.tone]}`}>
            <StatusIcon className="h-4 w-4" aria-hidden /> {status.label}
          </p>
        </div>

        {/* Bullet bar: org-wide % with the deployment gate marked. */}
        <div
          className="relative h-3 rounded-full bg-grove-border/70 dark:bg-grove-border-dk"
          role="img"
          aria-label={`Org-wide coverage ${pct}%, deployment gate ${coverage.gate_pct}%`}
        >
          <div
            className={`h-3 rounded-full ${coverage.below_gate ? 'bg-rose-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
          <div
            className="absolute -top-1 h-5 w-0.5 bg-grove-ink dark:bg-grove-ink-dk"
            style={{ left: `${coverage.gate_pct}%` }}
            title={`${coverage.gate_pct}% deployment gate`}
          />
          <span
            className="absolute top-4 -translate-x-1/2 text-[10px] text-grove-ink/60 dark:text-grove-ink-dk/60"
            style={{ left: `${coverage.gate_pct}%` }}
          >
            {coverage.gate_pct}% gate
          </span>
        </div>

        <div className="grid gap-x-6 gap-y-1 pt-3 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 sm:grid-cols-2">
          <p>
            {coverage.below_gate_items} of {coverage.measured} classes and triggers below {coverage.gate_pct}%
          </p>
          <p className={`flex items-center gap-1 ${coverage.stale ? TONE.warning : ''}`}>
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {lastRunLabel(coverage)}
            {coverage.stale && ' · out of date'}
          </p>
        </div>

        <NameList title="Classes at 0%" items={coverage.zero_classes} />
        <NameList title="Triggers at 0%" items={coverage.zero_triggers} />
        <NameList title="Changed since the last test run" items={coverage.changed_since_run} />
        {coverage.no_data_count > 0 && (
          <NameList title="No coverage recorded (not counted as 0%)" items={coverage.no_data} />
        )}
        <p className="text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50">
          Read from Salesforce&apos;s stored results; Newton never runs tests. Figures describe the code as it was at
          the last test run.
        </p>
      </CardContent>
    </Card>
  )
}
