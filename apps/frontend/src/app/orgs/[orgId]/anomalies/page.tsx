'use client'

/**
 * Anomalies Page
 * Browse and investigate detected anomalies
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, Filter, Search, User, Calendar, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge, SeverityBadge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useAnomalies, useTopAnomalousUsers } from '@/lib/api/hooks/useAnomalies'

export default function AnomaliesPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null)

  const {
    data: anomalies,
    isLoading,
    error,
  } = useAnomalies(orgId, {
    search,
    severity: severityFilter || undefined,
    type: typeFilter || undefined,
  })

  const { data: topUsers } = useTopAnomalousUsers(orgId, 10)

  // Debug logging
  console.log('Anomalies Debug:', {
    anomalies,
    isLoading,
    error,
    length: anomalies?.length,
    filters: { search, severityFilter, typeFilter }
  })

  if (error) {
    return (
      <ErrorState
        message="Failed to load anomalies. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Anomalies
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Review detected access anomalies and unusual patterns
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Anomalies
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : anomalies?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Critical
              </p>
              <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
                {isLoading
                  ? '...'
                  : anomalies?.filter((a: any) => a.severity === 'critical').length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                High
              </p>
              <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
                {isLoading
                  ? '...'
                  : anomalies?.filter((a: any) => a.severity === 'high').length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Affected Users
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : topUsers?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <User className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search anomalies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="excessive_permissions">Excessive Permissions</option>
              <option value="unusual_access">Unusual Access</option>
              <option value="dormant_user">Dormant User</option>
              <option value="privilege_escalation">Privilege Escalation</option>
              <option value="sensitive_data">Sensitive Data Access</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Anomalies List */}
        <div className="lg:col-span-2">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>
                {anomalies ? `${anomalies.length} Anomalies` : 'Anomalies'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={10} />
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-3">
                  {anomalies.map((anomaly: any) => (
                    <div
                      key={anomaly.id}
                      onClick={() => setSelectedAnomaly(anomaly)}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedAnomaly?.id === anomaly.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <SeverityBadge severity={anomaly.severity} />
                            <Badge variant="info" size="sm">
                              {anomaly.type?.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {anomaly.title}
                          </h3>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {anomaly.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        {anomaly.userId && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{anomaly.userName || anomaly.userId}</span>
                          </div>
                        )}
                        {anomaly.detectedAt && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(anomaly.detectedAt).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Anomalies Found"
                  description="No anomalies match your current filters"
                  icon="default"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel / Top Users */}
        <div className="space-y-6">
          {/* Selected Anomaly Detail */}
          {selectedAnomaly ? (
            <Card variant="bordered">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle>Anomaly Details</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAnomaly(null)}
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Severity
                  </div>
                  <SeverityBadge severity={selectedAnomaly.severity} />
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Type
                  </div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {selectedAnomaly.type?.replace(/_/g, ' ')}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Description
                  </div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {selectedAnomaly.description}
                  </div>
                </div>

                {selectedAnomaly.details && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Details
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      {Object.entries(selectedAnomaly.details).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-500">{key}:</span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedAnomaly.userId && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full"
                      onClick={() =>
                        router.push(`/orgs/${orgId}/users/${selectedAnomaly.userId}`)
                      }
                    >
                      View User Details
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Top Anomalous Users */
            <Card variant="bordered">
              <CardHeader>
                <CardTitle>Top Anomalous Users</CardTitle>
              </CardHeader>
              <CardContent>
                {topUsers && topUsers.length > 0 ? (
                  <div className="space-y-3">
                    {topUsers.map((user: any) => (
                      <button
                        key={user.userId}
                        onClick={() => router.push(`/orgs/${orgId}/users/${user.userId}`)}
                        className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                            <User className="h-5 w-5 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.userName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {user.anomalyCount} anomalies
                            </div>
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {user.anomalyScore}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No Data"
                    description="No anomalous users found"
                    icon="users"
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card variant="bordered" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-300">
                  <p className="font-medium mb-1">About Anomalies</p>
                  <p className="text-xs">
                    Anomalies are automatically detected patterns that deviate from normal
                    access behavior. Review and investigate each one to determine if action
                    is needed.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
