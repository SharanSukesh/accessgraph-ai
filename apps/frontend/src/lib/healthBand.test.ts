import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HEALTH_BANDS, healthBand } from './healthBand'

describe('health bands', () => {
  it('match the backend bands exactly', () => {
    const py = readFileSync(join(__dirname, '../../../backend/app/services/org_analyzer.py'), 'utf8')
    const block = py.slice(py.indexOf('_HEALTH_BAND = ('), py.indexOf(')\n\n', py.indexOf('_HEALTH_BAND = (')))
    const backend = [...block.matchAll(/\((\d+),\s*"([a-z ]+)"\)/g)].map((m) => [Number(m[1]), m[2]])
    expect(HEALTH_BANDS.map((b) => [b.min, b.label.toLowerCase()])).toEqual(backend)
  })

  it('labels scores', () => {
    expect(healthBand(41).label).toBe('Concerning')
    expect(healthBand(39).label).toBe('Critical')
    expect(healthBand(100).label).toBe('Excellent')
  })
})
