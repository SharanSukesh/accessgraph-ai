/**
 * What the graph's picker offers (GraphPicker.tsx): one tab per element
 * type, its items read from the graph's nodes.
 */

export interface PickItem {
  /** Node id (objects are picked by name, kept in `name`). */
  id: string
  name: string
  detail?: string | null
}

export interface PickTab {
  key: 'object' | 'layout' | 'lightning_page' | 'apex_class' | 'flow'
  label: string
  empty: string
  items: PickItem[]
}

/** Selecting more than this many at once asks first. */
export const LARGE_SELECTION = 25

const FLOW_TYPES: Record<string, string> = {
  Flow: 'Screen flow',
  AutoLaunchedFlow: 'Autolaunched flow',
}

interface NodeLike {
  id: string
  type: string
  label: string
  properties: Record<string, any>
}

const byName = (a: PickItem, b: PickItem) => a.name.localeCompare(b.name)

export function pickTabs(graph: { nodes: NodeLike[] } | null | undefined): PickTab[] {
  const of = (type: string) => (graph?.nodes ?? []).filter((n) => n.type === type)
  return [
    {
      key: 'object',
      label: 'Objects',
      empty: 'No objects in this graph.',
      items: of('object')
        .map((n) => {
          const fields = (n.properties.fields ?? []).length
          return { id: n.id, name: n.properties.objectName || n.label, detail: fields ? `${fields} field${fields === 1 ? '' : 's'}` : null }
        })
        .sort(byName),
    },
    {
      key: 'layout',
      label: 'Page layouts',
      empty: 'No page layouts read for this user’s profile.',
      items: of('layout')
        .map((n) => {
          const rts: string[] = n.properties.recordTypes ?? []
          return { id: n.id, name: n.label, detail: `${n.properties.object}${rts.length ? ` · ${rts.join(', ')}` : ''}` }
        })
        .sort(byName),
    },
    {
      key: 'lightning_page',
      label: 'Record pages',
      empty: 'No Lightning record pages assigned in this org.',
      items: of('lightning_page').map((n) => ({ id: n.id, name: n.label, detail: n.properties.object })).sort(byName),
    },
    {
      key: 'apex_class',
      label: 'Apex classes',
      empty: 'No Apex class access granted.',
      items: of('apex_class')
        .map((n) => ({ id: n.id, name: n.properties.namespace ? `${n.properties.namespace}.${n.label}` : n.label }))
        .sort(byName),
    },
    {
      key: 'flow',
      label: 'Flows',
      empty: 'No flow access granted.',
      items: of('flow')
        .map((n) => ({
          id: n.id,
          name: n.label,
          detail: n.properties.trigger_type
            ? `${n.properties.trigger_type.startsWith('Record') ? 'Record-triggered' : n.properties.trigger_type} flow`
            : FLOW_TYPES[n.properties.process_type] ?? n.properties.process_type ?? null,
        }))
        .sort(byName),
    },
  ]
}

/** The graph as drawn: base nodes plus the chosen objects and items (for the legend). */
export function visibleGraph<G extends { nodes: NodeLike[]; edges: { source: string; target: string; type: string }[] }>(
  graph: G | null | undefined,
  selectedObjects: string[],
  selectedItems: string[],
): { nodes: NodeLike[]; edges: G['edges'] } | null {
  if (!graph) return null
  const picked = new Set(['layout', 'lightning_page', 'apex_class', 'flow'])
  const objects = new Set(selectedObjects)
  const items = new Set(selectedItems)
  const nodes = graph.nodes.filter((n) =>
    n.type === 'object' ? objects.has(n.properties.objectName || n.label) : picked.has(n.type) ? items.has(n.id) : n.type !== 'field',
  )
  const ids = new Set(nodes.map((n) => n.id))
  return { nodes, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) }
}
