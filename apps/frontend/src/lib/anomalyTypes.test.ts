import { describe, expect, it } from 'vitest'
import { anomalyTypeLabel, rankLabel } from './anomalyTypes'

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
})
