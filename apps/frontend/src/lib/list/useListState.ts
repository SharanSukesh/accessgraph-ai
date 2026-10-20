'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ListDefaults, ListState, nextListState, readListState, writeListState } from './listState'

/** A list's page, size, sort and filters, read from and written to the URL. */
export function useListState(prefix = '', defaults: ListDefaults = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const key = JSON.stringify(defaults)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dflt = useMemo(() => defaults, [key])
  const state = useMemo(() => readListState(new URLSearchParams(params?.toString() || ''), prefix, dflt), [params, prefix, dflt])
  const update = useCallback(
    (change: Partial<ListState>) => {
      const next = nextListState(state, change)
      const qs = writeListState(new URLSearchParams(params?.toString() || ''), next, prefix, dflt).toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [state, params, prefix, dflt, router, pathname],
  )
  return { state, update }
}
