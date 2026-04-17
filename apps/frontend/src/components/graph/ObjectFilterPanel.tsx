'use client'

/**
 * Object Filter Panel
 * Side panel for selecting which objects to display in the graph
 */

import { useState, useMemo } from 'react'
import { Search, X, Check, Database } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'

interface ObjectInfo {
  id: string
  name: string
  fieldCount: number
}

interface ObjectFilterPanelProps {
  availableObjects: ObjectInfo[]
  selectedObjects: string[]
  onObjectToggle: (objectName: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  className?: string
}

export function ObjectFilterPanel({
  availableObjects,
  selectedObjects,
  onObjectToggle,
  onSelectAll,
  onDeselectAll,
  className = '',
}: ObjectFilterPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')

  // Filter objects based on search
  const filteredObjects = useMemo(() => {
    if (!searchTerm.trim()) return availableObjects
    const term = searchTerm.toLowerCase()
    return availableObjects.filter((obj) =>
      obj.name.toLowerCase().includes(term)
    )
  }, [availableObjects, searchTerm])

  const allSelected = selectedObjects.length === availableObjects.length
  const someSelected = selectedObjects.length > 0 && !allSelected

  return (
    <Card variant="bordered" className={`h-full flex flex-col ${className}`}>
      <CardHeader className="border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Database className="h-5 w-5" />
          Objects & Fields
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Select objects to display in the graph
        </p>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search objects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Select All Controls */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={allSelected ? onDeselectAll : onSelectAll}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                  allSelected
                    ? 'bg-primary-500 border-primary-500'
                    : someSelected
                    ? 'bg-primary-500/50 border-primary-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {(allSelected || someSelected) && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <span>
                {allSelected ? 'Deselect All' : 'Select All'}
              </span>
            </button>
          </div>
          <Badge variant="default" size="sm">
            {selectedObjects.length} / {availableObjects.length}
          </Badge>
        </div>

        {/* Object List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {filteredObjects.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {searchTerm ? 'No objects found' : 'No objects available'}
              </p>
            </div>
          ) : (
            filteredObjects.map((obj) => {
              const isSelected = selectedObjects.includes(obj.name)
              return (
                <button
                  key={obj.id}
                  onClick={() => onObjectToggle(obj.name)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
                      : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      isSelected
                        ? 'bg-primary-500 border-primary-500'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                      {obj.name}
                    </div>
                    {obj.fieldCount > 0 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {obj.fieldCount} field{obj.fieldCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Quick Actions */}
        {selectedObjects.length > 0 && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeselectAll}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Clear Selection
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
