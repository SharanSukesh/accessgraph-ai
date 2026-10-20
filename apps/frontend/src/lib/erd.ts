/**
 * Entity relationship diagram data (roadmap item 12) and its layout: the
 * same geometry as the server's SVG (services/erd.py), so the page, the SVG
 * download and the image pack draw the same picture. Pure; no React.
 */

export interface ErdNode {
  name: string
  label: string
  custom: boolean
  described: boolean
  fields: number
  distance: number
  column: number
  row: number
  focus: boolean
  readers?: number
}

export interface ErdEdge {
  from: string
  to: string
  field: string
  label: string | null
  kind: 'lookup' | 'master_detail'
  required: boolean
  relationshipName: string | null
  cascadeDelete: boolean
  polymorphic: boolean
}

export interface ErdDiagramData {
  focus: string
  depth: number
  hideSystem: boolean
  found: boolean
  nodes: ErdNode[]
  edges: ErdEdge[]
  leftOut: number
  objects: string[]
  note?: string
}

export const BOX_W = 190
export const BOX_H = 46
export const COL_GAP = 90
export const ROW_GAP = 22
export function erdPositions(nodes: ErdNode[]): Record<string, { x: number; y: number }> {
  const height: Record<number, number> = {}
  for (const n of nodes) height[n.column] = Math.max(height[n.column] ?? 0, n.row + 1)
  const tallest = Math.max(0, ...Object.values(height))
  const out: Record<string, { x: number; y: number }> = {}
  for (const n of nodes) {
    const offset = ((tallest - height[n.column]) * (BOX_H + ROW_GAP)) / 2
    out[n.name] = { x: n.column * (BOX_W + COL_GAP) + BOX_W / 2, y: offset + n.row * (BOX_H + ROW_GAP) + BOX_H / 2 }
  }
  return out
}
