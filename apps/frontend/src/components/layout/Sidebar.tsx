'use client'

/**
 * Sidebar Navigation Component
 * Main navigation for the application - Collapsible on hover
 */

import { Fragment, useEffect, useRef, useState } from 'react'
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
  Radar,
  Package,
  Wrench,
  FileBarChart,
  LogOut,
  ChevronUp,
  Command,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { openCommandPalette } from '@/components/shared/CommandPalette'
import { useAuth } from '@/lib/auth/AuthContext'
import { orgKeys, useSyncJobs } from '@/lib/api/hooks/useOrgs'

// Sidebar nav grouped into three semantic sections. Labels render only
// in the expanded state; collapsed mode shows a hairline divider between
// groups. Route paths and click behaviour are unchanged from the v1.8
// flat list — this is purely a visual grouping.
export const navigationSections: {
  label: string
  items: { name: string; path: string; icon: typeof LayoutDashboard }[]
}[] = [
  {
    label: 'EXPLORE',
    items: [
      { name: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
      { name: 'Users', path: 'users', icon: Users },
      { name: 'Objects', path: 'objects', icon: Database },
      { name: 'Fields', path: 'fields', icon: FileText },
    ],
  },
  {
    label: 'ANALYZE',
    items: [
      { name: 'Anomalies', path: 'anomalies', icon: AlertTriangle },
      { name: 'Recommendations', path: 'recommendations', icon: CheckCircle },
      { name: 'Equity', path: 'equity', icon: Scale },
      { name: 'Change Risk', path: 'change-risk', icon: Radar },
      { name: 'Package Sprawl', path: 'package-sprawl', icon: Package },
      { name: 'Report Sprawl', path: 'report-sprawl', icon: FileBarChart },
      { name: 'Restructure Studio', path: 'restructure', icon: Wrench },
      { name: 'Org Analyzer', path: 'org-analyzer', icon: Stethoscope },
    ],
  },
  {
    label: 'VISUALIZE',
    items: [
      { name: 'Graph Explorer', path: 'graph', icon: Network },
      { name: 'Reporting Graph', path: 'reporting-graph', icon: GitBranch },
    ],
  },
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

  // Build navigation with current orgId, preserving the section grouping.
  const navigation = navigationSections.map(section => ({
    label: section.label,
    items: section.items.map(item => ({
      ...item,
      href: `/orgs/${orgId}/${item.path}`,
    })),
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
        // Grove — sidebar sits on the cream surface with a warm hairline
        // border. The evergreen ink and copper hint on active nav do the
        // colour work; the ground stays quiet.
        "bg-grove-surface dark:bg-grove-surface-dk border-r border-grove-border dark:border-grove-border-dk flex-shrink-0 transition-all duration-300 ease-in-out relative z-50",
        isExpanded ? "w-64" : "w-16"
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-4 border-b border-grove-border dark:border-grove-border-dk">
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

        {/* Navigation — grouped into semantic sections. Labels appear
            only when expanded; collapsed mode shows a hairline divider
            between groups so the visual rhythm survives. */}
        {/* Nav scrollbar — Grove-themed thin scrollbar that only paints
            on hover (see .scrollbar-themed in globals.css). At rest the
            scrollbar is fully transparent, so nav icons align with the
            footer buttons at X=32 (sidebar midline). No scrollbar-gutter
            here — reserving gutter would shift the nav content column
            4px right of the footer column and break icon alignment. */}
        <nav className="flex-1 p-2 overflow-y-auto overflow-x-hidden scrollbar-themed">
          {navigation.map((section, sectionIdx) => (
            // Fragment wrapper so the inter-section divider is a sibling
            // of the section, not a child that would shrink the section's
            // content column via mx-3 and push its buttons off the
            // sidebar midline.
            <Fragment key={section.label}>
              {sectionIdx > 0 && !isExpanded && (
                // Grove hairline divider — its own mx-3 insets the line
                // without affecting the width of the section that follows.
                <div className="my-2 mx-3 h-px bg-grove-border/70 dark:bg-grove-border-dk/70" />
              )}
              <div
              className={cn(
                'space-y-1',
                sectionIdx > 0 && isExpanded && 'mt-4',
              )}
            >
              {isExpanded && (
                // Grove — section labels use Grove ink at low emphasis, a
                // tighter uppercase mono treatment so they read as system
                // labels, not headings.
                <div className="text-[10px] font-semibold tracking-[0.14em] text-grove-ink/50 dark:text-grove-ink-dk/45 uppercase px-4 pt-1 pb-1.5 select-none font-mono">
                  {section.label}
                </div>
              )}
              {section.items.map((item, itemIdx) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    // Grove — evergreen rail on the left edge grows in on
                    // hover / active via .grove-rail. Layered under the
                    // background pill so the two accents don't fight.
                    className={cn(
                      // Grove — evergreen rail cue on the left edge (active +
                      // hover). The rail is absolutely positioned so it never
                      // affects icon centering; the button stays 44×44 in
                      // collapsed mode so every icon sits at the same X.
                      'grove-rail flex items-center rounded-lg text-sm font-medium transition-all duration-200 ease-out relative group',
                      isExpanded
                        ? 'space-x-3 px-4 py-2.5'
                        : 'justify-center w-10 h-10 mx-auto',
                      isActive
                        ? // Active: soft evergreen wash + evergreen ink + copper
                          // rail cue (rail uses currentColor from text-primary-700).
                          'is-active bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300 shadow-sm'
                        : // Idle: warm ink; hover picks up a subtle cream
                          // wash + evergreen ink so the theme identity flows.
                          'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300'
                    )}
                    // Grove — mount slide-in staggered by index. Purely
                    // visual; no dependency on data or state so it's safe.
                    style={{
                      animation: `grove-slide-in 280ms ease-out ${itemIdx * 30 + sectionIdx * 60}ms both`,
                    }}
                    title={!isExpanded ? item.name : undefined}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5 flex-shrink-0 transition-transform duration-200 ease-out',
                        // Icon gets a tiny scale + copper tint on hover /
                        // active — Grove's signature warm-accent moment.
                        isActive
                          ? 'scale-105'
                          : 'group-hover:scale-105 group-hover:text-copper-500 dark:group-hover:text-copper-400',
                      )}
                    />
                    {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}

                    {/* Tooltip for collapsed state — Grove ink ground with
                        cream text; section label in the copper accent so it
                        reads as a system tag, not a heading. */}
                    {!isExpanded && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-grove-ink dark:bg-grove-surface-dk text-grove-canvas dark:text-grove-ink-dk text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-grove-lift">
                        <span className="text-[9px] tracking-wider text-copper-300 dark:text-copper-400 mr-1.5 font-mono">{section.label}</span>
                        {item.name}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
            </Fragment>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-grove-border dark:border-grove-border-dk">
          {/* Reconnect Button */}
          <div className={cn("p-2", isExpanded ? "" : "flex justify-center")}>
            <button
              onClick={handleReconnect}
              className={cn(
                // Grove — reconnect keeps its warning-adjacent copper tint
                // (copper is Grove's warm accent, so hover reads as attention
                // without shouting). grove-rail adds the evergreen left cue
                // that matches the nav-item language above.
                'grove-rail flex items-center rounded-lg text-sm font-medium transition-all duration-200 ease-out relative group',
                isExpanded ? 'space-x-3 px-4 py-3 w-full' : 'justify-center w-10 h-10',
                'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-copper-50 hover:text-copper-700 dark:hover:bg-copper-900/20 dark:hover:text-copper-400'
              )}
              title={!isExpanded ? 'Reconnect to Salesforce' : undefined}
            >
              <Link2 className="h-5 w-5 flex-shrink-0 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:text-copper-500 dark:group-hover:text-copper-400" />
              {isExpanded && <span className="whitespace-nowrap">Reconnect to Salesforce</span>}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-grove-ink dark:bg-grove-surface-dk text-grove-canvas dark:text-grove-ink-dk text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-grove-lift">
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
                // Grove — sync uses the evergreen brand hover, matching
                // the active-nav language elsewhere. grove-rail cue on the
                // left edge matches the nav-item language.
                'grove-rail flex items-center rounded-lg text-sm font-medium transition-all duration-200 ease-out relative group',
                isExpanded ? 'space-x-3 px-4 py-3 w-full' : 'justify-center w-10 h-10',
                isSyncing
                  ? 'bg-grove-border/40 text-grove-ink/40 dark:bg-grove-surface-dk dark:text-grove-ink-dk/40 cursor-not-allowed'
                  : 'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/25 dark:hover:text-primary-300'
              )}
              title={!isExpanded ? 'Sync from Salesforce' : undefined}
            >
              <RefreshCw className={cn(
                "h-5 w-5 flex-shrink-0 transition-transform duration-200 ease-out",
                isSyncing && "animate-spin",
                // Warm-accent hover only when not actively syncing so the
                // spin animation stays evergreen (matches brand).
                !isSyncing && "group-hover:scale-105 group-hover:text-copper-500 dark:group-hover:text-copper-400",
              )} />
              {isExpanded && <span className="whitespace-nowrap">Sync from Salesforce</span>}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-grove-ink dark:bg-grove-surface-dk text-grove-canvas dark:text-grove-ink-dk text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-grove-lift">
                  Sync from Salesforce
                </div>
              )}
            </button>
          </div>

          {/* Sync Message */}
          {isExpanded && syncMessage && (
            <div className="px-4 pb-2">
              <p className="text-xs text-center whitespace-nowrap text-primary-700 dark:text-primary-400">
                {syncMessage}
              </p>
            </div>
          )}

          {/* Quick-search ⌘K — Grove-tinted hover, cream kbd with warm ink */}
          <div className={cn(
            "p-2 pt-0 border-t border-grove-border dark:border-grove-border-dk mt-1",
            isExpanded ? "" : "flex justify-center",
          )}>
            {isExpanded ? (
              <button
                onClick={openCommandPalette}
                className="grove-rail group flex items-center w-full rounded-lg text-sm font-medium transition-all duration-200 ease-out px-4 py-3 space-x-3 text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300 relative"
                aria-label="Open command palette"
              >
                <Command className="h-5 w-5 flex-shrink-0 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:text-copper-500 dark:group-hover:text-copper-400" />
                <span className="flex-1 text-left whitespace-nowrap">Quick search</span>
                <kbd className="text-[10px] font-mono text-grove-ink/60 dark:text-grove-ink-dk/60 border border-grove-border dark:border-grove-border-dk bg-grove-canvas/60 dark:bg-grove-canvas-dk/40 rounded px-1.5 py-0.5">
                  ⌘K
                </kbd>
              </button>
            ) : (
              <button
                onClick={openCommandPalette}
                className="grove-rail flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 ease-out text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300 relative group"
                aria-label="Open command palette"
                title="Quick search (⌘K)"
              >
                <Command className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-105 group-hover:text-copper-500 dark:group-hover:text-copper-400" />
                <div className="absolute left-full ml-2 px-2 py-1 bg-grove-ink dark:bg-grove-surface-dk text-grove-canvas dark:text-grove-ink-dk text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-grove-lift">
                  Quick search ⌘K
                </div>
              </button>
            )}
          </div>

          {/* Theme toggle — adopts the row variant when expanded so it
              reads as a labelled action; compact icon-only when collapsed. */}
          <div className={cn(
            "p-2 pt-0",
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
              "relative p-2 border-t border-grove-border dark:border-grove-border-dk",
              isExpanded ? "" : "flex justify-center",
            )}
          >
            <button
              type="button"
              onClick={() => isExpanded && setUserMenuOpen(o => !o)}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-200 ease-out relative group',
                isExpanded
                  ? 'space-x-3 px-3 py-2 w-full'
                  // Fixed 44×44 tile — matches every other footer button.
                  : 'justify-center w-10 h-10',
                'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15',
              )}
              title={!isExpanded ? (user?.org_name || 'Account') : undefined}
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              {/* Grove — avatar tile: evergreen ramp with a copper hint on
                  hover. Ring in cream keeps it lifted off the surface.
                  Collapsed mode uses a smaller avatar so the tile sits at
                  the same 44×44 as the other footer icons. */}
              <div className={cn(
                "rounded-full bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-sm flex-shrink-0 ring-2 ring-grove-canvas dark:ring-grove-surface-dk transition-shadow group-hover:shadow-grove-lift",
                isExpanded ? "w-8 h-8" : "w-7 h-7",
              )}>
                <span className="text-grove-canvas text-xs font-semibold">{avatarLetter}</span>
              </div>
              {isExpanded && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate text-grove-ink dark:text-grove-ink-dk">
                      {user?.org_name || 'Connected'}
                    </p>
                    {user?.org_domain && (
                      <p className="text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55 truncate">
                        {user.org_domain}
                      </p>
                    )}
                  </div>
                  <ChevronUp
                    className={cn(
                      'h-4 w-4 text-grove-ink/45 dark:text-grove-ink-dk/45 transition-transform flex-shrink-0',
                      userMenuOpen ? '' : 'rotate-180',
                    )}
                  />
                </>
              )}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-grove-ink dark:bg-grove-surface-dk text-grove-canvas dark:text-grove-ink-dk text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-grove-lift">
                  {user?.org_name || 'Account'}
                </div>
              )}
            </button>

            {/* Dropdown menu (only when expanded — collapsed sidebar
                relies on the hover-expand to reveal it). Opens UPward
                so it doesn't get clipped by the page edge. */}
            {isExpanded && userMenuOpen && (
              <div className="absolute bottom-full left-2 right-2 mb-1 rounded-md shadow-grove-lift bg-grove-surface dark:bg-grove-surface-dk border border-grove-border dark:border-grove-border-dk z-50 overflow-hidden">
                {user && (
                  <div className="px-4 py-3 border-b border-grove-border dark:border-grove-border-dk">
                    <p className="text-[10px] text-grove-ink/50 dark:text-grove-ink-dk/50 uppercase tracking-[0.14em] font-mono">
                      Connected to
                    </p>
                    <p
                      className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk truncate mt-0.5"
                      title={user.org_name}
                    >
                      {user.org_name || 'Unknown Org'}
                    </p>
                    {user.org_domain && (
                      <p
                        className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 truncate"
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
                  className="w-full text-left flex items-center px-4 py-2.5 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-copper-50 dark:hover:bg-copper-900/20 hover:text-copper-700 dark:hover:text-copper-400 transition-colors"
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
              <p className="text-[10px] text-grove-ink/40 dark:text-grove-ink-dk/40 text-center whitespace-nowrap tracking-[0.14em] font-mono uppercase">
                v0.1.0 · MVP
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
