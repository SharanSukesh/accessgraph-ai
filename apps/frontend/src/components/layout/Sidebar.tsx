'use client'

/**
 * Sidebar Navigation Component
 * Main navigation for the application - Collapsible on hover
 */

import { useState } from 'react'
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
  Menu,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'

const navigationItems = [
  { name: 'Dashboard', path: 'dashboard', icon: LayoutDashboard },
  { name: 'Users', path: 'users', icon: Users },
  { name: 'Objects', path: 'objects', icon: Database },
  { name: 'Fields', path: 'fields', icon: FileText },
  { name: 'Anomalies', path: 'anomalies', icon: AlertTriangle },
  { name: 'Recommendations', path: 'recommendations', icon: CheckCircle },
  { name: 'Graph Explorer', path: 'graph', icon: Network },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Extract orgId from current path (e.g., /orgs/abc123/dashboard -> abc123)
  const orgIdMatch = pathname.match(/\/orgs\/([^/]+)/)
  const orgId = orgIdMatch ? orgIdMatch[1] : 'demo-org'

  // Build navigation with current orgId
  const navigation = navigationItems.map(item => ({
    ...item,
    href: `/orgs/${orgId}/${item.path}`
  }))

  // Handle sync button click
  const handleSync = async () => {
    setIsSyncing(true)
    setSyncMessage(null)
    try {
      await apiClient.post(`/orgs/${orgId}/sync`)
      setSyncMessage('Sync started successfully!')
      setTimeout(() => setSyncMessage(null), 3000)
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncMessage('Sync failed. Please try again.')
      setTimeout(() => setSyncMessage(null), 3000)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <aside
      className={cn(
        "bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 transition-all duration-300 ease-in-out relative z-50",
        isExpanded ? "w-64" : "w-16"
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex flex-col h-full">
        {/* Logo / Hamburger */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className={cn(
              "bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-all flex-shrink-0",
              isExpanded ? "w-10 h-10" : "w-8 h-8"
            )}>
              {isExpanded ? (
                <Network className="h-6 w-6 text-white" />
              ) : (
                <Menu className="h-5 w-5 text-white" />
              )}
            </div>
            {isExpanded && (
              <div className="overflow-hidden">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">
                  AccessGraph
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">AI Platform</p>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group',
                  isExpanded ? 'space-x-3 px-4 py-3' : 'justify-center p-3',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
                title={!isExpanded ? item.name : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {isExpanded && <span className="whitespace-nowrap">{item.name}</span>}

                {/* Tooltip for collapsed state */}
                {!isExpanded && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* Sync Button */}
          <div className={cn("p-2", isExpanded ? "" : "flex justify-center")}>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all duration-150 relative group',
                isExpanded ? 'space-x-3 px-4 py-3 w-full' : 'justify-center p-3',
                isSyncing
                  ? 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-primary-50 hover:text-primary-700 dark:text-gray-300 dark:hover:bg-primary-900/20 dark:hover:text-primary-400'
              )}
              title={!isExpanded ? 'Sync from Salesforce' : undefined}
            >
              <RefreshCw className={cn("h-5 w-5 flex-shrink-0", isSyncing && "animate-spin")} />
              {isExpanded && <span className="whitespace-nowrap">Sync from Salesforce</span>}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  Sync from Salesforce
                </div>
              )}
            </button>
          </div>

          {/* Sync Message */}
          {isExpanded && syncMessage && (
            <div className="px-4 pb-2">
              <p className="text-xs text-center whitespace-nowrap text-primary-600 dark:text-primary-400">
                {syncMessage}
              </p>
            </div>
          )}

          {/* Version */}
          {isExpanded && (
            <div className="px-4 pb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center whitespace-nowrap">
                v0.1.0 • MVP
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
