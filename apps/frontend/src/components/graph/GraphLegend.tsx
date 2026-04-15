'use client'

/**
 * Graph Legend Component
 * Shows node types, edge types, and their meanings
 */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { NODE_TYPES, EDGE_TYPES } from '@/lib/constants'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

interface LegendItem {
  label: string
  color: string
  shape?: string
  description?: string
}

const nodeLegend: LegendItem[] = [
  {
    label: NODE_TYPES.USER.label,
    color: 'bg-blue-500',
    shape: 'ellipse',
    description: 'Salesforce users',
  },
  {
    label: NODE_TYPES.PROFILE.label,
    color: 'bg-violet-500',
    shape: 'rounded-rectangle',
    description: 'User profiles defining base permissions',
  },
  {
    label: NODE_TYPES.PERMISSION_SET.label,
    color: 'bg-cyan-500',
    shape: 'rounded-rectangle',
    description: 'Permission sets granting additional access',
  },
  {
    label: NODE_TYPES.ROLE.label,
    color: 'bg-amber-500',
    shape: 'diamond',
    description: 'Roles in role hierarchy',
  },
  {
    label: NODE_TYPES.OBJECT.label,
    color: 'bg-emerald-500',
    shape: 'rounded-rectangle',
    description: 'Salesforce objects (e.g., Account, Opportunity)',
  },
  {
    label: NODE_TYPES.FIELD.label,
    color: 'bg-lime-400',
    shape: 'ellipse',
    description: 'Object fields',
  },
  {
    label: NODE_TYPES.GROUP.label,
    color: 'bg-pink-500',
    shape: 'hexagon',
    description: 'Public groups',
  },
]

const edgeLegend: LegendItem[] = [
  {
    label: EDGE_TYPES.HAS_PROFILE.label,
    color: 'border-violet-500',
    description: 'User assigned to profile',
  },
  {
    label: EDGE_TYPES.HAS_PERMISSION_SET.label,
    color: 'border-cyan-500',
    description: 'User has permission set',
  },
  {
    label: EDGE_TYPES.HAS_ROLE.label,
    color: 'border-amber-500',
    description: 'User has role',
  },
  {
    label: EDGE_TYPES.INHERITS_FROM.label,
    color: 'border-pink-500',
    description: 'Role hierarchy inheritance (dashed)',
  },
  {
    label: EDGE_TYPES.CAN_ACCESS.label,
    color: 'border-emerald-500',
    description: 'Can access object',
  },
  {
    label: EDGE_TYPES.CAN_READ.label,
    color: 'border-lime-400',
    description: 'Read permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_CREATE.label,
    color: 'border-lime-400',
    description: 'Create permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_EDIT.label,
    color: 'border-lime-400',
    description: 'Edit permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_DELETE.label,
    color: 'border-lime-400',
    description: 'Delete permission (dotted)',
  },
  {
    label: EDGE_TYPES.MEMBER_OF.label,
    color: 'border-pink-500',
    description: 'Member of group',
  },
]

interface GraphLegendProps {
  className?: string
  compact?: boolean
}

export function GraphLegend({ className = '', compact = false }: GraphLegendProps) {
  const [showNodes, setShowNodes] = useState(true)
  const [showEdges, setShowEdges] = useState(true)

  if (compact) {
    return (
      <Card variant="bordered" className={className}>
        <CardContent className="py-3">
          <div className="space-y-3">
            {/* Compact node legend */}
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Nodes
              </div>
              <div className="flex flex-wrap gap-2">
                {nodeLegend.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compact edge legend */}
            <div>
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Relationships
              </div>
              <div className="flex flex-wrap gap-2">
                {edgeLegend.slice(0, 5).map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-6 h-0.5 border-t-2 ${item.color}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="bordered" className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Graph Legend</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Node Types */}
        <div>
          <button
            onClick={() => setShowNodes(!showNodes)}
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
          >
            <span>Node Types</span>
            {showNodes ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showNodes && (
            <div className="space-y-2">
              {nodeLegend.map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 ${item.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edge Types */}
        <div>
          <button
            onClick={() => setShowEdges(!showEdges)}
            className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
          >
            <span>Relationship Types</span>
            {showEdges ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showEdges && (
            <div className="space-y-2">
              {edgeLegend.map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className={`mt-1.5 w-8 h-0.5 border-t-2 flex-shrink-0 ${item.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Special Indicators */}
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Special Indicators
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 bg-red-300 border-4 border-red-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Center Node
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Primary focus of the graph (highlighted with red border)
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 bg-gray-300 border-4 border-yellow-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Selected Node
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Currently selected node (yellow border)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Line Styles */}
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Line Styles
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 bg-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Solid = Direct relationship
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Dashed = Inheritance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 border-t-2 border-dotted border-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Dotted = CRUD permissions
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
