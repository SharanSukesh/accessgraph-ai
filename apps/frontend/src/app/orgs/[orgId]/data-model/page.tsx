'use client'

/**
 * Data model (roadmap item 12): an entity relationship diagram around one
 * object, from the synced field metadata. Focus, depth, system objects and
 * the "who can read" overlay live in the URL. Downloads: PNG of the canvas,
 * SVG drawn by the server (the same picture as the image pack's Data model
 * visual), and the drawn relationships as CSV.
 */

import { useRef } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { Core } from 'cytoscape'
import { Download, Network } from 'lucide-react'
import { GRAPH_PALETTE } from '@/components/graph/graphStyle'
import { currentGraphTheme } from '@/components/graph/useGraphTheme'
import { ErdDiagram } from '@/components/schema/ErdDiagram'
import type { ErdDiagramData } from '@/lib/erd'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { API_BASE_URL, apiClient } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import { arrayToCSV, downloadCSV, exportStamp } from '@/lib/utils/exports'

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-grove-border px-3 py-1.5 text-sm font-medium hover:bg-primary-50/40 dark:border-grove-border-dk dark:hover:bg-primary-900/15'

export default function DataModelPage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const focus = search?.get('focus') || 'Account'
  const depth = Math.min(3, Math.max(1, Number(search?.get('depth')) || 1))
  const hideSystem = search?.get('system') !== 'show'
  const readers = search?.get('readers') === '1'
  const selected = search?.get('selected') || null
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search?.toString() || '')
    for (const [k, v] of Object.entries(patch)) (v == null || v === '' ? next.delete(k) : next.set(k, v))
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const params = { focus, depth: String(depth), hideSystem: String(hideSystem), readers: String(readers) }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['erd', orgId, params],
    queryFn: () => apiClient.get<ErdDiagramData>(`${endpoints.erd(orgId)}?${new URLSearchParams(params)}`),
    placeholderData: (prev) => prev,
  })
  const cy = useRef<Core | null>(null)
  const node = data?.nodes.find((n) => n.name === selected)
  const svgHref = `${API_BASE_URL}${endpoints.erdSvg(orgId)}?${new URLSearchParams({
    focus, depth: String(depth), hideSystem: String(hideSystem), theme: 'light' })}`

  const downloadPng = () => {
    const c = cy.current
    if (!c) return
    const uri = c.png({ full: true, scale: 2, bg: GRAPH_PALETTE[currentGraphTheme()].canvas, output: 'base64uri' })
    const link = document.createElement('a')
    link.href = uri
    link.download = `data-model-${focus}-depth${depth}-${exportStamp()}.png`
    link.click()
  }
  const downloadCsv = () => {
    if (!data) return
    downloadCSV(arrayToCSV(data.edges.map((e) => ({
      'Child object': e.from, Field: e.field, 'Field label': e.label, 'Parent object': e.to,
      Kind: e.kind === 'master_detail' ? 'Master-detail' : 'Lookup', Required: e.required,
      'Relationship name': e.relationshipName, 'Deleted with the parent': e.cascadeDelete,
      'Points to more than one object': e.polymorphic,
    }))), `data-model-${focus}-depth${depth}`)
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[{ label: 'Objects', href: `/orgs/${orgId}/objects` }, { label: 'Data model' }]} />
      <PageHeader icon={Network} title="Data model"
        subtitle="Lookups and master-detail relationships around one object, from the synced field metadata."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={downloadPng} disabled={!data?.nodes.length}><Download className="h-4 w-4" />PNG</button>
            <a className={BUTTON} href={svgHref}><Download className="h-4 w-4" />SVG</a>
            <button type="button" className={BUTTON} onClick={downloadCsv} disabled={!data?.edges.length}><Download className="h-4 w-4" />Relationships CSV</button>
          </div>
        } />
      <Card variant="bordered">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className={MUTED}>Object</span>
              <input list="erd-objects" defaultValue={focus} key={focus} aria-label="Object at the centre"
                onKeyDown={(e) => { if (e.key === 'Enter') set({ focus: (e.target as HTMLInputElement).value.trim(), selected: null }) }}
                onChange={(e) => { if (data?.objects.includes(e.target.value)) set({ focus: e.target.value, selected: null }) }}
                className="w-56 rounded-md bg-grove-surface px-3 py-1.5 font-mono text-xs ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk" />
              <datalist id="erd-objects">{data?.objects.map((o) => <option key={o} value={o} />)}</datalist>
            </label>
            <div role="radiogroup" aria-label="Depth" className="flex items-center gap-1">
              <span className={`mr-1 ${MUTED}`}>Depth</span>
              {[1, 2, 3].map((d) => (
                <button key={d} type="button" role="radio" aria-checked={depth === d} onClick={() => set({ depth: d === 1 ? null : String(d) })}
                  className={`h-7 w-7 rounded text-xs font-medium ${depth === d ? 'bg-primary-700 text-grove-canvas' : 'ring-1 ring-grove-border dark:ring-grove-border-dk'}`}>
                  {d}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-primary-700" checked={hideSystem} onChange={(e) => set({ system: e.target.checked ? null : 'show' })} />
              Hide owner, audit and system lookups
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-primary-700" checked={readers} onChange={(e) => set({ readers: e.target.checked ? '1' : null })} />
              Show who can read each object
            </label>
          </div>
          {error ? (
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <TableSkeleton rows={8} />
          ) : !data.found ? (
            <p className={`text-sm ${MUTED}`}>{focus} isn&apos;t in the synced field metadata. Pick an object from the list.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <ErdDiagram data={data} selected={selected} onSelect={(name) => set({ selected: name })} cyRef={cy} />
              <aside className="space-y-3 text-sm">
                <p className={MUTED}>
                  {data.nodes.length} objects, {data.edges.length} relationships
                  {data.leftOut > 0 && `; ${data.leftOut} more objects within depth ${depth} aren't drawn (the nearest ${data.nodes.length} are)`}.
                </p>
                {data.note && <p className={`text-xs ${MUTED}`}>{data.note}</p>}
                {node ? (
                  <div className="space-y-2 rounded-lg border border-grove-border p-3 dark:border-grove-border-dk">
                    <p className="font-mono text-xs">{node.name}</p>
                    <p className="font-semibold">{node.label}</p>
                    <p className={`text-xs ${MUTED}`}>
                      {node.described ? `${node.fields} fields` : 'Not synced: referenced by a synced object, not described itself.'}
                      {node.readers != null && ` · ${node.readers.toLocaleString('en-US')} active users can read it`}
                    </p>
                    <ul className="space-y-1 text-xs">
                      {data.edges.filter((e) => e.from === node.name || e.to === node.name).map((e) => (
                        <li key={`${e.from}.${e.field}.${e.to}`}>
                          {e.from === node.name ? <>looks up to <b>{e.to}</b> via {e.field}</> : <><b>{e.from}</b>.{e.field} looks up to it</>}
                          {e.kind === 'master_detail' && ' (master-detail)'}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!node.focus && (
                        <button type="button" className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
                          onClick={() => set({ focus: node.name, selected: null })}>Centre here</button>
                      )}
                      {node.described && (
                        <Link className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
                          href={`/orgs/${orgId}/objects/${encodeURIComponent(node.name)}`}>Open object</Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className={`text-xs ${MUTED}`}>Select an object to see its relationships. Hover a line for the field.</p>
                )}
                <div className={`space-y-1 text-xs ${MUTED}`}>
                  <p><span className="mr-2 inline-block h-px w-6 bg-current align-middle" />lookup</p>
                  <p><span className="mr-2 inline-block h-[3px] w-6 bg-current align-middle" />master-detail</p>
                  <p>Bar: the parent end. Dot: deleted with the parent.</p>
                  <p>Orange: the object at the centre. Green: custom objects. Dashed: not synced.</p>
                </div>
              </aside>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
