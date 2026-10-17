import { describe, expect, it } from 'vitest'
import { ANOMALY_CSV_COLUMNS, anomalyCSVRows, arrayToCSV, exportStamp, fileSlug } from './exports'

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

  it('exports access anomalies with rank, type and risk level, not severity', () => {
    const [access, session] = anomalyCSVRows([
      { rank: 3, userName: 'User 4F2A9C', category: 'access', type: 'permission_accumulation',
        riskLevel: 'high', severity: null, score: 0.91234, reasons: ['a', 'b'] },
      { userName: 'User 77B1D0', category: 'session', type: 'session_anomaly', severity: 'high',
        riskLevel: 'low', score: 0.8, reasons: ['impossible travel'] },
    ])
    expect(access).toMatchObject({ rank: 3, type: 'Permission accumulation', riskLevel: 'high',
      sessionSeverity: '', score: '0.912', reasons: 'a | b' })
    expect(session).toMatchObject({ rank: '', type: 'Session', sessionSeverity: 'high' })
    expect(ANOMALY_CSV_COLUMNS.map((c) => c.label)).not.toContain('Severity')
  })
})
