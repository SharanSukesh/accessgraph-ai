import { describe, expect, it } from 'vitest'
import { ACCESS_SIGNALS, ANOMALY_TYPES, BENCHMARK, LIMITS, SESSION_RULES, flaggedCount, pct } from './anomalyMethodology'
import { ANOMALY_TYPE_FILTERS, anomalyTypeLabel } from './anomalyTypes'

describe('anomaly methodology', () => {
  it('describes the 13 signals the detector uses', () => {
    expect(ACCESS_SIGNALS).toHaveLength(13)
  })

  it('flags 2% of active users, at least one', () => {
    expect(flaggedCount(400)).toBe(8)
    expect(flaggedCount(30)).toBe(1)
    expect(flaggedCount(1250)).toBe(25)
  })

  it('explains every access anomaly type the app shows', () => {
    const shown = ANOMALY_TYPE_FILTERS.filter((t) => t !== 'session_anomaly').map((t) => anomalyTypeLabel(t))
    expect(ANOMALY_TYPES.map((t) => t.name)).toEqual(shown)
    expect(SESSION_RULES).toHaveLength(5)
  })

  it('points at nothing a client cannot open', () => {
    const text = JSON.stringify([ACCESS_SIGNALS, ANOMALY_TYPES, SESSION_RULES, LIMITS])
    expect(text).not.toMatch(/\.md\b|research\/|\.py\b|github/i)
  })

  it('reads the benchmark from the paper extraction', () => {
    expect(BENCHMARK.synthetic_orgs).toBe(150)
    expect(pct(BENCHMARK.mean_recall)).toBe(28)
    const over = BENCHMARK.per_pattern_recall.find((p) => p.paper_column === 'OverPriv')
    expect(over && pct(over.recall)).toBe(10)
    expect(BENCHMARK.venue).toBe('IEEE TPS 2026')
  })
})
