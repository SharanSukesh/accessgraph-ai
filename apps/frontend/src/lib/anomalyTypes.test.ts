import { describe, expect, it } from 'vitest'
import { anomalySummary, anomalyTypeLabel, baseRiskLabel, rankLabel } from './anomalyTypes'

describe('anomaly display', () => {
  it('names each type by its strongest reason', () => {
    expect(anomalyTypeLabel('exclusive_access')).toBe('Exclusive access')
    expect(anomalyTypeLabel('permission_accumulation')).toBe('Permission accumulation')
    expect(anomalyTypeLabel('over_privilege')).toBe('Over-privilege')
    expect(anomalyTypeLabel('some_new_type')).toBe('some new type')
    expect(anomalyTypeLabel(undefined)).toBeNull()
  })

  it('shows rank against the users scored', () => {
    expect(rankLabel(1, 400)).toBe('#1 of 400')
    expect(rankLabel(3, 1200)).toBe('#3 of 1,200')
    expect(rankLabel(2, null)).toBe('#2')
    expect(rankLabel(null, 400)).toBeNull()
  })

  it('summarises an access anomaly as rank, reason and base risk', () => {
    expect(anomalySummary({ rank: 3, usersScored: 400, type: 'permission_accumulation', baseRiskLevel: 'high' }))
      .toBe('#3 of 400 · Permission accumulation · Base risk: High')
    // No risk score yet: rank and reason only, never an invented level.
    expect(anomalySummary({ rank: 1, usersScored: 400, type: 'exclusive_access', baseRiskLevel: null }))
      .toBe('#1 of 400 · Exclusive access')
    expect(baseRiskLabel('CRITICAL')).toBe('Base risk: Critical')
    expect(baseRiskLabel(undefined)).toBeNull()
  })
})
