'use client'

/**
 * Authentication Context
 * Manages user authentication state and session
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

interface AuthUser {
  org_id: string
  org_name: string
  org_domain: string | null
  is_demo: boolean
  is_connected: boolean
  instance_url: string | null
}

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (redirectUrl?: string) => void
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch current user
  const fetchUser = async () => {
    try {
      const data = await apiClient.get<AuthUser>('/auth/me')
      setUser(data)
    } catch (error) {
      // Not authenticated
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  // Check authentication status on mount
  useEffect(() => {
    fetchUser()
  }, [])

  const login = (redirectUrl?: string) => {
    // Redirect to Salesforce OAuth.
    // Forward the env query param (if present) so sandbox/scratch orgs use
    // test.salesforce.com instead of login.salesforce.com. The Salesforce
    // package's LWC includes ?env=sandbox in the dashboard URL when the
    // Salesforce org is a sandbox or scratch org.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://accessgraph-ai-production.up.railway.app'
    const env = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('env')
      : null
    const authorizeUrl = env
      ? `${apiUrl}/auth/salesforce/authorize?env=${encodeURIComponent(env)}`
      : `${apiUrl}/auth/salesforce/authorize`
    window.location.href = authorizeUrl
  }

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout')
      setUser(null)
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const refetch = async () => {
    await fetchUser()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
