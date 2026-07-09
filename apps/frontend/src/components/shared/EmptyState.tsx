/**
 * Empty State Component
 * Display when no data is available
 */

import { type ReactNode } from 'react'
import { FileQuestion, Search, Database, Users, FileText, Network } from 'lucide-react'
import { Button } from './Button'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: 'search' | 'data' | 'database' | 'users' | 'file-text' | 'network' | 'default'
  action?: {
    label: string
    onClick: () => void
  }
  children?: ReactNode
}

const icons = {
  search: Search,
  data: Database,
  database: Database,
  users: Users,
  'file-text': FileText,
  network: Network,
  default: FileQuestion,
}

export function EmptyState({
  title,
  description,
  icon = 'default',
  action,
  children,
}: EmptyStateProps) {
  const Icon = icons[icon]

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800 p-4 mb-4">
        <Icon className="h-12 w-12 text-primary-700 dark:text-primary-400" />
      </div>
      <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 max-w-md mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </div>
  )
}
