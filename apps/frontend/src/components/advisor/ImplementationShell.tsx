'use client'

/**
 * ImplementationShell — chrome for the New Implementation workspace.
 *
 * Deliberately slimmer than the org shell: only surfaces that make
 * sense before a Salesforce org exists. No org chart, no anomalies,
 * no sprawl — those need a live org. A "Switch engagement" link takes
 * the user back to the /start fork.
 */

import { type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ListChecks, Layers, Calculator, Cloud, Map,
  Sparkles, ArrowLeftRight,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

const NAV = [
  { name: 'Overview', path: 'overview', icon: LayoutDashboard },
  { name: 'Requirements', path: 'advisor', icon: ListChecks },
  { name: 'Licensing & Tiers', path: 'licensing', icon: Layers },
  { name: 'Pricebook', path: 'pricebook', icon: Calculator },
  { name: 'Clouds & Add-ons', path: 'clouds', icon: Cloud },
  { name: 'Roadmap', path: 'roadmap', icon: Map },
  { name: 'Why Salesforce', path: 'why-salesforce', icon: Sparkles },
]

export function ImplementationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen overflow-hidden bg-grove-canvas/80 dark:bg-grove-canvas-dk/80">
      {/* Sidebar */}
      <aside className="v2-sidebar hidden w-[248px] shrink-0 flex-col lg:flex">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-grove-border/80 px-4 dark:border-[#eee8d3]/10">
          <Logo variant="full" size="sm" className="shrink-0 text-primary-700 dark:text-primary-400" />
          <span className="v2-micro ml-auto rounded-full bg-copper-500/15 px-2 py-0.5 text-copper-600 ring-1 ring-copper-500/25 dark:text-copper-400">
            New impl
          </span>
        </div>
        <nav className="v2-scroll flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="v2-micro px-3 pb-2 text-grove-ink/40 dark:text-[#eee8d3]/40">
            PLANNING
          </p>
          {NAV.map((item) => {
            const href = `/implementation/${item.path}`
            const active = pathname.startsWith(href)
            const Icon = item.icon
            return (
              <Link
                key={item.path}
                href={href}
                className={`v2-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? 'is-active bg-primary-700/[0.07] text-primary-700 dark:bg-[#eee8d3]/[0.08] dark:text-primary-400'
                    : 'text-grove-ink/70 hover:bg-primary-700/[0.05] hover:text-grove-ink dark:text-[#eee8d3]/70 dark:hover:bg-[#eee8d3]/[0.05] dark:hover:text-[#eee8d3]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-grove-border/80 px-3 py-3 dark:border-[#eee8d3]/10">
          <Link
            href="/start"
            className="v2-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-grove-ink/70 hover:bg-primary-700/[0.05] hover:text-grove-ink dark:text-[#eee8d3]/70 dark:hover:bg-[#eee8d3]/[0.05] dark:hover:text-[#eee8d3]"
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            <span className="truncate">Switch engagement</span>
          </Link>
          <p className="v2-micro px-3 pt-2 text-grove-ink/35 dark:text-[#eee8d3]/35">
            Newton · New Implementation
          </p>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-40 flex h-16 shrink-0 items-center gap-4 border-b border-grove-border bg-grove-surface/70 px-5 backdrop-blur-sm dark:border-grove-border-dk dark:bg-grove-surface-dk/70">
          <div>
            <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">Engagement</p>
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              New Salesforce implementation
              <span className="ml-2 text-xs font-normal text-grove-ink/50 dark:text-grove-ink-dk/50">
                planning workspace
              </span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Mobile nav fallback */}
            <Link
              href="/start"
              className="text-sm font-medium text-grove-ink/60 hover:text-primary-700 dark:text-grove-ink-dk/60 dark:hover:text-primary-400 lg:hidden"
            >
              Switch
            </Link>
            <ThemeToggle variant="compact" />
          </div>
        </header>
        <main className="v2-main flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-5 py-8 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
