'use client'

/**
 * Entity relationship diagram (roadmap item 12): the objects around a focus
 * object, from the synced field metadata. Columns and rows come from the
 * server (services/erd.py), so the SVG download and the image pack draw the
 * same picture: the objects an object looks up to sit to its left, the
 * objects that look up to it to its right. Lookups are thin, master-detail
 * bold; the bar marks the parent end, a dot a child deleted with its parent.
 * Click an object to see it; "Centre here" refocuses.
 */

import { useEffect, useRef, useState } from 'react'
import cytoscape, { Core } from 'cytoscape'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { GRAPH_PALETTE } from '@/components/graph/graphStyle'
import { useGraphTheme } from '@/components/graph/useGraphTheme'
import { BOX_H, BOX_W, erdPositions, type ErdDiagramData, type ErdNode } from '@/lib/erd'

const COLORS = {
  light: { line: '#898781', focus: '#D8794A', custom: '#199E70', stub: '#c3c2b7' },
  dark: { line: '#8f9a92', focus: '#E8956B', custom: '#3bbf8c', stub: '#4a5a52' },
}

function caption(n: ErdNode): string {
  const base = n.described ? `${n.fields} fields` : 'not synced'
  return n.readers == null ? base : `${base} · ${n.readers.toLocaleString('en-US')} can read`
}

export function ErdDiagram({ data, selected, onSelect, cyRef }: {
  data: ErdDiagramData
  selected: string | null
  onSelect: (name: string | null) => void
  cyRef?: React.MutableRefObject<Core | null>
}) {
  const box = useRef<HTMLDivElement>(null)
  const cy = useRef<Core | null>(null)
  const theme = useGraphTheme()
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)

  useEffect(() => {
    if (!box.current) return
    const p = GRAPH_PALETTE[theme]
    const c = COLORS[theme]
    const pos = erdPositions(data.nodes)
    const instance = cytoscape({
      container: box.current,
      elements: [
        ...data.nodes.map((n) => ({
          data: { id: n.name, label: `${n.name}\n${caption(n)}`, focus: n.focus, custom: n.custom, described: n.described },
          position: pos[n.name],
        })),
        ...data.edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.from, target: e.to, kind: e.kind, cascade: e.cascadeDelete,
                  tip: `${e.from}.${e.field} → ${e.to} (${e.kind === 'master_detail' ? 'master-detail' : 'lookup'}${
                    e.required ? ', required' : ''}${e.cascadeDelete ? ', deleted with the parent' : ''})` },
        })),
      ],
      layout: { name: 'preset' },
      minZoom: 0.2,
      maxZoom: 2.5,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle', width: BOX_W, height: BOX_H, 'background-color': p.chip,
            'border-width': 1.4, 'border-color': c.line, label: 'data(label)', 'text-wrap': 'wrap',
            'text-max-width': `${BOX_W - 20}px`, 'text-valign': 'center', 'text-halign': 'center',
            'font-size': 13, color: p.ink, 'font-family': 'Inter, Helvetica, Arial, sans-serif',
          },
        },
        { selector: 'node[?custom]', style: { 'border-color': c.custom } },
        { selector: 'node[!described]', style: { 'border-color': c.stub, 'border-style': 'dashed' } },
        { selector: 'node[?focus]', style: { 'border-color': c.focus, 'border-width': 3 } },
        // Selected: a thick border in the focus colour, the fill unchanged (labels stay readable).
        { selector: 'node:selected', style: { 'border-color': c.focus, 'border-width': 3, 'background-color': p.chip, 'border-style': 'solid' } },
        {
          selector: 'edge',
          style: {
            width: 1.2, 'line-color': c.line, 'curve-style': 'unbundled-bezier', 'control-point-distances': 0,
            'target-arrow-shape': 'tee', 'target-arrow-color': c.line, 'arrow-scale': 0.9,
          },
        },
        { selector: 'edge[kind = "master_detail"]', style: { width: 3 } },
        { selector: 'edge[?cascade]', style: { 'source-arrow-shape': 'circle', 'source-arrow-color': c.line } },
        { selector: 'edge.hover', style: { 'line-color': c.focus, 'target-arrow-color': c.focus, 'source-arrow-color': c.focus } },
      ],
    })
    instance.on('tap', 'node', (ev) => onSelect(ev.target.id()))
    instance.on('tap', (ev) => { if (ev.target === instance) onSelect(null) })
    instance.on('mouseover', 'edge', (ev) => {
      ev.target.addClass('hover')
      const r = ev.renderedPosition
      setTip({ x: r.x, y: r.y, text: ev.target.data('tip') })
    })
    instance.on('mouseout', 'edge', (ev) => { ev.target.removeClass('hover'); setTip(null) })
    instance.fit(undefined, 30)
    if (selected) instance.getElementById(selected).select()
    cy.current = instance
    if (cyRef) cyRef.current = instance
    return () => { instance.destroy(); cy.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme])

  useEffect(() => {
    const c = cy.current
    if (!c) return
    c.nodes().unselect()
    if (selected) c.getElementById(selected).select()
  }, [selected, data])

  const zoom = (factor: number) => {
    const c = cy.current
    if (!c) return
    c.zoom({ level: c.zoom() * factor, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } })
  }
  const control = 'inline-flex h-8 w-8 items-center justify-center text-grove-ink/70 hover:bg-primary-50 dark:text-grove-ink-dk/70 dark:hover:bg-primary-900/30'
  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-lg bg-[#f6f2e7] dark:bg-[#0c1a14]" data-testid="erd">
      <div ref={box} className="h-full w-full" />
      {tip && (
        <div className="pointer-events-none absolute z-10 rounded bg-grove-ink px-2 py-1 text-xs text-grove-canvas shadow dark:bg-grove-ink-dk dark:text-grove-canvas-dk"
          style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tip.text}
        </div>
      )}
      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border border-grove-border bg-grove-surface dark:border-grove-border-dk dark:bg-grove-surface-dk">
        <button type="button" aria-label="Zoom in" className={control} onClick={() => zoom(1.2)}><Plus className="h-4 w-4" /></button>
        <button type="button" aria-label="Zoom out" className={control} onClick={() => zoom(1 / 1.2)}><Minus className="h-4 w-4" /></button>
        <button type="button" aria-label="Fit" className={control} onClick={() => cy.current?.fit(undefined, 30)}><Maximize2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
