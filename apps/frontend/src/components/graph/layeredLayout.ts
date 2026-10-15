/**
 * Left-to-right layered layout for a user's access graph:
 *
 *   user | profile, role, permission sets, groups | a group's included
 *   sets and muting set | object cards
 *
 * Columns are fixed by role in the graph; within a column, nodes are
 * ordered by the average position of their neighbours (two sweeps), and
 * later columns are placed level with their parents, pushed apart only as
 * far as needed so nothing overlaps.
 */

export interface LayoutNode {
  id: string
  type: string
  label?: string
  width: number
  height: number
}

export interface LayoutEdge {
  source: string
  target: string
  type: string
}

export type Positions = Record<string, { x: number; y: number }>

const ROW_GAP = 14
const OBJECT_GAP = 28
const COLUMN_GAP = 110
const OBJECT_COLUMN_GAP = 90
const GROUP_CHILD_EDGES = new Set(['INCLUDES_PERMISSION_SET', 'MUTES'])
const COLUMN1_ORDER = ['profile', 'role', 'group', 'permission_set_group', 'permission_set', 'muting_permission_set']

export function assignColumns(nodes: LayoutNode[], edges: LayoutEdge[], centerId?: string): Record<string, number> {
  const center = centerId ?? nodes.find((n) => n.type === 'user')?.id
  const fromCenter = new Set(edges.filter((e) => e.source === center).map((e) => e.target))
  const groupChildren = new Set(edges.filter((e) => GROUP_CHILD_EDGES.has(e.type)).map((e) => e.target))
  const column: Record<string, number> = {}
  for (const n of nodes) {
    if (n.id === center) column[n.id] = 0
    else if (n.type === 'object') column[n.id] = 3
    else if (fromCenter.has(n.id)) column[n.id] = 1
    else if (groupChildren.has(n.id)) column[n.id] = 2
    else column[n.id] = 1
  }
  return column
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/** Stack nodes top to bottom in the given order, centred on y = 0. */
function stack(ids: string[], size: Map<string, LayoutNode>, gap: number): Map<string, number> {
  const total = ids.reduce((sum, id) => sum + size.get(id)!.height, 0) + gap * Math.max(ids.length - 1, 0)
  let y = -total / 2
  const out = new Map<string, number>()
  for (const id of ids) {
    const h = size.get(id)!.height
    out.set(id, y + h / 2)
    y += h + gap
  }
  return out
}

/** Place each node at its desired y, then push apart just enough to avoid overlap. */
function settle(desired: { id: string; y: number }[], size: Map<string, LayoutNode>, gap: number): Map<string, number> {
  const sorted = [...desired].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
  const out = new Map<string, number>()
  let floor = -Infinity
  for (const { id, y } of sorted) {
    const h = size.get(id)!.height
    const placed = Math.max(y, floor + h / 2)
    out.set(id, placed)
    floor = placed + h / 2 + gap
  }
  // Keep the column centred on where its nodes wanted to be.
  const shift = (mean(sorted.map((d) => d.y)) ?? 0) - (mean(Array.from(out.values())) ?? 0)
  out.forEach((y, id) => out.set(id, y + shift))
  return out
}

export function layeredPositions(nodes: LayoutNode[], edges: LayoutEdge[], centerId?: string): Positions {
  const size = new Map(nodes.map((n) => [n.id, n]))
  const column = assignColumns(nodes, edges, centerId)
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const e of edges) {
    if (!size.has(e.source) || !size.has(e.target)) continue
    if (column[e.source] >= column[e.target]) continue
    parents.set(e.target, [...(parents.get(e.target) ?? []), e.source])
    children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  }
  const inColumn = (c: number) => nodes.filter((n) => column[n.id] === c)

  // Column 1: by type, then label; refined below by where its children sit.
  let col1 = inColumn(1)
    .sort((a, b) =>
      (COLUMN1_ORDER.indexOf(a.type) + 99) % 99 - (COLUMN1_ORDER.indexOf(b.type) + 99) % 99
      || (a.label ?? a.id).localeCompare(b.label ?? b.id))
    .map((n) => n.id)

  const y = new Map<string, number>()
  const place = () => {
    stack(col1, size, ROW_GAP).forEach((v, id) => y.set(id, v))
    for (const [c, gap] of [[2, ROW_GAP], [3, OBJECT_GAP]] as const) {
      const desired = inColumn(c).map((n) => ({
        id: n.id,
        y: mean((parents.get(n.id) ?? []).filter((p) => y.has(p)).map((p) => y.get(p)!)) ?? 0,
      }))
      settle(desired, size, gap).forEach((v, id) => y.set(id, v))
    }
  }

  place()
  for (let sweep = 0; sweep < 2; sweep++) {
    // Reorder column 1 within each type by the mean y of its children.
    const typeOf = (id: string) => size.get(id)!.type
    const bary = (id: string) => mean((children.get(id) ?? []).map((c) => y.get(c) ?? 0)) ?? y.get(id) ?? 0
    col1 = [...col1].sort((a, b) => {
      const t = (COLUMN1_ORDER.indexOf(typeOf(a)) + 99) % 99 - (COLUMN1_ORDER.indexOf(typeOf(b)) + 99) % 99
      return t || bary(a) - bary(b) || a.localeCompare(b)
    })
    place()
  }

  // x: columns left to right, each as wide as its widest node.
  const widths = [0, 1, 2, 3].map((c) => Math.max(0, ...inColumn(c).map((n) => n.width)))
  const xs: number[] = []
  let x = 0
  for (let c = 0; c < 4; c++) {
    if (c > 0) {
      const gap = c === 3 ? OBJECT_COLUMN_GAP : COLUMN_GAP
      const prev = [...Array(c).keys()].reverse().find((p) => widths[p] > 0) ?? 0
      x = xs[prev] + widths[prev] / 2 + gap + widths[c] / 2
    }
    xs.push(x)
  }
  y.set(nodes.find((n) => column[n.id] === 0)?.id ?? '', 0)

  const positions: Positions = {}
  for (const n of nodes) positions[n.id] = { x: xs[column[n.id]], y: y.get(n.id) ?? 0 }
  return positions
}
