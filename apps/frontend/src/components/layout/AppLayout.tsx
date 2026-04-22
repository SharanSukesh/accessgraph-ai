'use client'

/**
 * App Layout Component
 * Conditionally shows sidebar and navbar based on route
 */

import { usePathname } from 'next/navigation'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'

const PUBLIC_ROUTES = ['/login', '/signup']

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  if (isPublicRoute) {
    // Public pages (login, etc.) - no sidebar/navbar
    return <>{children}</>
  }

  // Protected pages - show sidebar and navbar
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50/80 dark:bg-gray-900/80">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top navbar */}
        <Navbar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
