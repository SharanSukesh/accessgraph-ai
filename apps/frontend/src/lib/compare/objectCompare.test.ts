import { describe, expect, it } from 'vitest'
import { compareObjects } from './objectCompare'

const data = [
  { userId: 'a', objectAccess: [
    { objectName: 'Account', permissions: { canRead: true, canEdit: true } },
    { objectName: 'Case', permissions: { canRead: true } },
  ] },
  { userId: 'b', objectAccess: [
    { objectName: 'Account', permissions: { canRead: true } },
    { objectName: 'Case', permissions: { canRead: true } },
    { objectName: 'Lead', permissions: { canRead: true } },
  ] },
]

describe('compareObjects', () => {
  it('lists every object, sorted, with no cap', () => {
    const many = [{ userId: 'a', objectAccess: Array.from({ length: 250 }, (_, i) => ({
      objectName: `Obj${String(i).padStart(3, '0')}__c`, permissions: { canRead: true } })) }]
    expect(compareObjects(many, ['a'])).toHaveLength(250)
    expect(compareObjects(data, ['a', 'b']).map((r) => r.objectName)).toEqual(['Account', 'Case', 'Lead'])
  })

  it('flags differences, including an object only one user can reach', () => {
    const rows = compareObjects(data, ['a', 'b'])
    expect(rows.map((r) => r.differs)).toEqual([true, false, true])
    expect(rows[2].perms[0]).toBeNull()
  })

  it('filters by search and differences only', () => {
    expect(compareObjects(data, ['a', 'b'], { differencesOnly: true }).map((r) => r.objectName)).toEqual(['Account', 'Lead'])
    expect(compareObjects(data, ['a', 'b'], { search: 'cas' }).map((r) => r.objectName)).toEqual(['Case'])
  })
})
