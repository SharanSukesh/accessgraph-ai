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

  // Persist 'env' from URL to sessionStorage so it survives the
  // home -> /login redirect chain (router.push() doesn't carry query params).
  // The Salesforce package's LWC opens the dashboard with ?env=sandbox when
  // the underlying SF org is a sandbox/scratch; we need that hint preserved
  // so login() can route OAuth through test.salesforce.com.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const env = new URLSearchParams(window.location.search).get('env')
    if (env) {
      window.sessionStorage.setItem('accessgraph_env', env)
    }
  }, [])

  const login = (redirectUrl?: string) => {
    // Redirect to Salesforce OAuth.
    // Read env param from URL or sessionStorage. The Salesforce package's
    // LWC opens the dashboard with ?env=sandbox when the Salesforce org is
    // a sandbox or scratch (so OAuth must use test.salesforce.com).
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.accessgraphai.com'
    let env: string | null = null
    let forceLogin = false
    if (typeof window !== 'undefined') {
      env =
        new URLSearchParams(window.location.search).get('env') ||
        window.sessionStorage.getItem('accessgraph_env')
      // After explicit logout, force the Salesforce login screen (rather
      // than silently re-using the existing SF session). Flag is set in
      // logout() and consumed (cleared) here so it only fires once.
      forceLogin = window.sessionStorage.getItem('accessgraph_force_login') === '1'
      if (forceLogin) {
        window.sessionStorage.removeItem('accessgraph_force_login')
      }
    }
    const params = new URLSearchParams()
    if (env) params.set('env', env)
    if (forceLogin) params.set('prompt', 'login')
    const qs = params.toString()
    const authorizeUrl = qs
      ? `${apiUrl}/auth/salesforce/authorize?${qs}`
      : `${apiUrl}/auth/salesforce/authorize`
    window.location.href = authorizeUrl
  }

  const logout = async () => {
    try {
      // Mark the next OAuth flow to force the Salesforce login screen.
      // Salesforce keeps its own session cookie - clearing our JWT cookie
      // doesn't end that session, so without prompt=login on the next
      // /authorize call, Salesforce silently re-uses it and the user
      // can't switch identities.
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('accessgraph_force_login', '1')
      }
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
