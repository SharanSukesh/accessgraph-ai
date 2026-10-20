'use client'

/** Search box for a server-paged list: waits for typing to pause, then updates the URL (back to page 1). */

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'

export function ListSearch({ value, onChange, placeholder, label }: {
  value: string
  onChange: (q: string) => void
  placeholder: string
  label?: string
}) {
  const [text, setText] = useState(value)
  const debounced = useDebounce(text, 300)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (debounced !== value) onChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  return (
    <label className="relative flex-1 min-w-[12rem]">
      <span className="sr-only">{label || placeholder}</span>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/50 dark:text-grove-ink-dk/50" aria-hidden />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md pl-9 pr-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  )
}
