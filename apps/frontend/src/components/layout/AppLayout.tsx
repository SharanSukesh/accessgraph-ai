'use client'

/**
 * App Layout Component
 * Sidebar + main content. The legacy top navbar (theme toggle + user
 * menu) was folded into the Sidebar footer so the page reclaims the
 * ~70px banner — see Sidebar.tsx for the user menu + theme toggle.
 */

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'

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
        {children}
      </main>
    </div>
  )
}
