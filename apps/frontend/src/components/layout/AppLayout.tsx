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
import { PageTransition } from '@/components/shared/PageTransition'

const PUBLIC_ROUTES = ['/login', '/signup']

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  if (isPublicRoute) {
    // Public pages (login, etc.) - no sidebar
    return <>{children}</>
  }

  // Protected pages - sidebar + main content. No more top navbar; the
  // page itself supplies its own header.
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50/80 dark:bg-gray-900/80">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  )
}
