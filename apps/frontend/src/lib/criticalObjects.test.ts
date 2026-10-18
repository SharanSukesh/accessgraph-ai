import { describe, expect, it } from 'vitest'
import type { ObjectScore } from '@/lib/api/hooks/useDataQuality'
import { countCaveats, criticalObjects } from './criticalObjects'

const obj = (name: string, records: number, codes: string[], extra: Partial<ObjectScore> = {}) =>
  ({
    object_name: name, object_label: name, record_count: records,
    critical_flags: codes.map((code) => ({ code, label: code, reason: code })),
    ...extra,
  }) as unknown as ObjectScore

describe('critical objects', () => {
  it('lists flagged objects worst first', () => {
    const list = criticalObjects([
      obj('Account', 5200, ['never_populated']),
      obj('Clean__c', 100, []),
      obj('Partner_Survey__c', 1250, ['mostly_empty']),
      obj('Legacy_Order__c', 18400, ['stale']),
    ])
    expect(list.map((o) => o.object_name)).toEqual(['Legacy_Order__c', 'Partner_Survey__c', 'Account'])
  })

  it('states the caveats on the counts', () => {
    expect(countCaveats(obj('Web_Event__c', 2_000_000, [], {
      estimate_label: 'estimated (sampled 10,000 of about 2,000,000)',
      coverage_label: 'Based on records the integration user can see',
    }))).toEqual(['estimated (sampled 10,000 of about 2,000,000)', 'Based on records the integration user can see'])
    expect(countCaveats(obj('A', 1, []))).toEqual([])
  })
})
