'use client'

/**
 * Organization Dashboard Page
 * Executive overview of access health
 */

import { useState, useEffect } from 'react'
import { Users, AlertTriangle, Shield, Database, Sparkles, Info } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { RiskBadge, StatusBadge, Badge } from '@/components/shared/Badge'
import { useUsers } from '@/lib/api/hooks/useUsers'
import { useAnomalies, useTopAnomalousUsers } from '@/lib/api/hooks/useAnomalies'
import { useRecommendations } from '@/lib/api/hooks/useRecommendations'
import { useSyncJobs, useAnalyzeOrg } from '@/lib/api/hooks/useOrgs'

export default function DashboardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const orgId = params.orgId as string
  const [showAnalysisInfo, setShowAnalysisInfo] = useState(false)
  const [initialSyncTriggered, setInitialSyncTriggered] = useState(false)

  // Check for initial_sync flag
  const shouldInitialSync = searchParams.get('initial_sync') === 'true'

  // Fetch data
  const { data: users, isLoading: usersLoading, error: usersError } = useUsers(orgId)
  const { data: anomalies, isLoading: anomaliesLoading, refetch: refetchAnomalies } = useAnomalies(orgId, {
    severity: 'critical',
  })
  const { data: topAnomalies, isLoading: topAnomaliesLoading, refetch: refetchTopAnomalies } =
    useTopAnomalousUsers(orgId, 5)
  const { data: recommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } =
    useRecommendations(orgId)
  const { data: syncJobs } = useSyncJobs(orgId)

  // Analysis mutation
  const analyzeOrg = useAnalyzeOrg(orgId)

  // Trigger initial sync if needed
  useEffect(() => {
    if (shouldInitialSync && !initialSyncTriggered && orgId) {
      setInitialSyncTriggered(true)
      // Trigger sync via API
      const triggerSync = async () => {
        try {
          const { apiClient } = await import('@/lib/api/client')
          await apiClient.post(`/orgs/${orgId}/sync`)
          console.log('Initial sync triggered successfully')
        } catch (error) {
          console.error('Failed to trigger initial sync:', error)
        }
      }
      triggerSync()
    }
  }, [shouldInitialSync, initialSyncTriggered, orgId])

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
  const aiAnalysis = latestSync?.metadata?.ai_analysis

  // Handle manual analysis trigger
  const handleAnalyze = async () => {
    try {
      await analyzeOrg.mutateAsync()
      // Refetch all AI-related data
      refetchAnomalies()
      refetchTopAnomalies()
      refetchRecommendations()
    } catch (error) {
      console.error('Analysis failed:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Access health overview for your organization
          </p>
        </div>
        {/* Analyze Access Button */}
        {(!anomalies?.length && !recommendations?.length) && (
          <Button
            variant="primary"
            onClick={handleAnalyze}
            disabled={analyzeOrg.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {analyzeOrg.isPending ? 'Analyzing...' : 'Analyze Access'}
          </Button>
        )}
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
                {aiAnalysis && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <button
                      onClick={() => setShowAnalysisInfo(!showAnalysisInfo)}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      AI analyzed
                      <Info className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
              {latestSync.summary && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {latestSync.summary.usersProcessed || 0} users processed
                </span>
              )}
            </div>

            {/* AI Analysis Details */}
            {showAnalysisInfo && aiAnalysis && (
              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm">
                      {aiAnalysis.anomalies_detected || 0} anomalies
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" size="sm">
                      {aiAnalysis.users_scored || 0} users scored
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm">
                      {aiAnalysis.recommendations_generated || 0} recommendations
                    </Badge>
                  </div>
                  {aiAnalysis.analysis_timestamp && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(aiAnalysis.analysis_timestamp).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )}
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
