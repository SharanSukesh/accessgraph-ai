/**
 * Display helpers for the Health Report's code coverage card. The data is
 * the snapshot's metrics.code_coverage (backend services/code_coverage.py).
 */

export interface CoverageItem {
  name: string
  type: 'class' | 'trigger'
  pct: number | null
}

export interface CodeCoverage {
  org_wide_pct: number | null
  org_wide_source: string
  gate_pct: number
  below_gate: boolean
  measured: number
  below_gate_items: number
  lowest: CoverageItem[]
  zero_classes: CoverageItem[]
  zero_triggers: CoverageItem[]
  no_data: CoverageItem[]
  no_data_count: number
  last_test_run: string | null
  days_since_run: number | null
  stale: boolean
  changed_since_run: { name: string; type: string; last_modified: string }[]
  changed_since_run_count: number
}

/** Headline status, always with words (never colour alone). */
export function coverageStatus(c: CodeCoverage): { label: string; tone: 'critical' | 'warning' | 'good' } {
  if (c.org_wide_pct == null) return { label: 'Not measured', tone: 'warning' }
  if (c.below_gate) return { label: `Below the ${c.gate_pct}% deployment gate`, tone: 'critical' }
  if (c.stale || c.changed_since_run_count > 0) return { label: 'Meets the gate, but figures are out of date', tone: 'warning' }
  return { label: `Meets the ${c.gate_pct}% deployment gate`, tone: 'good' }
}

/** "Last test run 40 days ago (4 Sep 2026)" or a plain "No test run found". */
export function lastRunLabel(c: CodeCoverage): string {
  if (!c.last_test_run || c.days_since_run == null) return 'No test run found'
  const date = new Date(c.last_test_run).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const ago = c.days_since_run === 0 ? 'today' : c.days_since_run === 1 ? '1 day ago' : `${c.days_since_run} days ago`
  return `Last test run ${ago} (${date})`
}
