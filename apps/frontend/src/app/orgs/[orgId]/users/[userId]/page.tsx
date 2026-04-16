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
import { PageSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { GraphVisualization } from '@/components/graph/GraphVisualization'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { GraphControls } from '@/components/graph/GraphControls'
import {
  useUser,
  useUserObjectAccess,
  useUserFieldAccess,
  useUserRisk,
  useUserRecommendations,
} from '@/lib/api/hooks/useUsers'
import { useUserGraph } from '@/lib/api/hooks/useGraph'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const userId = params.userId as string

  const [activeTab, setActiveTab] = useState('overview')

  // Fetch user data
  const { data: user, isLoading: userLoading, error: userError } = useUser(orgId, userId)
  const { data: objectAccess, isLoading: objectsLoading } = useUserObjectAccess(orgId, userId)
  const { data: fieldAccess, isLoading: fieldsLoading } = useUserFieldAccess(orgId, userId)
  const { data: risk, isLoading: riskLoading } = useUserRisk(orgId, userId)
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/orgs/${orgId}/users`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {user.name}
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.riskLevel && <RiskBadge level={user.riskLevel as "low" | "medium" | "high" | "critical"} />}
          <Badge variant={user.isActive ? 'success' : 'default'}>
            {user.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {/* User Info Card */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Salesforce User ID
                </div>
                <div className="text-sm text-gray-900 dark:text-white font-mono mt-1">
                  {user.salesforceUserId}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Profile
                </div>
                <div className="text-sm text-gray-900 dark:text-white mt-1">
                  {user.profile || '-'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Role
                </div>
                <div className="text-sm text-gray-900 dark:text-white mt-1">
                  {user.role || '-'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Last Login
                </div>
                <div className="text-sm text-gray-900 dark:text-white mt-1">
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
          <TabsTrigger value="graph">
            <Network className="h-4 w-4 mr-2" />
            Graph
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <AlertTriangle className="h-4 w-4 mr-2" />
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
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                  </div>
                ) : risk ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Overall Risk Score
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {risk.score}
                        </div>
                        <RiskBadge level={risk.level as "low" | "medium" | "high" | "critical"} />
                      </div>
                    </div>
                    {risk.factors && risk.factors.length > 0 && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          Risk Factors
                        </div>
                        <ul className="space-y-2">
                          {risk.factors.map((factor: any, idx: number) => (
                            <li
                              key={idx}
                              className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"
                            >
                              <span className="text-red-500 mt-1">•</span>
                              <span>{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Objects Accessible
                    </span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      {objectsLoading ? '...' : objectAccess?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Fields Accessible
                    </span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      {fieldsLoading ? '...' : fieldAccess?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Recommendations
                    </span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
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
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Object
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Read
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Create
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Edit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Delete
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Sensitivity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                      {objectAccess.map((obj: any) => (
                        <tr key={obj.objectName} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
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
                    <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Object
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Field
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Read
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Edit
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Sensitivity
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                      {fieldAccess.map((field: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {field.objectName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
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

        {/* Graph Tab */}
        <TabsContent value="graph">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1">
              <GraphLegend compact />
            </div>
            <div className="lg:col-span-3">
              {graphLoading ? (
                <Card variant="bordered">
                  <CardContent className="py-12 text-center">
                    <div className="animate-pulse">
                      <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                      <p className="mt-4 text-gray-500 dark:text-gray-400">
                        Loading graph...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : graph ? (
                <GraphVisualization graph={graph} height="600px" />
              ) : (
                <EmptyState title="No Graph Data" description="Unable to load graph" icon="network" />
              )}
            </div>
          </div>
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
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                            {rec.title}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {rec.description}
                          </div>
                        </div>
                        <SeverityBadge severity={rec.severity} />
                      </div>
                      {rec.action && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Recommended Action
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300">
                            {rec.action}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Recommendations" description="No recommendations available" icon="default" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
