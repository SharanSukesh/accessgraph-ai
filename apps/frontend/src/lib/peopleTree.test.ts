import { describe, expect, it } from 'vitest'
import type { ReportingGraphEdge } from '@/lib/api/hooks/useReportingGraph'
import {
  NO_FILTERS,
  type Person,
  buildPeople,
  chainTo,
  flagCounts,
  treeRows,
  treeLayout,
  visiblePeople,
} from './peopleTree'

const p = (id: string, extra: Partial<Person> = {}): Person => ({
  user_sf_id: id, name: id, department: 'Sales', is_active: true, title: null, role_name: null, profile_name: null,
  flags: [], ...extra,
})
const m = (source: string, target: string): ReportingGraphEdge => ({ source, target, edge_type: 'manager' })

// ceo <- vp <- (mgr <- [a, b], x) ; gone (inactive) <- c ; d has no manager ; old (inactive, nobody reports)
const nodes = [
  p('ceo', { flags: ['no_manager'] }), p('vp'), p('mgr', { department: 'Service' }),
  p('a', { risk_level: 'high' }), p('b'), p('x', { title: 'Analyst' }),
  p('gone', { is_active: false }), p('c', { flags: ['manager_inactive'] }), p('d', { flags: ['no_manager'] }),
  p('old', { is_active: false }),
]
const edges = [m('vp', 'ceo'), m('mgr', 'vp'), m('a', 'mgr'), m('b', 'mgr'), m('x', 'vp'), m('c', 'gone'),
  { source: 'b', target: 'old', edge_type: 'delegated_approver' as const }]

describe('people tree', () => {
  const people = buildPeople(nodes, edges)

  it('counts direct and total reports, and keeps inactive managers someone still reports to', () => {
    expect(people.reports.get('vp')).toEqual(['mgr', 'x'])
    expect(people.total.get('ceo')).toBe(5)
    expect(people.total.get('mgr')).toBe(2)
    expect(people.shown.has('gone')).toBe(true) // c still reports to them
    expect(people.shown.has('old')).toBe(true) // b's delegated approver
    expect(people.roots).toEqual(['ceo', 'gone', 'd', 'old'])
    expect(chainTo(people, 'a')).toEqual(['ceo', 'vp', 'mgr', 'a'])
  })

  it('opens collapsed at the top and expands one manager at a time', () => {
    expect([...visiblePeople(people, new Set(), null, NO_FILTERS).ids].sort()).toEqual(['ceo', 'd', 'gone', 'old'])
    const open = visiblePeople(people, new Set(['ceo', 'vp']), null, NO_FILTERS)
    expect([...open.ids].sort()).toEqual(['ceo', 'd', 'gone', 'mgr', 'old', 'vp', 'x'])
  })

  it('focus shows the chain to the top and the direct reports', () => {
    const f = visiblePeople(people, new Set(), 'mgr', NO_FILTERS)
    expect(f.mode).toBe('focus')
    expect([...f.ids].sort()).toEqual(['a', 'b', 'ceo', 'mgr', 'vp'])
  })

  it('filters show matches with their chain as context', () => {
    const risky = visiblePeople(people, new Set(), null, { ...NO_FILTERS, highRisk: true })
    expect(risky.matches).toEqual(['a'])
    expect([...risky.context].sort()).toEqual(['ceo', 'mgr', 'vp'])
    const inactive = visiblePeople(people, new Set(), null, { ...NO_FILTERS, inactive: true })
    expect(inactive.matches.sort()).toEqual(['gone', 'old'])
    expect(visiblePeople(people, new Set(), null, { ...NO_FILTERS, department: 'Service' }).matches).toEqual(['mgr'])
    expect(visiblePeople(people, new Set(), null, { ...NO_FILTERS, flag: 'manager_inactive' }).matches).toEqual(['c'])
    expect(visiblePeople(people, new Set(), null, { ...NO_FILTERS, text: 'analyst' }).matches).toEqual(['x'])
  })

  it('builds sortable, indented tree-table rows', () => {
    const rows = treeRows(people, new Set(['ceo', 'vp']), NO_FILTERS, { key: 'total', desc: true })
    expect(rows.map((r) => `${'-'.repeat(r.depth)}${r.id}`)).toEqual(['ceo', '-vp', '--mgr', '--x', 'gone', 'd', 'old'])
    expect(rows.find((r) => r.id === 'mgr')).toMatchObject({ manager: 'vp', direct: 2, total: 2, expandable: true, open: false })
    const filtered = treeRows(people, new Set(), { ...NO_FILTERS, highRisk: true }, { key: 'name', desc: false })
    expect(filtered.map((r) => [r.id, r.depth, r.context])).toEqual([
      ['ceo', 0, true], ['vp', 1, true], ['mgr', 2, true], ['a', 3, false],
    ])
  })

  it('counts flags', () => {
    expect(flagCounts(nodes)).toEqual({ no_manager: 2, manager_inactive: 1, manager_loop: 0, delegated_approver_inactive: 0 })
  })
})

describe('people layout', () => {
  it('centres managers over their reports and wraps wide tops into rows', () => {
    const kids: Record<string, string[]> = { ceo: ['vp1', 'vp2'], vp1: [], vp2: [] }
    const pos = treeLayout(['ceo'], (id) => kids[id] ?? [])
    expect(pos.ceo.x).toBeCloseTo((pos.vp1.x + pos.vp2.x) / 2)
    expect(pos.vp1.y).toBeGreaterThan(pos.ceo.y)
    const many = Array.from({ length: 20 }, (_, i) => `r${i}`)
    const wrapped = treeLayout(many, () => [], 800)
    const rows = new Set(Object.values(wrapped).map((p) => p.y))
    expect(rows.size).toBeGreaterThan(1)
    expect(Math.max(...Object.values(wrapped).map((p) => p.x))).toBeLessThan(800)
  })
})

describe('manager loops', () => {
  // a -> b -> c -> a, d reports to a: nobody has a top.
  const loop = buildPeople(
    ['a', 'b', 'c', 'd'].map((id) => p(id, { flags: id === 'd' ? [] : ['manager_loop'] })),
    [m('a', 'b'), m('b', 'c'), m('c', 'a'), m('d', 'a')],
  )
  it('starts each loop at one member so everyone is reachable', () => {
    expect(loop.roots).toEqual(['a'])
    expect([...visiblePeople(loop, new Set(['a', 'c', 'b']), null, NO_FILTERS).ids].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(chainTo(loop, 'd')).toEqual(['c', 'b', 'a', 'd'])
    const rows = treeRows(loop, new Set(['a', 'c', 'b']), NO_FILTERS, { key: 'name', desc: false })
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    const pos = treeLayout([], (id) => loop.reports.get(id) ?? [], 1700, ['a', 'b', 'c', 'd'])
    expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})
