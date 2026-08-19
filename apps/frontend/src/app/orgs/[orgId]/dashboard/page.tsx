'use client'

/**
 * Organization Dashboard Page
 * Executive overview of access health
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, AlertTriangle, Shield, Database, Sparkles, Info, LayoutDashboard, ArrowRight } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { MetricCard } from '@/components/shared/MetricCard'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { RiskBadge, StatusBadge, Badge } from '@/components/shared/Badge'
// Grove Refined — motion + chart primitives ported from the /v2
// prototype. Presentational only.
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import { ScoreRing, Sparkline } from '@/components/v2/primitives'
import { useUsers } from '@/lib/api/hooks/useUsers'
import { useAnomalies, useTopAnomalousUsers } from '@/lib/api/hooks/useAnomalies'
import { useRecommendations } from '@/lib/api/hooks/useRecommendations'
import { useSyncJobs, useAnalyzeOrg } from '@/lib/api/hooks/useOrgs'
import { useOrgAnalyzerLatest, useOrgAnalyzerHistory } from '@/lib/api/hooks/useOrgAnalyzer'

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

  // Grove Refined hero — health score + savings from the latest Health
  // Report snapshot. Read-only; not part of the page's loading gate so
  // a missing/slow analyzer summary never blocks the dashboard.
  const { data: analyzerSummary } = useOrgAnalyzerLatest(orgId)
  const { data: analyzerHistory } = useOrgAnalyzerHistory(orgId)

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

  // Hero inputs — all optional; the hero renders only when the org has
  // at least one Health Report snapshot.
  const healthScore: number | undefined = analyzerSummary?.metrics?.org_health_score
  const savingsCents = analyzerSummary?.active_savings_cents ?? 0
  const findingsTrend = (analyzerHistory ?? [])
    .slice()
    .reverse()
    .map((h) => h.findings_count)

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
      <Reveal>
        <PageHeader
          icon={LayoutDashboard}
          eyebrow="Engagement overview"
          title="Overview"
          subtitle="Access health overview for your organization"
          actions={
            (!anomalies?.length && !recommendations?.length) && (
              <Button
                variant="primary"
                onClick={handleAnalyze}
                disabled={analyzeOrg.isPending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {analyzeOrg.isPending ? 'Analyzing...' : 'Analyze Access'}
              </Button>
            )
          }
        />
      </Reveal>

      {/* Grove Refined hero — health score + identified savings from the
          latest Health Report. Renders only when a snapshot exists;
          purely presentational (data via existing read-only hooks). */}
      {analyzerSummary?.has_data && (
        <Reveal delay={0.05}>
          <Card variant="bordered" className="v2-card-hero p-8">
            <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center">
              <div className="flex items-center gap-8">
                {healthScore != null && (
                  <>
                    <ScoreRing score={Math.round(healthScore)} label="Health score" />
                    <div className="hidden h-24 w-px bg-grove-ink/15 dark:bg-grove-ink-dk/25 sm:block" />
                  </>
                )}
                <div>
                  <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                    Identified annual savings
                  </p>
                  <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    <CountUp
                      value={Math.round(savingsCents / 100)}
                      format={(n) => `$${Math.round(n).toLocaleString()}`}
                    />
                  </p>
                  <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                    across {analyzerSummary.active_findings_count} active findings
                  </p>
                </div>
              </div>
              <div className="lg:ml-auto">
                {findingsTrend.length >= 2 && (
                  <>
                    <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">
                      Findings trend · {findingsTrend.length} runs
                    </p>
                    <Sparkline data={findingsTrend} className="h-16 w-48" />
                  </>
                )}
                <Link
                  href={`/orgs/${orgId}/org-analyzer`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400"
                >
                  Open Health Report <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Sync Status Banner */}
      {latestSync && (
        <Card variant="bordered" className="bg-primary-50 dark:bg-primary-900/15 border-primary-200 dark:border-primary-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <StatusBadge status={latestSync.status} />
                <span className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                  Last sync: {new Date(latestSync.completed_at || latestSync.started_at).toLocaleString()}
                </span>
                {aiAnalysis && (
                  <>
                    <span className="text-grove-border dark:text-grove-ink-dk/85">•</span>
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
                <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                  {latestSync.summary.usersProcessed || 0} users processed
                </span>
              )}
            </div>

            {/* AI Analysis Details */}
            {showAnalysisInfo && aiAnalysis && (
              <div className="mt-3 pt-3 border-t border-primary-200 dark:border-primary-800">
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
                    <span className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
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
      <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StaggerItem>
          <MetricCard
            title="Total Users"
            value={totalUsers}
            icon={Users}
            iconColor="text-primary-700 dark:text-primary-400"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="High-Risk Users"
            value={highRiskUsers}
            icon={Shield}
            iconColor="text-red-600"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Critical Anomalies"
            value={criticalAnomalies}
            icon={AlertTriangle}
            iconColor="text-orange-600"
          />
        </StaggerItem>
        <StaggerItem>
          <MetricCard
            title="Recommendations"
            value={totalRecommendations}
            icon={Database}
            iconColor="text-green-600"
          />
        </StaggerItem>
      </Stagger>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Anomalous Users */}
        <Reveal>
          <Card variant="bordered" className="h-full">
          <CardHeader>
            <CardTitle>Top Anomalous Users</CardTitle>
          </CardHeader>
          <CardContent>
            {topAnomalies && topAnomalies.length > 0 ? (
              <div className="space-y-3">
                {topAnomalies.map((anomaly: any) => (
                  <div
                    key={anomaly.userId}
                    className="flex items-center justify-between p-3 rounded-lg bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                        {anomaly.userName}
                      </p>
                      <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                        {anomaly.userEmail}
                      </p>
                      {anomaly.topReasons && anomaly.topReasons.length > 0 && (
                        <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                          {anomaly.topReasons[0]}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                          {anomaly.anomalyScore.toFixed(1)}
                        </p>
                        <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
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
        </Reveal>

        {/* Recent Recommendations */}
        <Reveal delay={0.08}>
          <Card variant="bordered" className="h-full">
          <CardHeader>
            <CardTitle>Recent Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {recommendations && recommendations.length > 0 ? (
              <div className="space-y-3">
                {recommendations.slice(0, 5).map((rec: any) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-lg bg-primary-50/40 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-grove-ink dark:text-grove-ink-dk text-sm">
                          {rec.title}
                        </p>
                        <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1">
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
        </Reveal>
      </div>
    </div>
  )
}
