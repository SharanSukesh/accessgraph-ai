import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../../../tailwind.config'

const colors = resolveConfig(tailwindConfig as any).theme.colors as Record<string, any>
const surface: string = colors.grove['surface-dk']

function rgb(hex: string): number[] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('badge dark-mode outlines', () => {
  it('every variant ring is at least 3:1 against the dark card surface', () => {
    const source = readFileSync(join(__dirname, 'Badge.tsx'), 'utf8')
    const variants = source.slice(source.indexOf('const variants = {'), source.indexOf('const sizes = {'))
    const rings = [...variants.matchAll(/dark:ring-([a-z]+(?:-[a-z]+)*?)-([a-z0-9-]+?)(?:\/(\d+))?['\s]/g)]
    expect(rings.length).toBe(6)
    for (const [cls, family, step, alpha] of rings) {
      const hex: string = colors[family][step]
      const a = alpha ? Number(alpha) / 100 : 1
      const ring = rgb(hex).map((c, i) => Math.round(c * a + rgb(surface)[i] * (1 - a)))
      expect(contrast(ring, rgb(surface)), cls).toBeGreaterThanOrEqual(3)
    }
  })

  it('High and Medium never share a colour, in risk or severity badges', () => {
    const source = readFileSync(join(__dirname, 'Badge.tsx'), 'utf8')
    for (const fn of ['RiskBadge', 'SeverityBadge']) {
      const body = source.slice(source.indexOf(`export function ${fn}`))
      const start = body.indexOf('variantMap = {')
      const map = body.slice(start, body.indexOf('}', start))
      const variant = (level: string) => new RegExp(`${level}: '(\\w+)'`).exec(map)?.[1]
      expect(variant('high'), fn).toBe('high')
      expect(new Set(['low', 'medium', 'high', 'critical'].map(variant)).size, fn).toBe(4)
    }
  })
})
