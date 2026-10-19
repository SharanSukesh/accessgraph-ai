'use client'

/**
 * The access graph's right-hand picker: what to draw beside the user,
 * their profile and grants. One tab per element type (Objects, Page
 * layouts, Record pages, Apex classes, Flows), each working the same way:
 * search, tick items one by one, or Select all. Selecting more than
 * LARGE_SELECTION at once asks first, since a crowded graph is slow and
 * hard to read.
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Search, X } from 'lucide-react'
import { Card } from '@/components/shared/Card'
import { NODE_TYPE_ICONS } from './graphChips'
import { NODE_TYPE_STYLES, type GraphNodeType } from './graphStyle'
import { type PickTab, LARGE_SELECTION, pickTabs } from './graphPick'

interface GraphLike {
  nodes: { id: string; type: string; label: string; properties: Record<string, any> }[]
}

export function GraphPicker({
  graph,
  selectedObjects,
  onObjectsChange,
  selectedItems,
  onItemsChange,
  itemsNote,
  className = '',
}: {
  graph: GraphLike | null | undefined
  selectedObjects: string[]
  onObjectsChange: (names: string[]) => void
  selectedItems: string[]
  onItemsChange: (ids: string[]) => void
  /** Shown under the pages and automation tabs (what isn't evaluated, or why nothing was read). */
  itemsNote?: string | null
  className?: string
}) {
  const tabs = useMemo(() => pickTabs(graph), [graph])
  const [active, setActive] = useState<PickTab['key']>('object')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<string[] | null>(null)
  const tab = tabs.find((t) => t.key === active) ?? tabs[0]
  const isObjects = tab.key === 'object'
  // Objects are chosen by name, the rest by node id.
  const selected = new Set(isObjects ? selectedObjects : selectedItems)
  const keyOf = (i: PickTab['items'][number]) => (isObjects ? i.name : i.id)
  const chosen = tab.items.filter((i) => selected.has(keyOf(i)))
  const term = query.trim().toLowerCase()
  const shown = term
    ? tab.items.filter((i) => i.name.toLowerCase().includes(term) || (i.detail ?? '').toLowerCase().includes(term))
    : tab.items

  const setTab = (keys: string[]) => {
    if (isObjects) return onObjectsChange(keys)
    const others = selectedItems.filter((id) => !tab.items.some((i) => i.id === id))
    onItemsChange([...others, ...keys])
  }
  const toggle = (key: string) => {
    const current = chosen.map(keyOf)
    setTab(selected.has(key) ? current.filter((k) => k !== key) : [...current, key])
  }
  const selectAll = () => {
    // Select all adds what the search shows (everything when there's no search).
    const keys = [...new Set([...chosen.map(keyOf), ...shown.map(keyOf)])]
    const adding = keys.length - chosen.length
    if (adding > LARGE_SELECTION) setPending(keys)
    else setTab(keys)
  }
  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(keyOf(i)))

  return (
    <Card variant="bordered" className={`flex h-full flex-col overflow-hidden ${className}`}>
      <div className="border-b border-grove-border px-4 pb-0 pt-4 dark:border-grove-border-dk">
        <p className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">Show in the graph</p>
        <div role="tablist" aria-label="Element type" className="-mb-px mt-3 flex flex-wrap gap-x-1">
          {tabs.map((t) => {
            const Icon = NODE_TYPE_ICONS[t.key as GraphNodeType]
            const on = t.key === tab.key
            const count = t.key === 'object' ? selectedObjects.length : t.items.filter((i) => selectedItems.includes(i.id)).length
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => { setActive(t.key); setQuery(''); setPending(null) }}
                className={`inline-flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-xs font-medium ${
                  on
                    ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                    : 'border-transparent text-grove-ink/65 hover:text-grove-ink dark:text-grove-ink-dk/65 dark:hover:text-grove-ink-dk'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden style={t.key === 'object' ? undefined : { color: NODE_TYPE_STYLES[t.key as GraphNodeType].color }} />
                {t.label}
                {count > 0 && <span className="v2-num rounded-full bg-primary-100 px-1.5 text-[10px] text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grove-ink/50 dark:text-grove-ink-dk/50" aria-hidden />
          <input
            type="text"
            aria-label={`Search ${tab.label.toLowerCase()}`}
            placeholder={`Search ${tab.label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-grove-border bg-grove-surface py-2 pl-10 pr-10 text-sm text-grove-ink focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-grove-ink/50 hover:text-grove-ink/70 dark:text-grove-ink-dk/50">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-grove-border pb-2 dark:border-grove-border-dk">
          <button
            type="button"
            onClick={() => (allShownSelected ? setTab(chosen.filter((i) => !shown.includes(i)).map(keyOf)) : selectAll())}
            disabled={shown.length === 0}
            className="text-sm font-medium text-grove-ink/85 hover:text-primary-600 disabled:opacity-50 dark:text-grove-ink-dk/85 dark:hover:text-primary-400"
          >
            {allShownSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="v2-num text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">{chosen.length} / {tab.items.length}</span>
        </div>

        {pending && (
          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              This adds {pending.length - chosen.length} {tab.label.toLowerCase()} to the graph, which can be slow and hard to read.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded bg-amber-700 px-2.5 py-1 font-medium text-white hover:bg-amber-800"
                onClick={() => { setTab(pending); setPending(null) }}>
                Add all {pending.length - chosen.length}
              </button>
              <button type="button" className="rounded border border-amber-400 px-2.5 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {shown.length === 0 ? (
            <li className="py-8 text-center text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
              {query ? `No ${tab.label.toLowerCase()} match` : tab.empty}
            </li>
          ) : (
            shown.map((i) => {
              const on = selected.has(keyOf(i))
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(keyOf(i))}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                      on
                        ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20'
                        : 'border-grove-border bg-primary-50/40 hover:bg-primary-50 dark:border-grove-border-dk dark:bg-primary-900/10 dark:hover:bg-primary-900/20'
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${on ? 'border-primary-500 bg-primary-500' : 'border-grove-border dark:border-grove-border-dk'}`}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-grove-ink dark:text-grove-ink-dk">{i.name}</span>
                      {i.detail && <span className="block truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{i.detail}</span>}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
        {!isObjects && itemsNote && <p className="text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">{itemsNote}</p>}
      </div>
    </Card>
  )
}
