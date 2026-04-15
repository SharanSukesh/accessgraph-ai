'use client'

/**
 * Graph Controls Component
 * Controls for graph manipulation (zoom, layout, export)
 */

import { useState } from 'react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent } from '@/components/shared/Card'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Download,
  Grid,
  Circle,
  Network,
  GitBranch,
  Search,
  Filter,
} from 'lucide-react'
import { NODE_TYPES, EDGE_TYPES } from '@/lib/constants'

interface GraphControlsProps {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onFit?: () => void
  onReset?: () => void
  onLayoutChange?: (layout: 'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst') => void
  onExport?: (format: 'png' | 'json') => void
  onFilterChange?: (filters: GraphFilters) => void
  className?: string
  compact?: boolean
}

interface GraphFilters {
  nodeTypes?: string[]
  edgeTypes?: string[]
  searchTerm?: string
}

export function GraphControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onLayoutChange,
  onExport,
  onFilterChange,
  className = '',
  compact = false,
}: GraphControlsProps) {
  const [currentLayout, setCurrentLayout] = useState<'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst'>('cose-bilkent')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<GraphFilters>({
    nodeTypes: [],
    edgeTypes: [],
    searchTerm: '',
  })

  const handleLayoutChange = (layout: typeof currentLayout) => {
    setCurrentLayout(layout)
    onLayoutChange?.(layout)
  }

  const handleFilterChange = (newFilters: Partial<GraphFilters>) => {
    const updated = { ...filters, ...newFilters }
    setFilters(updated)
    onFilterChange?.(updated)
  }

  const clearFilters = () => {
    const empty = { nodeTypes: [], edgeTypes: [], searchTerm: '' }
    setFilters(empty)
    onFilterChange?.(empty)
  }

  const hasActiveFilters =
    filters.nodeTypes!.length > 0 ||
    filters.edgeTypes!.length > 0 ||
    filters.searchTerm!.length > 0

  if (compact) {
    return (
      <Card variant="bordered" className={className}>
        <CardContent className="py-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={onZoomIn} title="Zoom In">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onZoomOut} title="Zoom Out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onFit} title="Fit to View">
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onReset} title="Reset">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            {/* Export */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onExport?.('png')}
              title="Export as PNG"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="bordered" className={className}>
      <CardContent className="py-4 space-y-4">
        {/* Zoom and View Controls */}
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            View Controls
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={onZoomIn}>
              <ZoomIn className="h-4 w-4 mr-2" />
              Zoom In
            </Button>
            <Button size="sm" variant="secondary" onClick={onZoomOut}>
              <ZoomOut className="h-4 w-4 mr-2" />
              Zoom Out
            </Button>
            <Button size="sm" variant="secondary" onClick={onFit}>
              <Maximize2 className="h-4 w-4 mr-2" />
              Fit to View
            </Button>
            <Button size="sm" variant="secondary" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        {/* Layout Options */}
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Layout Algorithm
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={currentLayout === 'cose-bilkent' ? 'primary' : 'secondary'}
              onClick={() => handleLayoutChange('cose-bilkent')}
            >
              <Network className="h-4 w-4 mr-2" />
              Force
            </Button>
            <Button
              size="sm"
              variant={currentLayout === 'circle' ? 'primary' : 'secondary'}
              onClick={() => handleLayoutChange('circle')}
            >
              <Circle className="h-4 w-4 mr-2" />
              Circle
            </Button>
            <Button
              size="sm"
              variant={currentLayout === 'grid' ? 'primary' : 'secondary'}
              onClick={() => handleLayoutChange('grid')}
            >
              <Grid className="h-4 w-4 mr-2" />
              Grid
            </Button>
            <Button
              size="sm"
              variant={currentLayout === 'breadthfirst' ? 'primary' : 'secondary'}
              onClick={() => handleLayoutChange('breadthfirst')}
            >
              <GitBranch className="h-4 w-4 mr-2" />
              Hierarchy
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs rounded-full">
                  Active
                </span>
              )}
            </span>
          </button>

          {showFilters && (
            <div className="space-y-3 mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {/* Search */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search Nodes
                </label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={filters.searchTerm}
                    onChange={(e) => handleFilterChange({ searchTerm: e.target.value })}
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Node Type Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Node Types
                </label>
                <div className="space-y-1">
                  {Object.values(NODE_TYPES).map((type) => (
                    <label key={type.value} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={filters.nodeTypes?.includes(type.value)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(filters.nodeTypes || []), type.value]
                            : (filters.nodeTypes || []).filter((t) => t !== type.value)
                          handleFilterChange({ nodeTypes: updated })
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Edge Type Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Relationship Types
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Object.values(EDGE_TYPES).map((type) => (
                    <label key={type.value} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={filters.edgeTypes?.includes(type.value)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(filters.edgeTypes || []), type.value]
                            : (filters.edgeTypes || []).filter((t) => t !== type.value)
                          handleFilterChange({ edgeTypes: updated })
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-gray-700 dark:text-gray-300">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearFilters}
                  className="w-full"
                >
                  Clear All Filters
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Export Options */}
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Export
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onExport?.('png')}
            >
              <Download className="h-4 w-4 mr-2" />
              PNG
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onExport?.('json')}
            >
              <Download className="h-4 w-4 mr-2" />
              JSON
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export type { GraphFilters }
