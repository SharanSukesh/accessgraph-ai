'use client'

/**
 * App Layout Component
 * Sidebar + main content. The legacy top navbar (theme toggle + user
 * menu) was folded into the Sidebar footer so the page reclaims the
 * ~70px banner — see Sidebar.tsx for the user menu + theme toggle.
 *
 * v1.9 — wraps the main content in <PageTransition> so route changes
 * replay the fade-in keyframe. Purely a visual layer; no state /
 * routing logic changes.
 */

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PageTransition } from '@/components/shared/PageTransition'
import { CommandPalette } from '@/components/shared/CommandPalette'

// Routes that render without the sidebar chrome. `/activate` is
// reached from the invitation email before the user has a session;
// `/advisor` is the public new-implementation questionnaire (pre-sales
// surface — no account required); `/start` is the post-login mode
// chooser.
const PUBLIC_ROUTES = ['/login', '/signup', '/activate', '/advisor', '/start']

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // /v2 (parallel UI prototype) and /implementation (greenfield
  // workspace) ship their own shells, so the org chrome must stay out
  // of their way entirely.
  const isPublicRoute =
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith('/v2') ||
    pathname.startsWith('/implementation')

  if (isPublicRoute) {
    // Public pages (login, etc.) - no sidebar
    return <>{children}</>
  }

  // Protected pages — sidebar + topbar + main content (Grove Refined).
  // The topbar carries org context / search / theme / user menu; the
  // sidebar keeps nav + Salesforce connection controls.
  return (
    <div className="flex h-screen overflow-hidden bg-grove-canvas/80 dark:bg-grove-canvas-dk/80">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="v2-main flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
      {/* Cmd-K palette listens globally; renders nothing until ⌘K is
          pressed or openCommandPalette() is called. */}
      <CommandPalette />
    </div>
  )
}
