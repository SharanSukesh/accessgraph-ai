import { describe, expect, it } from 'vitest'
import { erdPositions, type ErdNode } from './erd'

const node = (name: string, column: number, row: number): ErdNode => ({
  name, label: name, custom: false, described: true, fields: 1, distance: Math.abs(column), column, row, focus: column === 0,
})

describe('erdPositions', () => {
  it('puts parents left and children right, short columns centred', () => {
    const pos = erdPositions([node('Account', -1, 0), node('Invoice__c', 0, 0), node('Payment__c', 1, 0), node('Line__c', 1, 1)])
    expect(pos.Account.x).toBeLessThan(pos.Invoice__c.x)
    expect(pos.Invoice__c.x).toBeLessThan(pos.Payment__c.x)
    // The one-object columns sit level with the middle of the two-object column.
    expect(pos.Invoice__c.y).toBeCloseTo((pos.Payment__c.y + pos.Line__c.y) / 2)
  })
})
