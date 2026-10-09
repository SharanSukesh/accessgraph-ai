'use client'

/**
 * App Providers
 * Wraps the app with necessary context providers
 */

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { useState, type ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { isPrivacyModeError } from '@/lib/api/client'
import { orgKeys } from '@/lib/api/hooks/useOrgs'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  // Create QueryClient instance with default options
  const [queryClient] = useState(() => {
    // A privacy-level 409 means our copy of the org's level is stale
    // (another admin changed it); refetching /orgs lets the page gates
    // and sidebar catch up.
    const onError = (err: unknown) => {
      if (isPrivacyModeError(err)) client.invalidateQueries({ queryKey: orgKeys.lists() })
    }
    const client: QueryClient = new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          // Stale time: How long data is considered fresh
          staleTime: 60 * 1000, // 1 minute
          // Cache time: How long unused data stays in cache
          gcTime: 5 * 60 * 1000, // 5 minutes
          // Retry failed requests, except refusals that will not change
          retry: (failureCount, err) => !isPrivacyModeError(err) && failureCount < 1,
          // Refetch on window focus
          refetchOnWindowFocus: false,
          // Refetch on reconnect
          refetchOnReconnect: true,
        },
        mutations: {
          // Retry failed mutations
          retry: (failureCount, err) => !isPrivacyModeError(err) && failureCount < 1,
        },
      },
    })
    return client
  })

  const showDevtools = process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS === 'true'

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </ThemeProvider>
      {showDevtools && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
