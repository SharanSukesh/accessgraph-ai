'use client'

/**
 * Topbar — Grove Refined chrome ported from the /v2 prototype.
 *
 * Client-org context on the left; quick search (⌘K), theme toggle and
 * the user menu on the right. The user menu (identity, connected-org
 * info, sign out) moved here from the Sidebar footer — same AuthContext
 * logic, new position. Purely presentational relocation: no auth or
 * routing behavior changed.
 */

import { useEffect, useRef, useState } from 'react'
import { Search, Command, LogOut, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { openCommandPalette } from '@/components/shared/CommandPalette'
import { useAuth } from '@/lib/auth/AuthContext'

export function Topbar() {
  const { user, orgUser, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const identityLabel =
    orgUser?.name || orgUser?.email || user?.org_name || 'Account'
  const identitySublabel =
    orgUser?.email && orgUser?.name ? orgUser.email : user?.org_domain || null
  const avatarLetter = identityLabel.charAt(0).toUpperCase() || 'U'

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-grove-border bg-grove-surface/70 px-5 backdrop-blur-sm dark:border-grove-border-dk dark:bg-grove-surface-dk/70">
      {/* Client-org context */}
      <div className="min-w-0">
        <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">
          Client org
        </p>
        <p className="truncate text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
          {user?.org_name || 'Not connected'}
          {user?.org_domain && (
            <span className="ml-2 text-xs font-normal text-grove-ink/50 dark:text-grove-ink-dk/50">
              {user.org_domain}
            </span>
          )}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Quick search — opens the existing CommandPalette */}
        <button
          onClick={openCommandPalette}
          className="hidden items-center gap-2 rounded-xl border border-grove-border bg-grove-canvas px-3 py-1.5 text-sm text-grove-ink/50 transition-colors duration-200 hover:border-primary-400 hover:text-grove-ink/70 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk/50 dark:hover:text-grove-ink-dk/70 md:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search anything…</span>
          <kbd className="ml-4 flex items-center gap-0.5 rounded border border-grove-border px-1.5 py-0.5 text-[10px] dark:border-grove-border-dk">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        <ThemeToggle variant="compact" />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors duration-200 hover:bg-grove-canvas dark:hover:bg-grove-canvas-dk"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title={identityLabel}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-primary-800 shadow-sm ring-2 ring-grove-canvas dark:ring-grove-surface-dk">
              <span className="text-xs font-semibold text-grove-canvas">
                {avatarLetter}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-grove-ink/45 transition-transform dark:text-grove-ink-dk/45',
                menuOpen && 'rotate-180',
              )}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-grove-border bg-grove-surface shadow-grove-hero dark:border-grove-border-dk dark:bg-grove-surface-dk">
              <div className="border-b border-grove-border px-4 py-3 dark:border-grove-border-dk">
                <p className="truncate text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                  {identityLabel}
                </p>
                {identitySublabel && (
                  <p className="truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                    {identitySublabel}
                  </p>
                )}
              </div>
              {user && (
                <div className="border-b border-grove-border px-4 py-3 dark:border-grove-border-dk">
                  <p className="v2-micro text-grove-ink/50 dark:text-grove-ink-dk/50">
                    Connected to
                  </p>
                  <p
                    className="mt-0.5 truncate text-sm font-medium text-grove-ink dark:text-grove-ink-dk"
                    title={user.org_name}
                  >
                    {user.org_name || 'Unknown Org'}
                  </p>
                  {user.org_domain && (
                    <p
                      className="truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55"
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
                  setMenuOpen(false)
                  await logout()
                }}
                className="flex w-full items-center px-4 py-2.5 text-left text-sm text-grove-ink/85 transition-colors hover:bg-copper-50 hover:text-copper-700 dark:text-grove-ink-dk/85 dark:hover:bg-copper-900/20 dark:hover:text-copper-400"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
