'use client'

/**
 * v2 Shell — sidebar + topbar chrome for the /v2 tree.
 *
 * Sidebar: permanently deep-forest (both themes), hover-expand
 * collapsible (72px ↔ 264px) like v1, with the Reconnect / Sync
 * controls in the footer. Copper rail marks the active item; nav
 * groups keep the intent-based IA (EXPLORE / ATTENTION / OPTIMIZE /
 * ADMIN).
 *
 * Topbar: client-org context + search pill + theme toggle + avatar
 * (kept per user feedback — org context lives up top, not in the rail).
 *
 * Background: the shell is translucent so the global AnimatedBackground
 * (drifting node-graph canvas from v1) shows through behind cards.
 */

import { type ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Layers, KeyRound, Network,
  ListChecks, AlertTriangle, Radar,
  Stethoscope, Scale, Wrench, Boxes, DollarSign, ShieldCheck,
  Users2, Shield, UserPlus,
  Search, Menu, X, Command, Link2, RefreshCw,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

const ORG_ID = 'demo'

export const V2_NAV = [
  {
    label: 'EXPLORE',
    items: [
      { name: 'Overview', path: 'dashboard', icon: LayoutDashboard },
      { name: 'Users', path: 'users', icon: Users },
      { name: 'Schema', path: 'schema', icon: Layers },
      { name: 'Permission Sets', path: 'permission-sets', icon: KeyRound },
      { name: 'Graph Explorer', path: 'graph', icon: Network },
    ],
  },
  {
    label: 'ATTENTION',
    items: [
      { name: 'Priority Actions', path: 'recommendations', icon: ListChecks },
      { name: 'Anomalies', path: 'anomalies', icon: AlertTriangle },
      { name: 'Change Risk', path: 'change-risk', icon: Radar },
    ],
  },
  {
    label: 'OPTIMIZE',
    items: [
      { name: 'Health Report', path: 'org-analyzer', icon: Stethoscope },
      { name: 'Equity', path: 'equity', icon: Scale },
      { name: 'Restructure Studio', path: 'restructure', icon: Wrench },
      { name: 'Sprawl', path: 'sprawl', icon: Boxes },
      { name: 'License Fit', path: 'license-fit', icon: DollarSign },
      { name: 'Compliance', path: 'compliance', icon: ShieldCheck },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { name: 'Org Chart', path: 'reporting-graph', icon: Users2 },
      { name: 'Admin Users', path: 'admin-users', icon: UserPlus },
      { name: 'Privacy', path: 'privacy', icon: Shield },
    ],
  },
]

function NavLinks({
  expanded,
  onNavigate,
}: {
  expanded: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-hide">
      {V2_NAV.map((section) => (
        <div key={section.label}>
          <p
            className={`v2-micro px-3 pb-2 text-[#eee8d3]/40 transition-opacity duration-150 ${
              expanded ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const href = `/v2/orgs/${ORG_ID}/${item.path}`
              const active = pathname.startsWith(href)
              const Icon = item.icon
              return (
                <Link
                  key={item.path}
                  href={href}
                  onClick={onNavigate}
                  title={expanded ? undefined : item.name}
                  className={`v2-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? 'is-active bg-[#eee8d3]/[0.08] text-primary-400'
                      : 'text-[#eee8d3]/70 hover:bg-[#eee8d3]/[0.05] hover:text-[#eee8d3]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span
                    className={`truncate transition-opacity duration-150 ${
                      expanded ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

/** Sidebar footer — Salesforce connection controls (mock). */
function SidebarFooter({ expanded }: { expanded: boolean }) {
  const [syncing, setSyncing] = useState(false)
  return (
    <div className="space-y-1 border-t border-[#eee8d3]/10 px-3 py-3">
      <button
        title={expanded ? undefined : 'Reconnect to Salesforce'}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#eee8d3]/70 transition-colors duration-150 hover:bg-[#eee8d3]/[0.05] hover:text-[#eee8d3]"
      >
        <Link2 className="h-4 w-4 shrink-0" />
        <span className={`truncate transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          Reconnect to Salesforce
        </span>
      </button>
      <button
        onClick={() => {
          setSyncing(true)
          setTimeout(() => setSyncing(false), 2500)
        }}
        title={expanded ? undefined : 'Sync from Salesforce'}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[#eee8d3]/70 transition-colors duration-150 hover:bg-[#eee8d3]/[0.05] hover:text-[#eee8d3]"
      >
        <RefreshCw className={`h-4 w-4 shrink-0 ${syncing ? 'animate-spin text-primary-400' : ''}`} />
        <span className={`truncate transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          {syncing ? 'Syncing…' : 'Sync from Salesforce'}
        </span>
      </button>
      <p
        className={`v2-micro px-3 pt-2 text-[#eee8d3]/35 transition-opacity duration-150 ${
          expanded ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Newton · Access Intelligence
      </p>
    </div>
  )
}

export function V2Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  // Public v2 surfaces (login) render bare — no sidebar/topbar chrome.
  if (pathname === '/v2/login') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-grove-canvas/80 dark:bg-grove-canvas-dk/80">
      {/* Desktop sidebar — hover-expand 72px ↔ 264px */}
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`v2-sidebar hidden shrink-0 flex-col transition-[width] duration-200 ease-out lg:flex ${
          expanded ? 'w-[264px]' : 'w-[72px]'
        }`}
      >
        <div className="flex h-16 items-center gap-2 overflow-hidden px-4 text-[#eee8d3]">
          <Logo variant={expanded ? 'full' : 'icon'} size="sm" className="shrink-0 text-primary-400" />
          {expanded && (
            <span className="v2-micro ml-auto rounded-full bg-copper-500/15 px-2 py-0.5 text-copper-400 ring-1 ring-copper-500/25">
              v2
            </span>
          )}
        </div>
        <NavLinks expanded={expanded} />
        <SidebarFooter expanded={expanded} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="v2-sidebar absolute left-0 top-0 flex h-full w-[280px] flex-col">
            <div className="flex items-center justify-between px-5 pb-2 pt-6 text-[#eee8d3]">
              <Logo variant="full" size="sm" className="text-primary-400" />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-[#eee8d3]/60 hover:bg-[#eee8d3]/10"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks expanded onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter expanded />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-grove-border bg-grove-surface/70 px-5 backdrop-blur-sm dark:border-grove-border-dk dark:bg-grove-surface-dk/70">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-grove-ink/60 hover:bg-grove-canvas dark:text-grove-ink-dk/60 dark:hover:bg-grove-canvas-dk lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">Client org</p>
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              Meridian Industries
              <span className="ml-2 text-xs font-normal text-grove-ink/50 dark:text-grove-ink-dk/50">
                NA224 · Enterprise
              </span>
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Search pill (visual mock) */}
            <button className="hidden items-center gap-2 rounded-xl border border-grove-border bg-grove-canvas px-3 py-1.5 text-sm text-grove-ink/50 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk/50 md:flex">
              <Search className="h-3.5 w-3.5" />
              <span>Search anything…</span>
              <kbd className="ml-4 flex items-center gap-0.5 rounded border border-grove-border px-1.5 py-0.5 text-[10px] dark:border-grove-border-dk">
                <Command className="h-2.5 w-2.5" />K
              </kbd>
            </button>
            <ThemeToggle variant="compact" />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
              SS
            </div>
          </div>
        </header>

        {/* Scrollable main */}
        <main className="v2-main flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
