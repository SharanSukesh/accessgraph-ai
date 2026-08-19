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

// Swatch hexes intentionally mirror the Cytoscape stylesheet in
// ERGraphVisualization (canvas ink is theme-invariant, so no dark:
// swap here — the graph paints the same colors in both themes).
const nodeLegend: LegendItem[] = [
  {
    label: NODE_TYPES.USER.label,
    color: 'bg-[#d8794a]',
    shape: 'ellipse',
    description: 'Salesforce users',
  },
  {
    label: NODE_TYPES.PROFILE.label,
    color: 'bg-[#2e8064]',
    shape: 'rounded-rectangle',
    description: 'User profiles defining base permissions',
  },
  {
    label: NODE_TYPES.PERMISSION_SET.label,
    color: 'bg-[#6bbf95]',
    shape: 'rounded-rectangle',
    description: 'Permission sets granting additional access',
  },
  {
    label: NODE_TYPES.MUTING_PERMISSION_SET.label,
    color: 'bg-red-500',
    shape: 'rounded-rectangle',
    description: 'Muting permission sets — remove access within a permission set group',
  },
  {
    label: NODE_TYPES.ROLE.label,
    color: 'bg-[#b8d1c0]',
    shape: 'diamond',
    description: 'Roles in role hierarchy',
  },
  {
    label: NODE_TYPES.OBJECT.label,
    color: 'bg-[#146b4a]',
    shape: 'rounded-rectangle',
    description: 'Salesforce objects (e.g., Account, Opportunity)',
  },
  {
    label: NODE_TYPES.FIELD.label,
    color: 'bg-[#9ccfb2]',
    shape: 'ellipse',
    description: 'Object fields',
  },
  {
    label: NODE_TYPES.GROUP.label,
    color: 'bg-[#c26b47]',
    shape: 'hexagon',
    description: 'Public groups',
  },
]

const edgeLegend: LegendItem[] = [
  {
    label: EDGE_TYPES.HAS_PROFILE.label,
    color: 'border-[#2e8064]',
    description: 'User assigned to profile',
  },
  {
    label: EDGE_TYPES.HAS_PERMISSION_SET.label,
    color: 'border-[#6bbf95]',
    description: 'User has permission set',
  },
  {
    label: EDGE_TYPES.HAS_MUTING_PERMISSION_SET.label,
    color: 'border-red-600',
    description: 'User has muting permission set (removes access)',
  },
  {
    label: EDGE_TYPES.HAS_ROLE.label,
    color: 'border-[#b8d1c0]',
    description: 'User has role',
  },
  {
    label: EDGE_TYPES.INHERITS_FROM.label,
    color: 'border-[#d8794a]',
    description: 'Role hierarchy inheritance (dashed)',
  },
  {
    label: EDGE_TYPES.CAN_ACCESS.label,
    color: 'border-[#2e8064]',
    description: 'Can access object',
  },
  {
    label: EDGE_TYPES.CAN_READ.label,
    color: 'border-[#9ccfb2]',
    description: 'Read permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_CREATE.label,
    color: 'border-[#9ccfb2]',
    description: 'Create permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_EDIT.label,
    color: 'border-[#9ccfb2]',
    description: 'Edit permission (dotted)',
  },
  {
    label: EDGE_TYPES.CAN_DELETE.label,
    color: 'border-[#9ccfb2]',
    description: 'Delete permission (dotted)',
  },
  {
    label: EDGE_TYPES.MEMBER_OF.label,
    color: 'border-[#c26b47]',
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
              <div className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
                Nodes
              </div>
              <div className="flex flex-wrap gap-2">
                {nodeLegend.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${item.color}`} />
                    <span className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compact edge legend */}
            <div>
              <div className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
                Relationships
              </div>
              <div className="flex flex-wrap gap-2">
                {edgeLegend.slice(0, 5).map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <div className={`w-6 h-0.5 border-t-2 ${item.color}`} />
                    <span className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
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
            className="flex items-center justify-between w-full v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2 hover:text-grove-ink dark:hover:text-grove-ink-dk"
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
                    <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
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
            className="flex items-center justify-between w-full v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2 hover:text-grove-ink dark:hover:text-grove-ink-dk"
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
                    <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
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
          <div className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
            Special Indicators
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 bg-[#d8794a] border-4 border-[#c26b47]" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                  Center Node
                </div>
                <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                  Primary focus of the graph (highlighted with copper border)
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 bg-grove-border border-4 border-yellow-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                  Selected Node
                </div>
                <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                  Currently selected node (yellow border)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Line Styles */}
        <div>
          <div className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
            Line Styles
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 bg-grove-ink/40" />
              <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                Solid = Direct relationship
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 border-t-2 border-dashed border-grove-ink/40" />
              <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                Dashed = Inheritance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-0.5 border-t-2 border-dotted border-grove-ink/40" />
              <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                Dotted = CRUD permissions
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
