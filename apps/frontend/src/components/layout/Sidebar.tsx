'use client'

/**
 * Sidebar Navigation Component
 * Main navigation for the application
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Database,
  FileText,
  AlertTriangle,
  CheckCircle,
  Network,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

// TODO: Make this dynamic based on selected org
const mockOrgId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID || 'demo-org'

const navigation = [
  {
    name: 'Dashboard',
    href: mockOrgId ? `/orgs/${mockOrgId}/dashboard` : '/',
    icon: LayoutDashboard,
  },
  {
    name: 'Users',
    href: mockOrgId ? `/orgs/${mockOrgId}/users` : '/users',
    icon: Users,
  },
  {
    name: 'Objects',
    href: mockOrgId ? `/orgs/${mockOrgId}/objects` : '/objects',
    icon: Database,
  },
  {
    name: 'Fields',
    href: mockOrgId ? `/orgs/${mockOrgId}/fields` : '/fields',
    icon: FileText,
  },
  {
    name: 'Anomalies',
    href: mockOrgId ? `/orgs/${mockOrgId}/anomalies` : '/anomalies',
    icon: AlertTriangle,
  },
  {
    name: 'Recommendations',
    href: mockOrgId ? `/orgs/${mockOrgId}/recommendations` : '/recommendations',
    icon: CheckCircle,
  },
  {
    name: 'Graph Explorer',
    href: mockOrgId ? `/orgs/${mockOrgId}/graph` : '/graph',
    icon: Network,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0">
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <Network className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                AccessGraph
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">AI Platform</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            v0.1.0 • MVP
          </p>
        </div>
      </div>
    </aside>
  )
}
