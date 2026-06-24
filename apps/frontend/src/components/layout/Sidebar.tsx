'use client'

/**
 * Sidebar Navigation Component
 * Main navigation for the application - Collapsible on hover
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Users,
  Database,
  FileText,
  AlertTriangle,
  CheckCircle,
  Network,
  Menu,
  RefreshCw,
  Link2,
  Scale,
  GitBranch,
  Stethoscope,
  LogOut,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { useAuth } from '@/lib/auth/AuthContext'
import { orgKeys, useSyncJobs } from '@/lib/api/hooks/useOrgs'

const navigationItems = [
  { name: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { name: 'Users', path: 'users', icon: Users },
  { name: 'Objects', path: 'objects', icon: Database },
  { name: 'Fields', path: 'fields', icon: FileText },
  { name: 'Anomalies', path: 'anomalies', icon: AlertTriangle },
  { name: 'Recommendations', path: 'recommendations', icon: CheckCircle },
  { name: 'Equity', path: 'equity', icon: Scale },
  { name: 'Graph Explorer', path: 'graph', icon: Network },
  { name: 'Reporting Graph', path: 'reporting-graph', icon: GitBranch },
  { name: 'Org Analyzer', path: 'org-analyzer', icon: Stethoscope },
]

export function Sidebar() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const [isExpanded, setIsExpanded] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Close the user dropdown when clicking outside it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // Collapse the dropdown when the whole sidebar collapses, otherwise it
  // hovers awkwardly disconnected from its trigger.
  useEffect(() => {
    if (!isExpanded) setUserMenuOpen(false)
  }, [isExpanded])

  const avatarLetter = user?.org_name?.charAt(0).toUpperCase() || 'U'
  // Local "in flight" tag covers the brief window between clicking the
  // button and the trigger POST returning. Once the new sync job exists,
  // the polling-driven `isJobRunning` below takes over and keeps the
  // spinner up for the full ~1-2 minute backend sync.
  const [isTriggering, setIsTriggering] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Extract orgId from current path (e.g., /orgs/abc123/dashboard -> abc123)
  const orgIdMatch = pathname.match(/\/orgs\/([^/]+)/)
  const orgId = orgIdMatch ? orgIdMatch[1] : 'demo-org'

  // useSyncJobs polls every 5 seconds while the latest job is in
  // pending/running state (see useOrgs.ts:164). We derive the spinner
  // from that — the moment the latest job hits a terminal state
  // (completed / failed / partial), polling stops and the spinner clears.
  const { data: syncJobs } = useSyncJobs(orgId)
  const latestJobStatus = syncJobs?.[0]?.status
  const isJobRunning = latestJobStatus === 'pending' || latestJobStatus === 'running'
  const isSyncing = isTriggering || isJobRunning

  // Toast on sync completion / failure. We watch for transitions out of
  // the running state (was running, now isn't) and surface a message so
  // the user isn't left wondering whether the spinner stopping means
  // success or silent failure. Mirrors the LWC's polling toast behavior.
  const wasRunningRef = useRef(false)
  useEffect(() => {
    if (wasRunningRef.current && !isJobRunning && latestJobStatus) {
      if (latestJobStatus === 'completed') {
        setSyncMessage('Sync completed.')
        setTimeout(() => setSyncMessage(null), 5000)
      } else if (latestJobStatus === 'failed') {
        setSyncMessage('Sync failed. Reconnect Salesforce if the issue persists.')
        setTimeout(() => setSyncMessage(null), 8000)
      }
    }
    wasRunningRef.current = isJobRunning
  }, [isJobRunning, latestJobStatus])

  // Build navigation with current orgId
  const navigation = navigationItems.map(item => ({
    ...item,
    href: `/orgs/${orgId}/${item.path}`
  }))

  // Handle sync button click. The trigger POST returns instantly because
  // sync runs as a background asyncio task; the actual SF metadata pull
  // takes 1-2 minutes. We hand spinner control to the polling-derived
  // isJobRunning above as soon as the trigger returns — that way the icon
  // animates through the entire backend run, not just the trigger latency.
  const handleSync = async () => {
    setIsTriggering(true)
    setSyncMessage(null)
    try {
      await apiClient.post(`/orgs/${orgId}/sync`)
      setSyncMessage('Sync started successfully!')
      setTimeout(() => setSyncMessage(null), 5000)

      // Refetch sync jobs so isJobRunning picks up the new pending row
      // immediately. The auto-polling in useSyncJobs takes over from here.
      await queryClient.invalidateQueries({ queryKey: orgKeys.syncJobs(orgId) })
      // Other dashboard data depends on sync results — refresh those too.
      await queryClient.invalidateQueries({ queryKey: ['orgs', 'detail', orgId] })
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncMessage('Sync failed. Please try again.')
      setTimeout(() => setSyncMessage(null), 5000)
    } finally {
      // Only release the local "triggering" tag. isSyncing stays true
      // because isJobRunning is now true (just-created job in pending).
      setIsTriggering(false)
    }
  }

  // Handle reconnect to Salesforce
  const handleReconnect = () => {
    // Redirect to backend OAuth authorization endpoint.
    // Forward env=sandbox if present in URL or sessionStorage
    // (so sandbox/scratch orgs go to test.salesforce.com).
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.accessgraphai.com'
    let env: string | null = null
    if (typeof window !== 'undefined') {
      env =
        new URLSearchParams(window.location.search).get('env') ||
        window.sessionStorage.getItem('accessgraph_env')
    }
    const url = env
      ? `${backendUrl}/auth/salesforce/authorize?env=${encodeURIComponent(env)}`
      : `${backendUrl}/auth/salesforce/authorize`
    window.location.href = url
  }

  return (
    <aside
      className={cn(
        "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300 ease-in-out relative z-50",
        isExpanded ? "w-64" : "w-16"
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center group">
            {isExpanded ? (
              <Logo variant="full" size="md" className="transition-all" />
            ) : (
              <div className="flex items-center justify-center w-full">
                <Logo variant="icon" size="sm" className="transition-all" />
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-hide">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group',
                  isExpanded ? 'space-x-3 px-4 py-3' : 'justify-center p-3',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
                title={!isExpanded ? item.name : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}

                {/* Tooltip for collapsed state */}
                {!isExpanded && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Reconnect Button */}
          <div className={cn("p-2", isExpanded ? "" : "flex justify-center")}>
            <button
              onClick={handleReconnect}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group',
                isExpanded ? 'space-x-3 px-4 py-3 w-full' : 'justify-center p-3',
                'text-gray-700 hover:bg-amber-50 hover:text-amber-700 dark:text-gray-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-400'
              )}
              title={!isExpanded ? 'Reconnect to Salesforce' : undefined}
            >
              <Link2 className="h-5 w-5 flex-shrink-0" />
              {isExpanded && <span className="whitespace-nowrap">Reconnect to Salesforce</span>}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Reconnect to Salesforce
                </div>
              )}
            </button>
          </div>

          {/* Sync Button */}
          <div className={cn("p-2 pt-0", isExpanded ? "" : "flex justify-center")}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group',
                isExpanded ? 'space-x-3 px-4 py-3 w-full' : 'justify-center p-3',
                isSyncing
                  ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'
              )}
              title={!isExpanded ? 'Sync from Salesforce' : undefined}
            >
              <RefreshCw className={cn("h-5 w-5 flex-shrink-0", isSyncing && "animate-spin")} />
              {isExpanded && <span className="whitespace-nowrap">Sync from Salesforce</span>}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Sync from Salesforce
                </div>
              )}
            </button>
          </div>

          {/* Sync Message */}
          {isExpanded && syncMessage && (
            <div className="px-4 pb-2">
              <p className="text-xs text-center whitespace-nowrap text-primary-600 dark:text-primary-400">
                {syncMessage}
              </p>
            </div>
          )}

          {/* Theme toggle — adopts the row variant when expanded so it
              reads as a labelled action; compact icon-only when collapsed. */}
          <div className={cn(
            "p-2 pt-0 border-t border-gray-200 dark:border-gray-700 mt-1",
            isExpanded ? "" : "flex justify-center",
          )}>
            {isExpanded ? (
              <ThemeToggle variant="row" />
            ) : (
              <ThemeToggle variant="compact" />
            )}
          </div>

          {/* User menu — avatar, org name, dropdown for sign out. Lives
              just above the version stamp so it sits at the natural
              bottom-left of the app, matching the "expensive product"
              convention used by Linear / Notion / Vercel. */}
          <div
            ref={userMenuRef}
            className={cn(
              "relative p-2 border-t border-gray-200 dark:border-gray-700",
              isExpanded ? "" : "flex justify-center",
            )}
          >
            <button
              type="button"
              onClick={() => isExpanded && setUserMenuOpen(o => !o)}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group w-full',
                isExpanded ? 'space-x-3 px-3 py-2' : 'justify-center p-2',
                'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/60',
              )}
              title={!isExpanded ? (user?.org_name || 'Account') : undefined}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm flex-shrink-0 ring-2 ring-white dark:ring-gray-800">
                <span className="text-white text-xs font-semibold">{avatarLetter}</span>
              </div>
              {isExpanded && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate">
                      {user?.org_name || 'Connected'}
                    </p>
                    {user?.org_domain && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {user.org_domain}
                      </p>
                    )}
                  </div>
                  <ChevronUp
                    className={cn(
                      'h-4 w-4 text-gray-400 transition-transform flex-shrink-0',
                      userMenuOpen ? '' : 'rotate-180',
                    )}
                  />
                </>
              )}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  {user?.org_name || 'Account'}
                </div>
              )}
            </button>

            {/* Dropdown menu (only when expanded — collapsed sidebar
                relies on the hover-expand to reveal it). Opens UPward
                so it doesn't get clipped by the page edge. */}
            {isExpanded && userMenuOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-1 rounded-md shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ring-1 ring-black ring-opacity-5 z-50 overflow-hidden">
                {user && (
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Connected to
                    </p>
                    <p
                      className="text-sm font-medium text-gray-900 dark:text-white truncate"
                      title={user.org_name}
                    >
                      {user.org_name || 'Unknown Org'}
                    </p>
                    {user.org_domain && (
                      <p
                        className="text-xs text-gray-500 dark:text-gray-400 truncate"
                        title={user.org_domain}
                      >
                        {user.org_domain}
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setUserMenuOpen(false)
                    await logout()
                  }}
                  className="w-full text-left flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* Version */}
          {isExpanded && (
            <div className="px-4 py-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center whitespace-nowrap tracking-wider">
                v0.1.0 • MVP
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
