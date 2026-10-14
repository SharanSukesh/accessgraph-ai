import { describe, expect, it } from 'vitest'
import { assignColumns, layeredPositions, type LayoutEdge, type LayoutNode } from './layeredLayout'

const chip = (id: string, type: string, label = id): LayoutNode => ({ id, type, label, width: 140, height: 42 })
const obj = (id: string): LayoutNode => ({ id, type: 'object', label: id, width: 320, height: 300 })

// Sales Agent1: profile, role, a group with one included set and a muting set, two objects.
const nodes: LayoutNode[] = [
  { id: 'u', type: 'user', width: 44, height: 44 },
  chip('prof', 'profile'), chip('role', 'role'), chip('grp', 'permission_set_group'),
  chip('comp', 'permission_set'), chip('mute', 'muting_permission_set'),
  obj('object_Account'), obj('object_Contact'),
]
const edges: LayoutEdge[] = [
  { source: 'u', target: 'prof', type: 'HAS_PROFILE' },
  { source: 'u', target: 'role', type: 'HAS_ROLE' },
  { source: 'u', target: 'grp', type: 'ASSIGNED_PERMISSION_SET_GROUP' },
  { source: 'grp', target: 'comp', type: 'INCLUDES_PERMISSION_SET' },
  { source: 'grp', target: 'mute', type: 'MUTES' },
  { source: 'grp', target: 'object_Account', type: 'GRANTS_ACCESS' },
  { source: 'prof', target: 'object_Contact', type: 'GRANTS_ACCESS' },
]

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }, na: LayoutNode, nb: LayoutNode) {
  return Math.abs(a.x - b.x) < (na.width + nb.width) / 2 && Math.abs(a.y - b.y) < (na.height + nb.height) / 2
}

describe('layered layout', () => {
  it('puts user, grants, group contents and objects in columns left to right', () => {
    const col = assignColumns(nodes, edges, 'u')
    expect(col).toMatchObject({ u: 0, prof: 1, role: 1, grp: 1, comp: 2, mute: 2, object_Account: 3, object_Contact: 3 })
    const p = layeredPositions(nodes, edges, 'u')
    expect(p.u.x).toBeLessThan(p.grp.x)
    expect(p.grp.x).toBeLessThan(p.mute.x)
    expect(p.mute.x).toBeLessThan(p.object_Account.x)
  })

  it('keeps a directly assigned set in the grants column even if a group also includes it', () => {
    const col = assignColumns(nodes, [...edges, { source: 'u', target: 'comp', type: 'ASSIGNED_PERMISSION_SET' }], 'u')
    expect(col.comp).toBe(1)
  })

  it('never overlaps nodes, even with many assignments', () => {
    const many = [
      { id: 'u', type: 'user', width: 44, height: 44 },
      ...Array.from({ length: 16 }, (_, i) => chip(`ps${i}`, 'permission_set', `Set ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => obj(`object_${i}`)),
    ]
    const manyEdges = [
      ...Array.from({ length: 16 }, (_, i) => ({ source: 'u', target: `ps${i}`, type: 'ASSIGNED_PERMISSION_SET' })),
      ...Array.from({ length: 16 }, (_, i) => ({ source: `ps${i}`, target: `object_${i % 5}`, type: 'GRANTS_ACCESS' })),
    ]
    const p = layeredPositions(many, manyEdges, 'u')
    for (let i = 0; i < many.length; i++)
      for (let j = i + 1; j < many.length; j++)
        expect(overlaps(p[many[i].id], p[many[j].id], many[i], many[j])).toBe(false)
  })

  it('places an object level with the node that grants it', () => {
    const p = layeredPositions(nodes, edges, 'u')
    // Account comes from the group, Contact from the profile; they keep that order.
    expect(Math.sign(p.object_Account.y - p.object_Contact.y)).toBe(Math.sign(p.grp.y - p.prof.y))
  })
})
