/**
 * List state kept in the URL (the standing pagination rule): page, page
 * size, sort, direction, search and filters, so the back button and shared
 * links return to the same view. Pure functions; useListState wires them to
 * the router. Several lists on one page use a prefix ("u." for users...).
 */

export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = 25

export interface ListState {
  page: number
  pageSize: PageSize
  sort: string | null
  dir: 'asc' | 'desc'
  q: string
  filters: Record<string, string>
}

export interface ListDefaults {
  sort?: string | null
  dir?: 'asc' | 'desc'
  filters?: string[]
}

const key = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

export function readListState(params: URLSearchParams, prefix = '', defaults: ListDefaults = {}): ListState {
  const page = Math.max(1, parseInt(params.get(key(prefix, 'page')) || '1', 10) || 1)
  const size = parseInt(params.get(key(prefix, 'size')) || '', 10)
  const dir = params.get(key(prefix, 'dir'))
  const filters: Record<string, string> = {}
  for (const f of defaults.filters || []) {
    const v = params.get(key(prefix, f))
    if (v) filters[f] = v
  }
  return {
    page,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE,
    sort: params.get(key(prefix, 'sort')) || defaults.sort || null,
    dir: dir === 'asc' || dir === 'desc' ? dir : defaults.dir || 'asc',
    q: params.get(key(prefix, 'q')) || '',
    filters,
  }
}

/** Apply a change. Anything but a page change returns to page 1. */
export function nextListState(state: ListState, change: Partial<ListState>): ListState {
  const next = { ...state, ...change, filters: { ...state.filters, ...(change.filters || {}) } }
  const onlyPage = Object.keys(change).every((k) => k === 'page')
  if (!onlyPage) next.page = 1
  return next
}

/** Write the state into a copy of params; defaults are left out to keep URLs short. */
export function writeListState(params: URLSearchParams, state: ListState, prefix = '', defaults: ListDefaults = {}): URLSearchParams {
  const out = new URLSearchParams(params.toString())
  const set = (name: string, value: string | null, dflt: string | null = null) => {
    if (value === null || value === '' || value === dflt) out.delete(key(prefix, name))
    else out.set(key(prefix, name), value)
  }
  set('page', String(state.page), '1')
  set('size', String(state.pageSize), String(DEFAULT_PAGE_SIZE))
  set('sort', state.sort, defaults.sort ?? null)
  set('dir', state.dir, defaults.dir || 'asc')
  set('q', state.q)
  for (const f of defaults.filters || []) set(f, state.filters[f] || null)
  return out
}

/** Query parameters for a paged API call (the backend's page_params). */
export function apiParams(state: ListState): Record<string, string> {
  const p: Record<string, string> = { page: String(state.page), page_size: String(state.pageSize), dir: state.dir }
  if (state.sort) p.sort = state.sort
  if (state.q) p.q = state.q
  for (const [k, v] of Object.entries(state.filters)) if (v) p[k] = v
  return p
}

/** The server's page envelope (app/api/pagination.py), plus any extras an endpoint adds (e.g. summary). */
export type Paged<T, Extra = Record<string, any>> = {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
  sort: string | null
  dir: 'asc' | 'desc'
  q: string | null
} & Extra

/** "Showing 26–50 of 403" */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return 'Showing 0 of 0'
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return `Showing ${start.toLocaleString('en-US')}–${end.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`
}
