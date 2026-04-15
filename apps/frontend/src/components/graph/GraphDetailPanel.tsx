'use client'

/**
 * Graph Detail Panel Component
 * Shows details for selected nodes and edges
 */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge, RiskBadge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { X, ExternalLink, User, Shield, Database, Key, Users } from 'lucide-react'
import { NODE_TYPES, EDGE_TYPES } from '@/lib/constants'

interface NodeData {
  id: string
  type: string
  label: string
  [key: string]: any
}

interface EdgeData {
  id: string
  source: string
  target: string
  type: string
  label?: string
  [key: string]: any
}

interface GraphDetailPanelProps {
  selectedNode?: NodeData | null
  selectedEdge?: EdgeData | null
  onClose?: () => void
  onNavigate?: (nodeId: string) => void
  className?: string
}

export function GraphDetailPanel({
  selectedNode,
  selectedEdge,
  onClose,
  onNavigate,
  className = '',
}: GraphDetailPanelProps) {
  if (!selectedNode && !selectedEdge) {
    return (
      <Card variant="bordered" className={className}>
        <CardContent className="py-12 text-center">
          <div className="text-gray-400 dark:text-gray-600">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Select a node or edge to view details</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (selectedNode) {
    return <NodeDetailPanel node={selectedNode} onClose={onClose} onNavigate={onNavigate} className={className} />
  }

  if (selectedEdge) {
    return <EdgeDetailPanel edge={selectedEdge} onClose={onClose} onNavigate={onNavigate} className={className} />
  }

  return null
}

function NodeDetailPanel({
  node,
  onClose,
  onNavigate,
  className,
}: {
  node: NodeData
  onClose?: () => void
  onNavigate?: (nodeId: string) => void
  className?: string
}) {
  const getNodeIcon = (type: string) => {
    switch (type) {
      case NODE_TYPES.USER.value:
        return User
      case NODE_TYPES.PROFILE.value:
      case NODE_TYPES.PERMISSION_SET.value:
        return Shield
      case NODE_TYPES.OBJECT.value:
      case NODE_TYPES.FIELD.value:
        return Database
      case NODE_TYPES.ROLE.value:
        return Key
      case NODE_TYPES.GROUP.value:
        return Users
      default:
        return Database
    }
  }

  const Icon = getNodeIcon(node.type)
  const nodeTypeLabel = Object.values(NODE_TYPES).find((t) => t.value === node.type)?.label || node.type

  return (
    <Card variant="bordered" className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900">
              <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <CardTitle className="text-lg">{node.label}</CardTitle>
              <Badge variant="info" size="sm" className="mt-1">
                {nodeTypeLabel}
              </Badge>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Node ID */}
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Node ID
          </div>
          <div className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            {node.id}
          </div>
        </div>

        {/* User-specific fields */}
        {node.type === NODE_TYPES.USER.value && (
          <>
            {node.email && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Email
                </div>
                <div className="text-sm text-gray-900 dark:text-white">{node.email}</div>
              </div>
            )}
            {node.riskLevel && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Risk Level
                </div>
                <RiskBadge level={node.riskLevel} />
              </div>
            )}
            {node.profile && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Profile
                </div>
                <div className="text-sm text-gray-900 dark:text-white">{node.profile}</div>
              </div>
            )}
            {node.role && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Role
                </div>
                <div className="text-sm text-gray-900 dark:text-white">{node.role}</div>
              </div>
            )}
            {typeof node.isActive !== 'undefined' && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Status
                </div>
                <Badge variant={node.isActive ? 'success' : 'default'}>
                  {node.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            )}
          </>
        )}

        {/* Object-specific fields */}
        {node.type === NODE_TYPES.OBJECT.value && (
          <>
            {node.apiName && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  API Name
                </div>
                <div className="text-sm text-gray-900 dark:text-white font-mono">
                  {node.apiName}
                </div>
              </div>
            )}
            {typeof node.isSensitive !== 'undefined' && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Sensitivity
                </div>
                <Badge variant={node.isSensitive ? 'warning' : 'default'}>
                  {node.isSensitive ? 'Sensitive' : 'Standard'}
                </Badge>
              </div>
            )}
          </>
        )}

        {/* Profile/Permission Set specific */}
        {(node.type === NODE_TYPES.PROFILE.value || node.type === NODE_TYPES.PERMISSION_SET.value) && (
          <>
            {node.description && (
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Description
                </div>
                <div className="text-sm text-gray-900 dark:text-white">{node.description}</div>
              </div>
            )}
          </>
        )}

        {/* Additional properties */}
        {node.properties && Object.keys(node.properties).length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Additional Properties
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(node.properties).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                  <span className="text-gray-900 dark:text-white font-mono">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {node.type === NODE_TYPES.USER.value && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => onNavigate?.(node.id)}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View User Details
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EdgeDetailPanel({
  edge,
  onClose,
  onNavigate,
  className,
}: {
  edge: EdgeData
  onClose?: () => void
  onNavigate?: (nodeId: string) => void
  className?: string
}) {
  const edgeTypeLabel = Object.values(EDGE_TYPES).find((t) => t.value === edge.type)?.label || edge.type

  return (
    <Card variant="bordered" className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">Relationship</CardTitle>
            <Badge variant="info" size="sm" className="mt-1">
              {edgeTypeLabel}
            </Badge>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Edge ID */}
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Edge ID
          </div>
          <div className="text-sm text-gray-900 dark:text-white font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
            {edge.id}
          </div>
        </div>

        {/* Source and Target */}
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Connection
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 w-16">From:</div>
              <button
                onClick={() => onNavigate?.(edge.source)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-mono flex-1 text-left"
              >
                {edge.source}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 w-16">To:</div>
              <button
                onClick={() => onNavigate?.(edge.target)}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-mono flex-1 text-left"
              >
                {edge.target}
              </button>
            </div>
          </div>
        </div>

        {/* Label */}
        {edge.label && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Label
            </div>
            <div className="text-sm text-gray-900 dark:text-white">{edge.label}</div>
          </div>
        )}

        {/* Permission details for CRUD edges */}
        {[
          EDGE_TYPES.CAN_READ.value,
          EDGE_TYPES.CAN_CREATE.value,
          EDGE_TYPES.CAN_EDIT.value,
          EDGE_TYPES.CAN_DELETE.value,
        ].includes(edge.type) && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Permission Type
            </div>
            <Badge variant="success">{edgeTypeLabel}</Badge>
          </div>
        )}

        {/* Additional properties */}
        {edge.properties && Object.keys(edge.properties).length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Additional Properties
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(edge.properties).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                  <span className="text-gray-900 dark:text-white font-mono">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
