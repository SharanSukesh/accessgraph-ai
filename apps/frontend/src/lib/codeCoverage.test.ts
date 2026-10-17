import { describe, expect, it } from 'vitest'
import { type CodeCoverage, coverageStatus, lastRunLabel } from './codeCoverage'

const base: CodeCoverage = {
  org_wide_pct: 71, org_wide_source: 'ApexOrgWideCoverage', gate_pct: 75, below_gate: true, measured: 72,
  below_gate_items: 20, lowest: [], zero_classes: [], zero_triggers: [], no_data: [], no_data_count: 0,
  last_test_run: '2026-09-04T09:00:00+00:00', days_since_run: 40, stale: true, changed_since_run: [],
  changed_since_run_count: 1,
}

describe('code coverage display', () => {
  it('says why, in words', () => {
    expect(coverageStatus(base)).toEqual({ label: 'Below the 75% deployment gate', tone: 'critical' })
    expect(coverageStatus({ ...base, org_wide_pct: 80, below_gate: false }).tone).toBe('warning')
    expect(coverageStatus({ ...base, org_wide_pct: 80, below_gate: false, stale: false, changed_since_run_count: 0 }).tone).toBe('good')
    expect(coverageStatus({ ...base, org_wide_pct: null }).label).toBe('Not measured')
  })

  it('dates the last test run', () => {
    expect(lastRunLabel(base)).toMatch(/^Last test run 40 days ago \(4 Sep\w* 2026\)$/)
    expect(lastRunLabel({ ...base, last_test_run: null, days_since_run: null })).toBe('No test run found')
  })
})
