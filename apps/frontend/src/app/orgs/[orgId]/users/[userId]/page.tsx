'use client'

/**
 * User Detail Page
 * Comprehensive view of user access, permissions, and risk
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Key,
  AlertTriangle,
  Database,
  FileText,
  Network,
  FileCheck,
  Calendar,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge, RiskBadge, SeverityBadge } from '@/components/shared/Badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shared/Tabs'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { ERGraphVisualization } from '@/components/graph/ERGraphVisualization'
import { ObjectFilterPanel } from '@/components/graph/ObjectFilterPanel'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel'
import { RecordAccessInfo } from '@/components/users/RecordAccessInfo'
import {
  useUser,
  useUserObjectAccess,
  useUserFieldAccess,
  useUserRisk,
  useUserAnomalies,
  useUserRecommendations,
} from '@/lib/api/hooks/useUsers'
import { useUserGraph } from '@/lib/api/hooks/useGraph'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const userId = params.userId as string

  const [activeTab, setActiveTab] = useState('overview')
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [selectedGraphNode, setSelectedGraphNode] = useState<any>(null)

  // Fetch user data
  const { data: user, isLoading: userLoading, error: userError } = useUser(orgId, userId)
  const { data: objectAccess, isLoading: objectsLoading } = useUserObjectAccess(orgId, userId)
  const { data: fieldAccess, isLoading: fieldsLoading } = useUserFieldAccess(orgId, userId)
  const { data: risk, isLoading: riskLoading } = useUserRisk(orgId, userId)
  const { data: anomalies, isLoading: anomaliesLoading } = useUserAnomalies(orgId, userId)
  const { data: recommendations, isLoading: recommendationsLoading } = useUserRecommendations(orgId, userId)
  const { data: graph, isLoading: graphLoading } = useUserGraph(orgId, userId)

  if (userError) {
    return (
      <ErrorState
        message="Failed to load user details. Please try again."
        onRetry={() => router.push(`/orgs/${orgId}/users/${userId}`)}
      />
    )
  }

  if (userLoading) {
    return <PageSkeleton />
  }

  if (!user) {
    return (
      <EmptyState
        title="User Not Found"
        description="The requested user could not be found"
        icon="users"
        action={{ label: 'Back to Users', onClick: () => router.push(`/orgs/${orgId}/users`) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Users', href: `/orgs/${orgId}/users` },
          { label: user.name },
        ]}
      />
      <PageHeader
        icon={User}
        title={user.name}
        subtitle={user.email}
        actions={
          <>
            {user.riskLevel && (
              <RiskBadge
                level={user.riskLevel as 'low' | 'medium' | 'high' | 'critical'}
              />
            )}
            <Badge variant={user.isActive ? 'success' : 'default'}>
              {user.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </>
        }
      />

      {/* User Info Card */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-grove-ink/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Salesforce User ID
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk font-mono mt-1">
                  {user.salesforceUserId}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-grove-ink/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Profile
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {user.profile || '-'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-grove-ink/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Role
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {user.role || '-'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-grove-ink/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Last Login
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {user.lastLoginDate
                    ? new Date(user.lastLoginDate).toLocaleDateString()
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <User className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="objects">
            <Database className="h-4 w-4 mr-2" />
            Object Access
          </TabsTrigger>
          <TabsTrigger value="fields">
            <FileText className="h-4 w-4 mr-2" />
            Field Access
          </TabsTrigger>
          <TabsTrigger value="records">
            <Shield className="h-4 w-4 mr-2" />
            Record Access
          </TabsTrigger>
          <TabsTrigger value="graph">
            <Network className="h-4 w-4 mr-2" />
            Graph
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <FileCheck className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Overview */}
            <Card variant="bordered">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {riskLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded w-3/4" />
                    <div className="h-4 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded w-1/2" />
                  </div>
                ) : risk && risk.score > 0 ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
                        Overall Risk Score
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                          {risk.score}
                        </div>
                        <RiskBadge level={risk.level as "low" | "medium" | "high" | "critical"} />
                      </div>
                      {risk.calculatedAt && (
                        <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                          Calculated {new Date(risk.calculatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {risk.factors && risk.factors.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-3">
                          Risk Factor Breakdown
                        </div>
                        <div className="space-y-3">
                          {risk.factors.map((factor: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg bg-primary-50/40 dark:bg-primary-900/10 border border-grove-border dark:border-grove-border-dk"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk capitalize">
                                  {factor.factor?.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs font-semibold text-grove-ink/65 dark:text-grove-ink-dk/65">
                                  {(factor.score * factor.weight * 100).toFixed(1)} pts
                                </span>
                              </div>
                              <div className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
                                {factor.description}
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <div className="flex-1 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded-full h-1.5">
                                  <div
                                    className="bg-primary-600 h-1.5 rounded-full transition-all"
                                    style={{ width: `${factor.score * 100}%` }}
                                  />
                                </div>
                                <span className="text-grove-ink/55 dark:text-grove-ink-dk/55 min-w-[3rem] text-right">
                                  {(factor.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {risk.explanation && (
                      <div className="pt-3 border-t border-grove-border dark:border-grove-border-dk">
                        <div className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 whitespace-pre-line">
                          {risk.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                ) : risk && risk.score === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
                      {risk.explanation || "No risk assessment available yet. The next sync will generate risk scores."}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No Risk Data" description="Risk assessment not available" icon="default" />
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card variant="bordered">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Access Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Objects Accessible
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {objectsLoading ? '...' : objectAccess?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Fields Accessible
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {fieldsLoading ? '...' : fieldAccess?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Recommendations
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {recommendationsLoading ? '...' : recommendations?.length || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Object Access Tab */}
        <TabsContent value="objects">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Object Access Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              {objectsLoading ? (
                <TableSkeleton rows={5} />
              ) : objectAccess && objectAccess.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Object
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Read
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Create
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Edit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Delete
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Sensitivity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                      {objectAccess.map((obj: any) => (
                        <tr key={obj.objectName} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                            {obj.objectLabel || obj.objectName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canRead ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canCreate ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canEdit ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canDelete ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.isSensitive ? (
                              <Badge variant="warning" size="sm">Sensitive</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Standard</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No Object Access" description="No object permissions found" icon="database" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Field Access Tab */}
        <TabsContent value="fields">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Field Access Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              {fieldsLoading ? (
                <TableSkeleton rows={10} />
              ) : fieldAccess && fieldAccess.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Object
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Field
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Read
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Edit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                          Sensitivity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                      {fieldAccess.map((field: any, idx: number) => (
                        <tr key={idx} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-grove-ink dark:text-grove-ink-dk">
                            {field.objectName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                            {field.fieldLabel || field.fieldName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.canRead ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.canEdit ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.isSensitive ? (
                              <Badge variant="warning" size="sm">Sensitive</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Standard</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No Field Access" description="No field permissions found" icon="file-text" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Record Access Tab */}
        <TabsContent value="records">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Record-Level Access
              </CardTitle>
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-2">
                Understand which specific records this user can access based on ownership, role hierarchy, sharing rules, and team assignments
              </p>
            </CardHeader>
            <CardContent>
              <RecordAccessInfo userId={userId} orgId={orgId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Graph Tab */}
        <TabsContent value="graph">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Graph Area */}
            <div className="lg:col-span-8">
              {graphLoading ? (
                <Card variant="bordered">
                  <CardContent className="py-12 text-center">
                    <div className="animate-pulse">
                      <div className="h-96 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded-lg" />
                      <p className="mt-4 text-grove-ink/55 dark:text-grove-ink-dk/55">
                        Loading graph...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : graph ? (
                <>
                  <ERGraphVisualization
                    graph={graph}
                    selectedObjects={selectedObjects}
                    onNodeSelect={(node) => setSelectedGraphNode(node)}
                    height="800px"
                  />
                  <div className="mt-4">
                    <GraphLegend compact />
                  </div>
                </>
              ) : (
                <EmptyState title="No Graph Data" description="Unable to load graph" icon="network" />
              )}
            </div>

            {/* Right Sidebar - Object Filter or Node Details */}
            <div className="lg:col-span-4">
              {selectedGraphNode ? (
                <GraphDetailPanel
                  selectedNode={selectedGraphNode}
                  orgId={orgId}
                  onClose={() => setSelectedGraphNode(null)}
                />
              ) : (
                <ObjectFilterPanel
                  availableObjects={
                    graph?.nodes
                      .filter((n) => n.type === 'object')
                      .map((n) => ({
                        id: n.id,
                        name: n.properties.objectName || n.label,
                        fieldCount: n.properties.fields?.length || 0,
                      })) || []
                  }
                  selectedObjects={selectedObjects}
                  onObjectToggle={(objectName) => {
                    setSelectedObjects((prev) =>
                      prev.includes(objectName)
                        ? prev.filter((n) => n !== objectName)
                        : [...prev, objectName]
                    )
                  }}
                  onSelectAll={() => {
                    const allObjects = graph?.nodes
                      .filter((n) => n.type === 'object')
                      .map((n) => n.properties.objectName || n.label) || []
                    setSelectedObjects(allObjects)
                  }}
                  onDeselectAll={() => setSelectedObjects([])}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Access Anomalies</CardTitle>
            </CardHeader>
            <CardContent>
              {anomaliesLoading ? (
                <TableSkeleton rows={5} />
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-4">
                  {anomalies.map((anomaly: any) => (
                    <div
                      key={anomaly.id}
                      className="p-4 border border-grove-border dark:border-grove-border-dk rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <SeverityBadge severity={anomaly.severity} />
                            <span className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                              Anomaly Score: {typeof anomaly.anomaly_score === 'number' ? anomaly.anomaly_score.toFixed(2) : anomaly.anomaly_score}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                            Anomalous Access Pattern Detected
                          </div>
                          <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                            Detected {new Date(anomaly.detected_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {anomaly.reasons && anomaly.reasons.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                          <div className="text-xs font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-3">
                            🔍 Specific Anomalies Detected
                          </div>
                          <div className="space-y-3">
                            {anomaly.reasons.map((reason: string, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                              >
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                                      {reason}
                                    </div>
                                    <div className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                                      This value is significantly different from peers with the same role, profile, or department.
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                        <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 space-y-2">
                          <div>
                            <strong className="text-grove-ink/85 dark:text-grove-ink-dk/85">How This Was Detected:</strong>
                          </div>
                          <div>
                            <strong>1. Peer Comparison:</strong> We identified users similar to this user by matching:
                            <ul className="list-disc list-inside ml-4 mt-1">
                              <li>Same Role (if available)</li>
                              <li>Same Profile (e.g., System Administrator)</li>
                              <li>Same Department (fallback)</li>
                            </ul>
                          </div>
                          <div>
                            <strong>2. Feature Analysis:</strong> We analyzed 13 access-pattern signals including number
                            of permission sets, object and field permissions, sensitive-data access, days since last
                            login, cross-department access ratio, and how many of this user's grants are unique to them.
                          </div>
                          <div>
                            <strong>3. ML Detection:</strong> A Mahalanobis-distance + Gaussian-Mixture rank-average
                            ensemble flagged this user because their feature combination is statistically unusual
                            compared to peers. The ensemble was selected after benchmarking 14 algorithms across 5
                            paradigms; see <code>research/anomaly_benchmark/REPORT.md</code> for the methodology.
                            Anomaly score of <strong>{typeof anomaly.anomaly_score === 'number' ? anomaly.anomaly_score.toFixed(2) : anomaly.anomaly_score}</strong>
                            indicates deviation level (0 = normal, 1 = highly unusual).
                          </div>
                          <div>
                            <strong>4. Why System Admins Get Flagged:</strong> If this user is the only System Administrator, or has
                            significantly more/fewer permissions than other System Admins, they'll be flagged. This doesn't mean there's
                            a security issue—it means their access pattern is unique and should be reviewed to ensure it's intentional.
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Anomalies" description="No access anomalies detected for this user" icon="default" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {recommendationsLoading ? (
                <TableSkeleton rows={5} />
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec: any) => (
                    <div
                      key={rec.id}
                      className="p-4 border border-grove-border dark:border-grove-border-dk rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <SeverityBadge severity={rec.severity} />
                            <Badge variant="info" size="sm">
                              {rec.rec_type?.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                            {rec.title}
                          </div>
                          <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                            {rec.description}
                          </div>
                        </div>
                      </div>
                      {rec.action && (
                        <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                          <div className="text-xs font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-1">
                            Recommended Action
                          </div>
                          <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                            {rec.action}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                        <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                          <strong>How recommendations work:</strong> This recommendation was generated based on
                          detected anomalies and security best practices. Recommendations are categorized by type
                          (PSG Migration, Access Review, Permission Removal) and prioritized by severity. They help
                          you proactively address potential security issues before they become problems.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Recommendations" description="No recommendations available for this user" icon="default" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
