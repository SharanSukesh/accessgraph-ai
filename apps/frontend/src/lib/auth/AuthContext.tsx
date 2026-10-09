'use client'

/**
 * Authentication Context.
 *
 * Every session is a Newton user (consultant / staff) signed in with
 * email + password. Salesforce OAuth is not a login: `connectSalesforce`
 * attaches (or reconnects) a client org and requires an existing session.
 *
 * - `user`       — GET /auth/me, null when signed out
 * - `orgs`       — GET /orgs, the client orgs this user may open
 * - `currentOrg` — the entry in `orgs` matching the /orgs/{id} URL segment
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { orgKeys, useOrgs, type Organization } from '@/lib/api/hooks/useOrgs'
import type { PrivacyMode } from '@/lib/privacy'

export type UserRole = 'org_admin' | 'analyst' | 'viewer' | 'auditor'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  is_admin: boolean
}

export type SalesforceEnv = 'sandbox' | 'production'

export interface ConnectSalesforceOptions {
  forceLogin?: boolean
  /** Privacy level for a newly connected org. Existing orgs keep theirs on reconnect. */
  privacy?: PrivacyMode
  /** Only sent with privacy 'metadata_only'. */
  aggregates?: boolean
}

interface AuthContextType {
  user: AuthUser | null
  orgs: Organization[]
  currentOrg: Organization | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  /** org_admin or analyst. Viewers and auditors are read-only. */
  canWrite: boolean
  loginWithPassword: (email: string, password: string) => Promise<void>
  connectSalesforce: (env?: SalesforceEnv, opts?: ConnectSalesforceOptions) => void
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Set on logout so the next Salesforce connect asks for credentials
// instead of silently reusing the previous person's Salesforce session.
const FORCE_LOGIN_KEY = 'accessgraph_force_login'

const EMPTY_ORGS: Organization[] = []

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isUserLoading, setIsUserLoading] = useState(true)

  const orgsQuery = useOrgs({ enabled: !!user })
  const orgs = user ? orgsQuery.data ?? EMPTY_ORGS : EMPTY_ORGS

  const fetchUser = useCallback(async () => {
    try {
      setUser(await apiClient.get<AuthUser>('/auth/me'))
    } catch {
      setUser(null)
    } finally {
      setIsUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const loginWithPassword = async (email: string, password: string) => {
    // The caller (login page) handles navigation once isAuthenticated flips.
    await apiClient.post('/auth/login-password', { email, password })
    // Drop anything cached under a previous identity.
    queryClient.clear()
    await fetchUser()
  }

  const connectSalesforce = (env?: SalesforceEnv, opts?: ConnectSalesforceOptions) => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || 'https://api.accessgraphai.com'
    let forceLogin = !!opts?.forceLogin
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(FORCE_LOGIN_KEY) === '1') {
      forceLogin = true
      window.sessionStorage.removeItem(FORCE_LOGIN_KEY)
    }
    const params = new URLSearchParams()
    if (env === 'sandbox') params.set('env', 'sandbox')
    if (forceLogin) params.set('prompt', 'login')
    if (opts?.privacy) params.set('privacy', opts.privacy)
    if (opts?.privacy === 'metadata_only') params.set('aggregates', opts.aggregates ? 'true' : 'false')
    const qs = params.toString()
    window.location.href = `${apiUrl}/auth/salesforce/authorize${qs ? `?${qs}` : ''}`
  }

  const logout = async () => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(FORCE_LOGIN_KEY, '1')
      }
      await apiClient.post('/auth/logout')
      setUser(null)
      queryClient.clear()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const refetch = async () => {
    await fetchUser()
    await queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
  }

  const currentOrgId = pathname?.match(/^\/orgs\/([^/]+)/)?.[1] ?? null
  const currentOrg = useMemo(
    () => (currentOrgId ? orgs.find((o) => o.id === currentOrgId) ?? null : null),
    [orgs, currentOrgId],
  )

  const isAdmin = !!user?.is_admin || user?.role === 'org_admin'
  const canWrite = isAdmin || user?.role === 'analyst'

  return (
    <AuthContext.Provider
      value={{
        user,
        orgs,
        currentOrg,
        isLoading: isUserLoading || (!!user && orgsQuery.isPending),
        isAuthenticated: !!user,
        isAdmin,
        canWrite,
        loginWithPassword,
        connectSalesforce,
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
