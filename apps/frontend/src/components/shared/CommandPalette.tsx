'use client'

/**
 * Cmd-K command palette — fast keyboard-driven navigation.
 *
 * Listens globally for ⌘K (Mac) or Ctrl-K (Windows/Linux) and opens
 * a centered modal with a search input + a filtered list of every
 * navigable page, grouped under its sidebar section ("ANALYZE › Org
 * Analyzer"). ↑↓ to move, Enter to navigate, Esc to close.
 *
 * Source of truth: the same `navigationSections` constant exported by
 * Sidebar.tsx — so adding a page to the sidebar automatically adds it
 * here too. No state, no API, purely presentational.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronRight, Search, X as XIcon } from 'lucide-react'
import { navigationSections } from '@/components/layout/Sidebar'

interface CommandRow {
  name: string
  section: string
  href: string
  icon: typeof navigationSections[number]['items'][number]['icon']
}

interface PaletteContext {
  isOpen: boolean
  open: () => void
  close: () => void
}

// Tiny pub/sub so any component (e.g. the sidebar's ⌘K hint badge)
// can request the palette open without prop-drilling.
const listeners = new Set<() => void>()
export function openCommandPalette() {
  listeners.forEach(fn => fn())
}

export function CommandPalette() {
  const router = useRouter()
  const params = useParams()
  const orgId = (params?.orgId as string) || ''

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const open = useCallback(() => {
    setIsOpen(true)
    setQuery('')
    setActiveIndex(0)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])

  // External openers can subscribe via openCommandPalette().
  useEffect(() => {
    listeners.add(open)
    return () => {
      listeners.delete(open)
    }
  }, [open])

  // Global ⌘K / Ctrl-K hotkey + Esc-to-close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmdK =
        (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (isCmdK) {
        e.preventDefault()
        setIsOpen(prev => !prev)
        setQuery('')
        setActiveIndex(0)
        return
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Autofocus input when opened.
  useEffect(() => {
    if (isOpen) {
      // Defer to next frame so the input exists in the DOM.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(id)
    }
  }, [isOpen])

  // Build the flat row list once per orgId (cheap; nav is small).
  const rows: CommandRow[] = useMemo(() => {
    const out: CommandRow[] = []
    for (const section of navigationSections) {
      for (const item of section.items) {
        out.push({
          name: item.name,
          section: section.label,
          href: `/orgs/${orgId}/${item.path}`,
          icon: item.icon,
        })
      }
    }
    return out
  }, [orgId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r =>
        r.name.toLowerCase().includes(q) || r.section.toLowerCase().includes(q),
    )
  }, [query, rows])

  // Reset highlight when filter changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const selectRow = useCallback(
    (row: CommandRow) => {
      close()
      router.push(row.href)
    },
    [close, router],
  )

  // Keyboard navigation inside the palette: arrows + enter.
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = filtered[activeIndex]
      if (row) selectRow(row)
    }
  }

  // Keep the active row in view when arrow-keying through long lists.
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-row-index="${activeIndex}"]`,
    )
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh] bg-black/40 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-grove-hero bg-grove-surface dark:bg-grove-surface-dk border border-grove-border dark:border-grove-border-dk overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-grove-border dark:border-grove-border-dk">
          <Search className="h-4 w-4 text-grove-ink/45 dark:text-grove-ink-dk/45 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Jump to page…"
            className="flex-1 bg-transparent border-0 outline-none text-sm placeholder-grove-ink/40 dark:placeholder-grove-ink-dk/40 text-grove-ink dark:text-grove-ink-dk"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-grove-border dark:border-grove-border-dk text-[10px] font-mono text-grove-ink/55 dark:text-grove-ink-dk/55">
            Esc
          </kbd>
          <button
            onClick={close}
            className="sm:hidden text-grove-ink/45 dark:text-grove-ink-dk/45 hover:text-grove-ink dark:hover:text-grove-ink-dk"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <ul
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto py-1 scrollbar-themed"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 italic">
              No matches for &ldquo;{query}&rdquo;.
            </li>
          ) : (
            filtered.map((row, i) => {
              const Icon = row.icon
              const isActive = i === activeIndex
              return (
                <li
                  key={row.href}
                  data-row-index={i}
                  role="option"
                  aria-selected={isActive}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm transition-colors duration-150 ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15'
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => selectRow(row)}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-[10px] tracking-wider uppercase text-copper-600 dark:text-copper-400 w-20 flex-shrink-0 font-mono">
                    {row.section}
                  </span>
                  <ChevronRight className="h-3 w-3 text-grove-border dark:text-grove-border-dk flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">{row.name}</span>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center justify-between px-4 py-2 border-t border-grove-border dark:border-grove-border-dk text-[10px] text-grove-ink/55 dark:text-grove-ink-dk/55 select-none">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-grove-border dark:border-grove-border-dk font-mono">
                &uarr;&darr;
              </kbd>
              navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded border border-grove-border dark:border-grove-border-dk font-mono">
                &#9166;
              </kbd>
              go
            </span>
          </div>
          <span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}

// Re-export a typed render guard for the AppLayout. Wrapping a render
// in this ensures the palette only exists inside the auth-gated app.
export function CommandPaletteHost({ children }: { children?: ReactNode }) {
  const params = useParams()
  const orgId = params?.orgId
  // Only mount the palette when there's an org context — otherwise its
  // routes wouldn't resolve. Login pages skip it.
  if (!orgId) return <>{children}</>
  return (
    <>
      <CommandPalette />
      {children}
    </>
  )
}
