'use client'

/**
 * ER Object Card
 * Entity-Relationship diagram style card for displaying objects with fields
 */

import { Database } from 'lucide-react'

interface Field {
  name: string
  fullName: string
  canRead: boolean
  canEdit: boolean
}

interface ERObjectCardProps {
  objectName: string
  fields: Field[]
  permissions: {
    canRead: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
  }
  isSelected?: boolean
  onClick?: () => void
}

export function ERObjectCard({
  objectName,
  fields,
  permissions,
  isSelected = false,
  onClick,
}: ERObjectCardProps) {
  // Build object-level permission badges
  const objectPermissions = []
  if (permissions.canRead) objectPermissions.push('Read')
  if (permissions.canCreate) objectPermissions.push('Create')
  if (permissions.canEdit) objectPermissions.push('Edit')
  if (permissions.canDelete) objectPermissions.push('Delete')

  return (
    <div
      onClick={onClick}
      className={`
        bg-white dark:bg-gray-800
        rounded-lg shadow-lg
        border-2 transition-all cursor-pointer
        ${
          isSelected
            ? 'border-primary-500 shadow-primary-500/50'
            : 'border-emerald-400 dark:border-emerald-500 hover:border-emerald-500 dark:hover:border-emerald-400'
        }
      `}
      style={{ minWidth: '280px', maxWidth: '320px' }}
    >
      {/* Header */}
      <div className="bg-emerald-500 dark:bg-emerald-600 text-white px-4 py-3 rounded-t-lg">
        <div className="flex items-center gap-2 mb-1">
          <Database className="h-4 w-4" />
          <h3 className="font-bold text-sm">{objectName}</h3>
        </div>
        {objectPermissions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {objectPermissions.map((perm) => (
              <span
                key={perm}
                className="text-xs px-2 py-0.5 rounded bg-emerald-700 dark:bg-emerald-800 text-white"
              >
                {perm}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="max-h-64 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">
            No accessible fields
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {fields.map((field, index) => {
              const fieldPerms = []
              if (field.canRead) fieldPerms.push('R')
              if (field.canEdit) fieldPerms.push('E')

              return (
                <div
                  key={field.fullName || index}
                  className="px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-900 dark:text-white font-medium truncate flex-1">
                      {field.name}
                    </span>
                    <div className="flex gap-1 flex-shrink-0">
                      {fieldPerms.map((perm) => (
                        <span
                          key={perm}
                          className={`
                            text-xs px-1.5 py-0.5 rounded font-medium
                            ${
                              perm === 'R'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            }
                          `}
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer with field count */}
      {fields.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 rounded-b-lg border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {fields.length} field{fields.length !== 1 ? 's' : ''} accessible
          </p>
        </div>
      )}
    </div>
  )
}
