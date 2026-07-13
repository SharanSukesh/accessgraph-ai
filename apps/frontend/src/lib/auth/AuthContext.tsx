'use client'

/**
 * Authentication Context — email/password + Salesforce OAuth coexistence.
 *
 * Two ways in:
 *   1. Email/password → primary. `loginWithPassword(email, password)`
 *      sets the JWT cookie via /auth/login-password. The identity in
 *      that cookie carries `org_user_id` + `is_admin`, which is what
 *      the admin UI gates on.
 *   2. Salesforce OAuth → now a POST-LOGIN step, not a login.
 *      `connectSalesforce()` fires the OAuth redirect. Users typically
 *      call this AFTER logging in with email/password to attach their
 *      SF org to their account.
 *
 * Two "me" endpoints:
 *   - `/auth/me`        — org info (works for both paths)
 *   - `/auth/me-user`   — OrgUser info (email/password sessions only)
 * We hit them both on mount; me-user's 401 for SF-only sessions is
 * expected and doesn't break the app.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

interface AuthOrg {
  org_id: string
  org_name: string
  org_domain: string | null
  is_demo: boolean
  is_connected: boolean
  instance_url: string | null
}

interface AuthOrgUser {
  id: string
  email: string
  name: string | null
  role: string
  is_admin: boolean
  is_email_verified: boolean
  organization_id: string
}

interface AuthContextType {
  org: AuthOrg | null
  orgUser: AuthOrgUser | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  loginWithPassword: (email: string, password: string) => Promise<void>
  connectSalesforce: (envOverride?: string) => void
  logout: () => Promise<void>
  refetch: () => Promise<void>

  // Deprecated aliases kept so existing call sites (Sidebar user menu,
  // ProtectedRoute etc.) don't break in this PR. `user` still returns
  // the org shape; `login` now points at the SF-connect path since
  // that was its behaviour previously.
  user: AuthOrg | null
  login: (redirectUrl?: string, envOverride?: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [org, setOrg] = useState<AuthOrg | null>(null)
  const [orgUser, setOrgUser] = useState<AuthOrgUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchAll = async () => {
    // Both endpoints run in parallel. Either 401 is a valid outcome
    // (unauthenticated OR authenticated via the other path).
    const [orgRes, userRes] = await Promise.allSettled([
      apiClient.get<AuthOrg>('/auth/me'),
      apiClient.get<AuthOrgUser>('/auth/me-user'),
    ])
    setOrg(orgRes.status === 'fulfilled' ? orgRes.value : null)
    setOrgUser(userRes.status === 'fulfilled' ? userRes.value : null)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  // Preserve ?env=... hint from the SF-package deep-link across the
  // home → /login → /authorize chain (router.push doesn't carry query
  // params). Unchanged from prior behaviour.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const env = new URLSearchParams(window.location.search).get('env')
    if (env) {
      window.sessionStorage.setItem('accessgraph_env', env)
    }
  }, [])

  const loginWithPassword = async (email: string, password: string) => {
    // POST /auth/login-password sets the httpOnly cookie server-side;
    // client-visible state gets refreshed by fetchAll below. The
    // caller (login page) handles navigation on success.
    await apiClient.post('/auth/login-password', { email, password })
    await fetchAll()
  }

  const connectSalesforce = (envOverride?: string) => {
    // The old `login()` behaviour, renamed to be honest about what it
    // does: kick a Salesforce OAuth flow. Now called AFTER email/password
    // login to attach an SF org to the account.
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || 'https://api.accessgraphai.com'
    let env: string | null = envOverride ?? null
    let forceLogin = false
    if (typeof window !== 'undefined') {
      if (!env) {
        env =
          new URLSearchParams(window.location.search).get('env') ||
          window.sessionStorage.getItem('accessgraph_env')
      }
      forceLogin =
        window.sessionStorage.getItem('accessgraph_force_login') === '1'
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
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('accessgraph_force_login', '1')
      }
      await apiClient.post('/auth/logout')
      setOrg(null)
      setOrgUser(null)
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const refetch = async () => {
    await fetchAll()
  }

  // isAuthenticated is true if EITHER identity path has a session —
  // email/password (orgUser) OR SF-OAuth-only (org without orgUser).
  const isAuthenticated = !!org || !!orgUser
  const isAdmin = !!orgUser?.is_admin

  return (
    <AuthContext.Provider
      value={{
        org,
        orgUser,
        isLoading,
        isAuthenticated,
        isAdmin,
        loginWithPassword,
        connectSalesforce,
        logout,
        refetch,
        // Deprecated aliases — kept so existing consumers compile.
        user: org,
        login: connectSalesforce,
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
