/**
 * Access graph styling: the one place for node-type colors, chip sizing,
 * edge colors and legend grouping. Used by the Cytoscape stylesheet, the
 * PNG export and the legend, in both themes.
 */

export type GraphNodeType =
  | 'user'
  | 'profile'
  | 'role'
  | 'group'
  | 'permission_set'
  | 'permission_set_group'
  | 'muting_permission_set'
  | 'object'

export interface NodeTypeStyle {
  label: string
  /** Small uppercase line under the name. */
  caption: string
  color: string
  /** Muting sets: dashed border. */
  dashed?: boolean
  /** No fill, border only (muting sets, public groups). */
  outline?: boolean
}

export const NODE_TYPE_STYLES: Record<GraphNodeType, NodeTypeStyle> = {
  user: { label: 'User', caption: 'USER', color: '#D8794A' },
  profile: { label: 'Profile', caption: 'PROFILE', color: '#3987E5' },
  role: { label: 'Role', caption: 'ROLE', color: '#94A3B8' },
  group: { label: 'Public Group', caption: 'PUBLIC GROUP', color: '#94A3B8', outline: true },
  permission_set: { label: 'Permission Set', caption: 'PERMISSION SET', color: '#199E70' },
  permission_set_group: { label: 'Permission Set Group', caption: 'PERMISSION SET GROUP', color: '#D95926' },
  muting_permission_set: {
    label: 'Muting Set', caption: 'MUTING SET', color: '#E66767', dashed: true, outline: true,
  },
  object: { label: 'Object', caption: 'OBJECT', color: '#146B4A' },
}

export function nodeTypeStyle(type: string): NodeTypeStyle {
  return NODE_TYPE_STYLES[type as GraphNodeType] ?? NODE_TYPE_STYLES.permission_set
}

/** Canvas, chip fill and text colors per theme. Chips sit slightly lighter than the canvas. */
export const GRAPH_PALETTE = {
  light: {
    canvas: '#f6f2e7',
    chip: '#fffdf7',
    ink: '#16221a',
    muted: 'rgba(22, 34, 26, 0.55)',
    labelBackground: '#f6f2e7',
  },
  dark: {
    canvas: '#0c1a14',
    chip: '#16302a',
    ink: '#eee8d3',
    muted: 'rgba(238, 232, 211, 0.55)',
    labelBackground: '#0c1a14',
  },
} as const

export type GraphTheme = keyof typeof GRAPH_PALETTE

/** Edges that carry their own color regardless of what they point to. */
export const SPECIAL_EDGES: Record<string, { color: string; lineStyle: 'dotted' | 'dashed' }> = {
  INCLUDES_PERMISSION_SET: { color: NODE_TYPE_STYLES.permission_set_group.color, lineStyle: 'dotted' },
  MUTES: { color: NODE_TYPE_STYLES.muting_permission_set.color, lineStyle: 'dashed' },
}

/** Opacity of an edge at rest; highlighted edges draw at full strength. */
export const EDGE_REST_ALPHA = 0.5

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Edge color: includes/mutes keep their own; others take the color of the node they point to. */
export function edgeColor(edgeType: string, targetType: string, alpha = EDGE_REST_ALPHA): string {
  const special = SPECIAL_EDGES[edgeType]
  return hexToRgba(special ? special.color : nodeTypeStyle(targetType).color, alpha)
}

// ---------------------------------------------------------------- chips

export const CHIP = {
  height: 42,
  padLeft: 10,
  icon: 14,
  gap: 8,
  padRight: 12,
  maxText: 220,
  nameFont: '600 12px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  captionFont: '600 8.5px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  captionTracking: 0.6,
} as const

export type Measure = (text: string, font: string) => number

/** Fallback when no canvas is available (tests): ~0.6em per character. */
export const approximateMeasure: Measure = (text, font) => {
  const size = parseFloat(font.split(' ')[1]) || 12
  return text.length * size * 0.6
}

/** Shorten to fit maxWidth, ending in an ellipsis. */
export function fitText(text: string, font: string, maxWidth: number, measure: Measure): string {
  if (measure(text, font) <= maxWidth) return text
  let out = text
  while (out.length > 1 && measure(`${out}…`, font) > maxWidth) out = out.slice(0, -1)
  return `${out.trimEnd()}…`
}

export interface ChipLayout {
  name: string
  caption: string
  width: number
  height: number
  textX: number
}

/** Chip size for a label, so the name and caption always fit inside. */
export function chipLayout(name: string, type: string, measure: Measure = approximateMeasure): ChipLayout {
  const caption = nodeTypeStyle(type).caption
  const shown = fitText(name || '—', CHIP.nameFont, CHIP.maxText, measure)
  const captionWidth = measure(caption, CHIP.captionFont) + caption.length * CHIP.captionTracking
  const text = Math.max(measure(shown, CHIP.nameFont), captionWidth)
  const textX = CHIP.padLeft + CHIP.icon + CHIP.gap
  return { name: shown, caption, width: Math.ceil(textX + text + CHIP.padRight + 4), height: CHIP.height, textX }
}

export const USER_NODE_SIZE = 44

export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

/** Space an object card needs: up to 320px wide, header + fields (scrolls past 256px) + footer. */
export function objectCardSize(fieldCount: number): { width: number; height: number } {
  return { width: 320, height: 96 + Math.min(fieldCount * 39, 256) + 32 }
}

// ---------------------------------------------------------------- legend

export const LEGEND_GROUPS: { title: string; types: GraphNodeType[] }[] = [
  { title: 'Who', types: ['user', 'profile', 'role', 'group'] },
  { title: 'Grants', types: ['permission_set', 'permission_set_group'] },
  { title: 'Removes', types: ['muting_permission_set'] },
  { title: 'What', types: ['object'] },
]

/** Legend groups holding only the node types (and includes/mutes edges) present in this graph. */
export function legendFor(graph?: { nodes: { type: string }[]; edges: { type: string }[] } | null) {
  const nodeTypes = new Set(graph?.nodes.map((n) => n.type) ?? Object.keys(NODE_TYPE_STYLES))
  const edgeTypes = new Set(graph?.edges.map((e) => e.type) ?? Object.keys(SPECIAL_EDGES))
  return LEGEND_GROUPS.map((group) => ({
    title: group.title,
    types: group.types.filter((t) => nodeTypes.has(t)),
    edges:
      group.title === 'Grants' && edgeTypes.has('INCLUDES_PERMISSION_SET')
        ? ['INCLUDES_PERMISSION_SET']
        : group.title === 'Removes' && edgeTypes.has('MUTES')
          ? ['MUTES']
          : [],
  })).filter((g) => g.types.length > 0 || g.edges.length > 0)
}
