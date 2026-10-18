import { describe, expect, it } from 'vitest'
import { apexEndpoint, compact, headline, isNearLimit, niceTicks, periodLabel, topSources, usageTiles, type ApiUsage } from './apiUsage'

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

describe('api usage page helpers', () => {
  const full: ApiUsage = {
    ...base,
    total_requests: 10_471_845,
    daily_average: 349_062,
    peak: { date: '2026-09-29', requests: 976_430, counting: 976_430, pct_of_limit: 96.2 },
    apps: [
      { id: 'a', name: 'Warehouse Nightly ETL', requests: 6_070_000, share_pct: 58, series: [1, 2] },
      { id: 'b', name: 'ERP Order Sync', requests: 1_730_000, share_pct: 16.5, series: [2, 1] },
      { id: 'c', name: 'Marketing', requests: 1_180_000, share_pct: 11.3, series: [1, 1] },
      { id: 'd', name: 'Chat', requests: 900_000, share_pct: 8.6, series: [1, 1] },
    ],
  }

  it('gives the four headline figures', () => {
    expect(usageTiles(full)).toEqual([
      { label: '30-day total', value: '10.47M', note: '10,471,845 · 14 Sep to 13 Oct 2026 (30 days)' },
      { label: 'Daily average', value: '349K', note: '349,062 requests a day' },
      { label: 'Today so far', value: '393K of 1.02M', note: '393,000 of 1,015,000 · 39% of the daily limit', warn: false },
      { label: 'Peak day', value: '96.2% of limit', note: '29 Sep 2026 · 976,430 counted', warn: true },
    ])
    expect(usageTiles({ ...full, limit: null })[2]).toEqual({ label: 'Today so far', value: '—', note: 'Limit not read' })
  })

  it('lists the top sources and builds Apex REST endpoints', () => {
    expect(topSources(full).map((a) => a.name)).toEqual(['Warehouse Nightly ETL', 'ERP Order Sync', 'Marketing'])
    // Older reports have only by_app (top 8 plus "Other").
    expect(topSources(base, 3).map((a) => a.name)).toEqual(['Warehouse Nightly ETL', 'ERP Order Sync'])
    const e = { url_mapping: '/chat/v1/*', apex_class: 'Chat', namespace: null, requests: 1, share_pct: 0 }
    expect(apexEndpoint(e)).toBe('/services/apexrest/chat/v1/*')
    expect(apexEndpoint({ ...e, namespace: 'abc' })).toBe('/services/apexrest/abc/chat/v1/*')
  })
})
