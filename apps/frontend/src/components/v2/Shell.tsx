'use client'

/**
 * v2 Shell — sidebar + topbar chrome for the /v2 tree.
 *
 * Design: the sidebar is permanently deep-forest (both themes) with
 * cream text — the "consulting-firm" move that anchors the brand while
 * the content pane flips light/dark. Copper rail marks the active item;
 * nav groups keep the v1 intent-based IA (EXPLORE / ATTENTION /
 * OPTIMIZE / ADMIN).
 */

import { type ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Layers, KeyRound, Network,
  ListChecks, AlertTriangle, Radar,
  Stethoscope, Scale, Wrench, Boxes, DollarSign, ShieldCheck,
  Users2, Shield, UserPlus,
  Search, Menu, X, Command,
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

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 scrollbar-hide">
      {V2_NAV.map((section) => (
        <div key={section.label}>
          <p className="v2-micro px-3 pb-2 text-[#eee8d3]/40">{section.label}</p>
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
                  className={`v2-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    active
                      ? 'is-active bg-[#eee8d3]/[0.08] text-primary-400'
                      : 'text-[#eee8d3]/70 hover:bg-[#eee8d3]/[0.05] hover:text-[#eee8d3]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function V2Shell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  // Public v2 surfaces (login) render bare — no sidebar/topbar chrome.
  if (pathname === '/v2/login') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-grove-canvas dark:bg-grove-canvas-dk">
      {/* Desktop sidebar */}
      <aside className="v2-sidebar hidden w-[248px] shrink-0 flex-col lg:flex">
        <div className="flex items-center gap-2 px-5 pb-2 pt-6 text-[#eee8d3]">
          <Logo variant="full" size="sm" className="text-primary-400" />
          <span className="v2-micro ml-auto rounded-full bg-copper-500/15 px-2 py-0.5 text-copper-400 ring-1 ring-copper-500/25">
            v2
          </span>
        </div>
        <NavLinks />
        <div className="border-t border-[#eee8d3]/10 px-5 py-4">
          <p className="v2-micro text-[#eee8d3]/35">Newton · Access Intelligence</p>
        </div>
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
            <NavLinks onNavigate={() => setMobileOpen(false)} />
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
