'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { apiParams, ListState, Paged } from './listState'

/** One page of a server-paged list; the previous page stays on screen while the next loads. */
export function usePaged<T, Extra = Record<string, any>>(key: readonly unknown[], endpoint: string, state: ListState, enabled = true,
                            extra: Record<string, string> = {}) {
  const params = { ...apiParams(state), ...extra }
  return useQuery({
    queryKey: [...key, params],
    queryFn: () => apiClient.get<Paged<T, Extra>>(`${endpoint}?${new URLSearchParams(params).toString()}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}
