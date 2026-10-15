import { describe, expect, it } from 'vitest'
import { edgePath, exitPoint, inside, placeLabels, routeEdge, type Box } from './edgeGeometry'

const user: Box = { x: 0, y: 0, w: 44, h: 44 }
const chip = (x: number, y: number, w = 170): Box => ({ x, y, w, h: 42 })

/** What Cytoscape needs to draw the edge: each end's nearest control point lies outside that node. */
function drawable(source: Box, target: Box) {
  const route = routeEdge(source, target)
  if (route.kind === 'straight') return true
  const [c1, c2] = route.controls
  return !inside(c1, source) && !inside(c2, target) && route.weights.every(Number.isFinite)
}

describe('edge routing', () => {
  it('curves left to right between columns', () => {
    const route = routeEdge(user, chip(240, -120))
    expect(route.kind).toBe('bezier')
  })

  it('stays drawable wherever a node is dragged, even far outside the layout', () => {
    // Sales Agent2's profile dragged up and left of the user, a set dragged far down, and a full sweep.
    const positions = [
      { x: -900, y: -700 }, { x: -60, y: -400 }, { x: 0, y: 900 }, { x: 240, y: 1200 },
      { x: 120, y: -30 }, { x: 30, y: 200 }, { x: 5000, y: -5000 },
    ]
    for (let x = -1200; x <= 1200; x += 75)
      for (let y = -1200; y <= 1200; y += 75) positions.push({ x, y })
    for (const p of positions) {
      const dragged = chip(p.x, p.y)
      if (inside({ x: dragged.x, y: dragged.y }, user, 30)) continue // overlapping nodes have no edge to draw
      expect(drawable(user, dragged)).toBe(true)
      expect(drawable(dragged, user)).toBe(true)
    }
  })

  it('ends at the dragged node, on its border', () => {
    const dragged = chip(-800, -600)
    const route = routeEdge(user, dragged)
    const path = edgePath(user, dragged, route)
    const end = path[path.length - 1]
    expect(end).toEqual(exitPoint(dragged, route.kind === 'straight' ? user : route.controls[1]))
    const onBorder =
      Math.abs(Math.abs(end.x - dragged.x) - dragged.w / 2) < 0.01 || Math.abs(Math.abs(end.y - dragged.y) - dragged.h / 2) < 0.01
    expect(onBorder).toBe(true)
  })

  it('bows a same-column edge out to the right of both nodes', () => {
    const group = chip(240, -100)
    const set = chip(240, 200)
    const route = routeEdge(group, set)
    expect(route.kind).toBe('bezier')
    if (route.kind === 'bezier') expect(route.controls[0].x).toBeGreaterThan(240 + 85)
  })
})

describe('label placement', () => {
  it('moves labels off chips and off each other, along their edges', () => {
    const a = chip(300, 0)
    const b = chip(300, 60)
    const blocker = chip(150, 0, 60)
    const pathA = edgePath(user, a, routeEdge(user, a))
    const pathB = edgePath(user, b, routeEdge(user, b))
    const offsets = placeLabels(
      [
        { id: 'a', path: pathA, width: 50, height: 14 },
        { id: 'b', path: pathB, width: 50, height: 14 },
      ],
      [user, a, b, blocker],
    )
    expect(offsets.a).not.toBeCloseTo(offsets.b, 0) // not stacked on each other
  })

  it('places "mutes" first and keeps it off neighbouring edges', () => {
    const group = chip(250, 0)
    const muting = chip(520, 0)
    const neighbour = chip(520, 40)
    const mutes = edgePath(group, muting, routeEdge(group, muting))
    const crossing = edgePath(group, neighbour, routeEdge(group, neighbour))
    const offsets = placeLabels(
      [{ id: 'mutes', path: mutes, width: 40, height: 14, priority: true }],
      [group, muting, neighbour],
      new Map([['mutes', mutes], ['other', crossing]]),
    )
    expect(offsets.mutes).toBeGreaterThan(0)
  })
})
