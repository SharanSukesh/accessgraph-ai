'use client'

/**
 * Organization Dashboard Page
 * Executive overview of access health
 */

import { Users, AlertTriangle, Shield, Database } from 'lucide-react'
import { useParams } from 'next/navigation'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { RiskBadge, StatusBadge } from '@/components/shared/Badge'
import { useUsers } from '@/lib/api/hooks/useUsers'
import { useAnomalies, useTopAnomalousUsers } from '@/lib/api/hooks/useAnomalies'
import { useRecommendations } from '@/lib/api/hooks/useRecommendations'
import { useSyncJobs } from '@/lib/api/hooks/useOrgs'

export default function DashboardPage() {
  const params = useParams()
  const orgId = params.orgId as string

  // Fetch data
  const { data: users, isLoading: usersLoading, error: usersError } = useUsers(orgId)
  const { data: anomalies, isLoading: anomaliesLoading } = useAnomalies(orgId, {
    severity: 'critical',
  })
  const { data: topAnomalies, isLoading: topAnomaliesLoading } =
    useTopAnomalousUsers(orgId, 5)
  const { data: recommendations, isLoading: recommendationsLoading } =
    useRecommendations(orgId)
  const { data: syncJobs } = useSyncJobs(orgId)

  const isLoading =
    usersLoading || anomaliesLoading || topAnomaliesLoading || recommendationsLoading

  if (usersError) {
    return (
      <ErrorState
        message="Failed to load dashboard data. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  // Calculate metrics
  const totalUsers = users?.length || 0
  const highRiskUsers =
    users?.filter((u: any) => u.riskLevel === 'high' || u.riskLevel === 'critical')
      .length || 0
  const criticalAnomalies = anomalies?.length || 0
  const totalRecommendations = recommendations?.length || 0

  const latestSync = syncJobs?.[0]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Access health overview for your organization
        </p>
      </div>

      {/* Sync Status Banner */}
      {latestSync && (
        <Card variant="bordered" className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <StatusBadge status={latestSync.status} />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Last sync: {new Date(latestSync.completed_at || latestSync.started_at).toLocaleString()}
                </span>
              </div>
              {latestSync.summary && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {latestSync.summary.usersProcessed || 0} users processed
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
          <MetricCard
            title="Total Users"
            value={totalUsers}
            icon={Users}
            iconColor="text-blue-600"
          />
        
        
          <MetricCard
            title="High-Risk Users"
            value={highRiskUsers}
            icon={Shield}
            iconColor="text-red-600"
          />
        
        
          <MetricCard
            title="Critical Anomalies"
            value={criticalAnomalies}
            icon={AlertTriangle}
            iconColor="text-orange-600"
          />
        
        
          <MetricCard
            title="Recommendations"
            value={totalRecommendations}
            icon={Database}
            iconColor="text-green-600"
          />
        
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Anomalous Users */}
        
          <Card variant="bordered">
          <CardHeader>
            <CardTitle>Top Anomalous Users</CardTitle>
          </CardHeader>
          <CardContent>
            {topAnomalies && topAnomalies.length > 0 ? (
              <div className="space-y-3">
                {topAnomalies.map((anomaly: any) => (
                  <div
                    key={anomaly.userId}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {anomaly.userName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {anomaly.userEmail}
                      </p>
                      {anomaly.topReasons && anomaly.topReasons.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {anomaly.topReasons[0]}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {anomaly.anomalyScore.toFixed(1)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          score
                        </p>
                      </div>
                      <RiskBadge level={anomaly.severity} showLabel={false} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Anomalies"
                description="No anomalous access patterns detected"
                icon="data"
              />
            )}
          </CardContent>
          </Card>
        

        {/* Recent Recommendations */}
        
          <Card variant="bordered">
          <CardHeader>
            <CardTitle>Recent Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {recommendations && recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.slice(0, 5).map((rec: any) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          {rec.title}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {rec.description}
                        </p>
                      </div>
                      <RiskBadge level={rec.severity} size="sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No Recommendations"
                description="No remediation suggestions available"
                icon="data"
              />
            )}
          </CardContent>
          </Card>
        
      </div>
    </div>
  )
}
