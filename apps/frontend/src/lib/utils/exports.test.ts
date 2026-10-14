import { describe, expect, it } from 'vitest'
import { arrayToCSV, exportStamp, fileSlug } from './exports'

describe('CSV export', () => {
  it('neutralises values a spreadsheet would run as formulas', () => {
    const csv = arrayToCSV([{ name: '=HYPERLINK("x")' }, { name: '@SUM(A1)' }, { name: 'Mina Tanaka' }])
    expect(csv.split('\n')).toEqual(['name', `"'=HYPERLINK(""x"")"`, "'@SUM(A1)", 'Mina Tanaka'])
  })

  it('builds filename stems', () => {
    expect(fileSlug('Mina Tanaka')).toBe('mina-tanaka')
    expect(fileSlug('User 3F2A1C')).toBe('user-3f2a1c')
    expect(fileSlug('!!!')).toBe('export')
    expect(exportStamp(new Date('2026-10-14T12:00:00Z'))).toBe('20261014')
  })
})
