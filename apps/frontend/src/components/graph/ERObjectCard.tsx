'use client'

/**
 * ER Object Card
 * Entity-Relationship diagram style card for displaying objects with fields
 */

import { Database, GripVertical } from 'lucide-react'

interface Field {
  name: string
  fullName: string
  canRead: boolean
  canEdit: boolean
  isSystem?: boolean
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
  hasImplicitFieldAccess?: boolean
  isSelected?: boolean
  onClick?: () => void
  onDragStart?: (e: React.MouseEvent) => void
}

export function ERObjectCard({
  objectName,
  fields,
  permissions,
  hasImplicitFieldAccess = false,
  isSelected = false,
  onClick,
  onDragStart,
}: ERObjectCardProps) {
  // Build object-level permission badges
  const objectPermissions = []
  if (permissions.canRead) objectPermissions.push('Read')
  if (permissions.canCreate) objectPermissions.push('Create')
  if (permissions.canEdit) objectPermissions.push('Edit')
  if (permissions.canDelete) objectPermissions.push('Delete')

  return (
    <div
      className={`
        er-card-content
        bg-grove-surface dark:bg-grove-surface-dk
        rounded-lg shadow-lg
        border-2 transition-all
        ${
          isSelected
            ? 'border-primary-500 shadow-primary-500/50'
            : 'border-emerald-400 dark:border-emerald-500 hover:border-emerald-500 dark:hover:border-emerald-400'
        }
      `}
      style={{ minWidth: '280px', maxWidth: '320px', pointerEvents: 'auto', cursor: 'move' }}
      onMouseDown={onDragStart}
    >
      {/* Header */}
      <div className="bg-emerald-500 dark:bg-emerald-600 text-white px-4 py-3 rounded-t-lg">
        <div className="flex items-center gap-2 mb-1">
          <GripVertical className="h-4 w-4 flex-shrink-0" />
          <Database className="h-4 w-4" />
          <h3
            className="font-bold text-sm flex-1 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation() // Prevent drag from firing
              onClick?.()
            }}
          >
            {objectName}
          </h3>
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
          <div className="px-4 py-3 text-sm">
            {hasImplicitFieldAccess ? (
              <div className="space-y-2">
                <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                  All fields accessible
                </p>
                <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                  No field-level security configured. All fields are implicitly accessible based on object-level Read permission.
                </p>
              </div>
            ) : (
              <p className="text-grove-ink/55 dark:text-grove-ink-dk/55 italic">
                No accessible fields
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {fields.map((field, index) => {
              const fieldPerms = []
              if (field.canRead) fieldPerms.push('R')
              if (field.canEdit) fieldPerms.push('E')

              return (
                <div
                  key={field.fullName || index}
                  className="px-4 py-2 hover:bg-primary-50/40 dark:hover:bg-primary-900/20 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm text-grove-ink dark:text-grove-ink-dk font-medium truncate">
                        {field.name}
                      </span>
                      {field.isSystem && (
                        <span className="text-xs px-1 py-0.5 rounded bg-grove-border/60 dark:bg-grove-border-dk/70 text-grove-ink/65 dark:text-grove-ink-dk/65 flex-shrink-0">
                          System
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {fieldPerms.map((perm) => (
                        <span
                          key={perm}
                          className={`
                            text-xs px-1.5 py-0.5 rounded font-medium
                            ${
                              perm === 'R'
                                ? 'bg-primary-50 dark:bg-primary-900/25 text-primary-700 dark:text-primary-300'
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
        <div className="px-4 py-2 bg-grove-canvas dark:bg-grove-canvas-dk rounded-b-lg border-t border-grove-border dark:border-grove-border-dk">
          <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
            {fields.length} field{fields.length !== 1 ? 's' : ''} accessible
          </p>
        </div>
      )}
    </div>
  )
}
