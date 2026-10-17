import { describe, expect, it } from 'vitest'
import type { EquityDiagnostic } from '@/lib/api/hooks/useEquity'
import { suggestedGrantsEmpty } from './equityMessages'

const base = {
  snapshot_id: 's', snapshot_at: '2026-10-18T00:00:00Z', equity_index: 1, disparity: 0,
  most_disadvantaged_group: null, vip_count: 3, per_dept_utilities: {}, edge_type_counts: {},
  recommendations_generated: 0, has_data: true,
} as EquityDiagnostic

describe('equity empty state', () => {
  it('says there is no disparity to close instead of "no improvements found"', () => {
    expect(suggestedGrantsEmpty({ ...base, reason: 'no_disparity' }).title).toBe('No disparity to close')
    expect(suggestedGrantsEmpty({ ...base, disparity: 0.4 }).title).toBe('No improvements found')
  })
})
