'use client'

/**
 * Graph Legend
 *
 * Only the node types (and includes / mutes edges) present in the current
 * graph, each drawn as the chip the graph uses, grouped Who / Grants /
 * Removes / What. Colors come from graphStyle.ts. Without a graph, every
 * type is shown.
 */

import { Card, CardContent } from '@/components/shared/Card'
import { GRAPH_PALETTE, NODE_TYPE_STYLES, SPECIAL_EDGES, legendFor, type GraphNodeType } from './graphStyle'
import { NODE_TYPE_ICONS } from './graphChips'
import { useGraphTheme } from './useGraphTheme'

interface GraphLegendProps {
  className?: string
  /** Kept for existing callers; the legend is always compact. */
  compact?: boolean
  graph?: { nodes: { type: string }[]; edges: { type: string }[] } | null
}

const EDGE_LABELS: Record<string, string> = {
  INCLUDES_PERMISSION_SET: 'includes',
  MUTES: 'mutes',
}

function LegendChip({ type, fill }: { type: GraphNodeType; fill: string }) {
  const style = NODE_TYPE_STYLES[type]
  const Icon = NODE_TYPE_ICONS[type]
  if (type === 'user') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ border: `2px solid ${style.color}`, background: fill, color: style.color, boxShadow: `0 0 0 3px ${style.color}22` }}
        >
          U
        </span>
        <span className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75">{style.label}</span>
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1"
      style={{
        border: `1.5px ${style.dashed ? 'dashed' : 'solid'} ${style.color}`,
        background: style.outline ? 'transparent' : fill,
      }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: style.color }} strokeWidth={2} />
      <span className="text-xs font-medium text-grove-ink/85 dark:text-grove-ink-dk/85">{style.label}</span>
    </span>
  )
}

function LegendEdge({ type }: { type: string }) {
  const edge = SPECIAL_EDGES[type]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-7" style={{ borderTop: `2px ${edge.lineStyle} ${edge.color}` }} />
      <span className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75">{EDGE_LABELS[type]}</span>
    </span>
  )
}

export function GraphLegend({ className = '', graph }: GraphLegendProps) {
  const theme = useGraphTheme()
  const fill = GRAPH_PALETTE[theme].chip
  const groups = legendFor(graph)

  return (
    <Card variant="bordered" className={className}>
      <CardContent className="py-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="v2-micro mb-1.5 text-grove-ink/55 dark:text-grove-ink-dk/55">{group.title}</div>
              <div className="flex flex-wrap items-center gap-2">
                {group.types.map((type) => (
                  <LegendChip key={type} type={type} fill={fill} />
                ))}
                {group.edges.map((type) => (
                  <LegendEdge key={type} type={type} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
