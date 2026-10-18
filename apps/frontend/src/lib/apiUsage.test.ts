import { describe, expect, it } from 'vitest'
import { compact, headline, isNearLimit, niceTicks, periodLabel, type ApiUsage } from './apiUsage'

const base: ApiUsage = {
  status: 'ok',
  reason: null,
  coverage_note: '',
  limit: { max: 1_015_000, remaining: 622_000, used: 393_000 },
  days_collected: 30,
  first_day: '2026-09-14',
  last_day: '2026-10-13',
  total_requests: 100,
  by_app: [
    { id: 'a', name: 'Warehouse Nightly ETL', requests: 58, share_pct: 58 },
    { id: 'b', name: 'ERP Order Sync', requests: 42, share_pct: 42 },
  ],
}

describe('api usage labels', () => {
  it('describes the period, or says it is one day only', () => {
    expect(periodLabel(base)).toBe('14 Sep to 13 Oct 2026 (30 days)')
    expect(periodLabel({ ...base, days_collected: 1, first_day: '2026-10-13' })).toBe('13 Oct 2026 only')
  })

  it('names the top consumer, never an "Other" bucket', () => {
    expect(headline(base)).toBe('Warehouse Nightly ETL made 58% of requests')
    expect(headline({ ...base, by_app: [{ name: 'Other (3)', other: true, requests: 9, share_pct: 90 }] })).toBeNull()
  })

  it('formats counts compactly and marks days near the limit', () => {
    expect(compact(976_430)).toBe('976K')
    expect(compact(1_015_000)).toBe('1.02M')
    expect(compact(1_000_000)).toBe('1M')
    expect(compact(2_500)).toBe('2.5K')
    expect(isNearLimit({ date: 'd', requests: 1, counting: 1, pct_of_limit: 96.2 })).toBe(true)
    expect(isNearLimit({ date: 'd', requests: 1, counting: 1, pct_of_limit: 36 })).toBe(false)
    expect(isNearLimit({ date: 'd', requests: 1, counting: 1, pct_of_limit: null })).toBe(false)
  })

  it('picks round axis ticks', () => {
    expect(niceTicks(1_015_000)).toEqual([0, 500_000, 1_000_000])
    expect(niceTicks(380_000)).toEqual([0, 200_000])
    expect(niceTicks(0)).toEqual([0])
  })
})
