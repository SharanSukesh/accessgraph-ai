'use client'

/**
 * Graph Detail Panel Component
 * Shows details for selected nodes and edges
 */

import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge, RiskBadge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { X, ExternalLink, User, Shield, Database, Key, Users, FileText, Lock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { NODE_TYPES, EDGE_TYPES } from '@/lib/constants'
import { apiClient } from '@/lib/api/client'
import { useState } from 'react'

interface NodeData {
  id: string
  type: string
  label: string
  [key: string]: any
}

interface NodeDetailsResponse {
  node: {
    id: string
    type: string
    name: string
    label?: string
    description?: string
  }
  objectsGranted: Array<{
    objectName: string
    permissions: string[]
    canRead: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
    viewAll: boolean
    modifyAll: boolean
  }>
  fieldsGranted: Array<{
    fieldName: string
    objectName: string
    displayName: string
    permissions: string[]
    canRead: boolean
    canEdit: boolean
  }>
  recordsInfo: {
    note: string
    potentialSources: string[]
    implementationRequired: boolean
  }
  otherAccess: {
    systemPermissions: any[]
    customPermissions: any[]
    tabVisibility: any[]
    apexClasses: any[]
  }
  summary: {
    totalObjects: number
    totalFields: number
    objectsWithFullAccess: number
    objectsWithModifyAll: number
  }
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
  orgId: string
  selectedNode?: NodeData | null
  selectedEdge?: EdgeData | null
  onClose?: () => void
  onNavigate?: (nodeId: string) => void
  className?: string
}

export function GraphDetailPanel({
  orgId,
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
    return <NodeDetailPanel orgId={orgId} node={selectedNode} onClose={onClose} onNavigate={onNavigate} className={className} />
  }

  if (selectedEdge) {
    return <EdgeDetailPanel edge={selectedEdge} onClose={onClose} onNavigate={onNavigate} className={className} />
  }

  return null
}

function NodeDetailPanel({
  orgId,
  node,
  onClose,
  onNavigate,
  className,
}: {
  orgId: string
  node: NodeData
  onClose?: () => void
  onNavigate?: (nodeId: string) => void
  className?: string
}) {
  const [showObjects, setShowObjects] = useState(true)
  const [showFields, setShowFields] = useState(true)

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

  // Fetch detailed breakdown for permission sets and profiles
  const shouldFetchDetails = node.type === NODE_TYPES.PERMISSION_SET.value || node.type === NODE_TYPES.PROFILE.value

  const { data: nodeDetails, isLoading: detailsLoading } = useQuery<NodeDetailsResponse>({
    queryKey: ['node-details', orgId, node.id],
    queryFn: async (): Promise<NodeDetailsResponse> => {
      const response = await apiClient.get(`/orgs/${orgId}/graph/node/${node.id}/details`)
      return response as NodeDetailsResponse
    },
    enabled: shouldFetchDetails,
  })

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
      <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
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

        {/* Enhanced details for Permission Sets and Profiles */}
        {shouldFetchDetails && nodeDetails && (
          <>
            {/* Summary */}
            {nodeDetails.summary && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Access Summary
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Objects</div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {nodeDetails.summary.totalObjects}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1">Fields</div>
                    <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {nodeDetails.summary.totalFields}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Objects Granted Access */}
            {nodeDetails.objectsGranted && nodeDetails.objectsGranted.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowObjects(!showObjects)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Objects ({nodeDetails.objectsGranted.length})
                  </span>
                  {showObjects ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showObjects && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {nodeDetails.objectsGranted.map((obj: any) => (
                      <div
                        key={obj.objectName}
                        className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs"
                      >
                        <div className="font-medium text-gray-900 dark:text-white mb-1">
                          {obj.objectName}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {obj.permissions.map((perm: string) => (
                            <Badge key={perm} variant="success" size="sm">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fields Granted Access */}
            {nodeDetails.fieldsGranted && nodeDetails.fieldsGranted.length > 0 && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowFields(!showFields)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 hover:text-gray-900 dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Fields ({nodeDetails.fieldsGranted.length})
                  </span>
                  {showFields ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showFields && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {nodeDetails.fieldsGranted.map((field: any) => (
                      <div
                        key={field.fieldName}
                        className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs"
                      >
                        <div className="font-medium text-gray-900 dark:text-white">
                          {field.displayName}
                        </div>
                        <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">
                          {field.objectName}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {field.permissions.map((perm: string) => (
                            <Badge key={perm} variant="success" size="sm">
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Record-Level Access Info */}
            {nodeDetails.recordsInfo && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Record-Level Access
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900 dark:text-amber-100">
                      {nodeDetails.recordsInfo.note}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Loading state for details */}
        {shouldFetchDetails && detailsLoading && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              Loading detailed access information...
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
        {([
          EDGE_TYPES.CAN_READ.value,
          EDGE_TYPES.CAN_CREATE.value,
          EDGE_TYPES.CAN_EDIT.value,
          EDGE_TYPES.CAN_DELETE.value,
        ] as string[]).includes(edge.type) && (
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
