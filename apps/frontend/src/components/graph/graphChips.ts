/**
 * Chip artwork for graph nodes: the type icon (the app's lucide set), the
 * name and the small caption, drawn as an SVG image that Cytoscape paints
 * inside the node. Cytoscape draws the chip's fill and colored border, so
 * hover dimming, selection and the PNG export all see the same chip.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Ban, Database, FileCode2, KeyRound, LayoutTemplate, Layers, PanelsTopLeft, Shield, User, UserCircle, Users, Workflow, type LucideIcon } from 'lucide-react'
import {
  CHIP,
  GRAPH_PALETTE,
  USER_NODE_SIZE,
  approximateMeasure,
  chipLayout,
  initials,
  nodeTypeStyle,
  type GraphNodeType,
  type GraphTheme,
  type Measure,
} from './graphStyle'

export const NODE_TYPE_ICONS: Record<GraphNodeType, LucideIcon> = {
  user: User,
  profile: UserCircle,
  role: Shield,
  group: Users,
  permission_set: KeyRound,
  permission_set_group: Layers,
  muting_permission_set: Ban,
  object: Database,
  layout: LayoutTemplate,
  lightning_page: PanelsTopLeft,
  apex_class: FileCode2,
  flow: Workflow,
}

const FONT_FAMILY = 'system-ui, -apple-system, &quot;Segoe UI&quot;, Helvetica, Arial, sans-serif'

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
}

function svgUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const iconCache = new Map<string, string>()

/** The lucide icon as SVG markup, positioned at (x, y). */
function iconMarkup(type: string, color: string, size: number, x: number, y: number): string {
  const key = `${type}|${color}|${size}`
  if (!iconCache.has(key)) {
    const Icon = NODE_TYPE_ICONS[type as GraphNodeType] ?? KeyRound
    iconCache.set(key, renderToStaticMarkup(createElement(Icon, { size, color, strokeWidth: 2 })))
  }
  return iconCache.get(key)!.replace('<svg ', `<svg x="${x}" y="${y}" `)
}

/** Text measurement with the same font the SVG chips render in. */
export function canvasMeasure(): Measure {
  if (typeof document === 'undefined') return approximateMeasure
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return approximateMeasure
  return (text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  }
}

export interface ChipImage {
  uri: string
  width: number
  height: number
}

export function chipImage(type: string, name: string, theme: GraphTheme, measure: Measure): ChipImage {
  const palette = GRAPH_PALETTE[theme]
  const color = nodeTypeStyle(type).color
  const layout = chipLayout(name, type, measure)
  const { width, height, textX } = layout
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + iconMarkup(type, color, CHIP.icon, CHIP.padLeft, (height - CHIP.icon) / 2)
    + `<text x="${textX}" y="19" font-family="${FONT_FAMILY}" font-size="12" font-weight="600" fill="${palette.ink}">${escapeXml(layout.name)}</text>`
    + `<text x="${textX}" y="32" font-family="${FONT_FAMILY}" font-size="8.5" font-weight="600" letter-spacing="${CHIP.captionTracking}" fill="${palette.muted}">${escapeXml(layout.caption)}</text>`
    + '</svg>'
  return { uri: svgUri(svg), width, height }
}

/** The user's circle: initials in the accent color. */
export function userImage(name: string): ChipImage {
  const size = USER_NODE_SIZE
  const color = nodeTypeStyle('user').color
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<text x="${size / 2}" y="${size / 2 + 5}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="14" font-weight="700" fill="${color}">${escapeXml(initials(name))}</text>`
    + '</svg>'
  return { uri: svgUri(svg), width: size, height: size }
}
