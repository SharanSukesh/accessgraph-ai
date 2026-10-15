/**
 * Edge routing and label placement for the access graph.
 *
 * Cytoscape starts and ends a curved edge where the line from each node's
 * centre to its nearest control point crosses the node's border. If a
 * control point lies inside the node, there is no crossing, the endpoint is
 * NaN and Cytoscape silently skips the edge. That is what made edges vanish
 * when a node was dragged close to, above or to the left of its partner.
 * `routeEdge` therefore only uses control points outside both nodes, and
 * falls back to a straight edge when the nodes overlap horizontally.
 */

export interface Box {
  x: number // centre
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export type Route =
  | { kind: 'straight' }
  | { kind: 'bezier'; controls: [Point, Point]; distances: number[]; weights: number[] }

/** Clearance a control point keeps from a node's border. */
const CLEARANCE = 12
/** Minimum horizontal gap between nodes for an S-curve. */
const MIN_GAP = 2 * CLEARANCE + 8
const SAME_COLUMN = 40
const BOW = 36

export function inside(p: Point, b: Box, pad = 0): boolean {
  return Math.abs(p.x - b.x) < b.w / 2 + pad && Math.abs(p.y - b.y) < b.h / 2 + pad
}

/** Cytoscape's unbundled-bezier parameters for control points c (relative to s→t). */
function toCytoscape(s: Point, t: Point, controls: [Point, Point]) {
  const length = Math.hypot(t.x - s.x, t.y - s.y)
  const ux = (t.x - s.x) / length
  const uy = (t.y - s.y) / length
  return {
    weights: controls.map((c) => ((c.x - s.x) * ux + (c.y - s.y) * uy) / length),
    // Perpendicular distance, positive to the left of the direction of travel.
    distances: controls.map((c) => (c.y - s.y) * ux - (c.x - s.x) * uy),
  }
}

/**
 * S-curve when the target is clearly to the right of the source; a bow out
 * to the right for nodes stacked in one column; straight otherwise (any
 * drag position, including left of or above the source).
 */
export function routeEdge(source: Box, target: Box): Route {
  const s = { x: source.x, y: source.y }
  const t = { x: target.x, y: target.y }
  if (Math.hypot(t.x - s.x, t.y - s.y) < 1 || Math.abs(t.y - s.y) < 2) return { kind: 'straight' }

  let controls: [Point, Point] | null = null
  const gap = (target.x - target.w / 2) - (source.x + source.w / 2)
  if (gap >= MIN_GAP) {
    const sRight = source.x + source.w / 2
    const tLeft = target.x - target.w / 2
    const reach = Math.max(CLEARANCE, gap * 0.45)
    controls = [{ x: sRight + reach, y: s.y }, { x: tLeft - reach, y: t.y }]
  } else if (Math.abs(t.x - s.x) < SAME_COLUMN && Math.abs(t.y - s.y) > (source.h + target.h) / 2) {
    const right = Math.max(source.x + source.w / 2, target.x + target.w / 2) + BOW
    controls = [{ x: right, y: s.y }, { x: right, y: t.y }]
  }
  if (!controls || controls.some((c) => inside(c, source, CLEARANCE / 2) || inside(c, target, CLEARANCE / 2))) {
    return { kind: 'straight' }
  }
  return { kind: 'bezier', controls, ...toCytoscape(s, t, controls) }
}

/** Where a ray from the box centre towards p leaves the box. */
export function exitPoint(b: Box, p: Point): Point {
  const dx = p.x - b.x
  const dy = p.y - b.y
  if (dx === 0 && dy === 0) return { x: b.x, y: b.y }
  const scale = Math.min(
    dx === 0 ? Infinity : (b.w / 2) / Math.abs(dx),
    dy === 0 ? Infinity : (b.h / 2) / Math.abs(dy),
  )
  return { x: b.x + dx * scale, y: b.y + dy * scale }
}

function quad(p0: Point, c: Point, p1: Point, t: number): Point {
  const a = (1 - t) * (1 - t)
  const b = 2 * (1 - t) * t
  const d = t * t
  return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y }
}

/**
 * Points along the drawn edge, from its start on the source border to its
 * end on the target border (Cytoscape draws two control points as two
 * quadratic pieces joined at their midpoint).
 */
export function edgePath(source: Box, target: Box, route: Route, samples = 24): Point[] {
  if (route.kind === 'straight') {
    const a = exitPoint(source, target)
    const b = exitPoint(target, source)
    return Array.from({ length: samples + 1 }, (_, i) => ({
      x: a.x + ((b.x - a.x) * i) / samples,
      y: a.y + ((b.y - a.y) * i) / samples,
    }))
  }
  const [c1, c2] = route.controls
  const start = exitPoint(source, c1)
  const end = exitPoint(target, c2)
  const mid = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }
  const half = Math.ceil(samples / 2)
  return [
    ...Array.from({ length: half }, (_, i) => quad(start, c1, mid, i / half)),
    ...Array.from({ length: half + 1 }, (_, i) => quad(mid, c2, end, i / half)),
  ]
}

export function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return total
}

export function pointAt(points: Point[], distance: number): Point {
  let left = distance
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (left <= seg && seg > 0) {
      const f = left / seg
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f }
    }
    left -= seg
  }
  return points[points.length - 1]
}

// ---------------------------------------------------------------- labels

export interface LabelInput {
  id: string
  path: Point[]
  width: number
  height: number
  /** Placed first and protected from others (the "mutes" labels). */
  priority?: boolean
}

function overlap(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2))
  const oy = Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2))
  return ox * oy
}

const FRACTIONS = [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75, 0.18, 0.82]

/**
 * For each label, the distance along its edge (from the source end) that
 * keeps it off chips and cards first, then off other labels, then off other
 * edges' lines; the first candidate nearest the middle wins ties.
 */
export function placeLabels(labels: LabelInput[], nodes: Box[], others?: Map<string, Point[]>): Record<string, number> {
  const placed: Box[] = []
  const offsets: Record<string, number> = {}
  const ordered = [...labels].sort((a, b) => Number(!!b.priority) - Number(!!a.priority))
  for (const label of ordered) {
    const length = pathLength(label.path)
    let best = { score: Infinity, offset: length / 2, box: null as Box | null }
    for (const f of FRACTIONS) {
      const offset = length * f
      const c = pointAt(label.path, offset)
      const box = { x: c.x, y: c.y, w: label.width, h: label.height }
      let score = 0
      for (const n of nodes) score += overlap(box, n) * 100
      for (const p of placed) score += overlap(box, p) * 10
      others?.forEach((points, id) => {
        if (id === label.id) return
        for (const pt of points) if (inside(pt, box)) score += label.priority ? 50 : 5
      })
      if (score < best.score) best = { score, offset, box }
      if (score === 0) break
    }
    offsets[label.id] = best.offset
    if (best.box) placed.push(best.box)
  }
  return offsets
}
