/**
 * Compliance Scorecards API hooks — Roadmap #8.
 *
 * One-click regulatory framework scoring. All frameworks read from
 * signals Newton already computes (Health Report findings, Access +
 * Session Anomalies, License Fit, Integration Sprawl) so a scorecard
 * run is a handful of DB queries — sub-second on a typical org.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ---------------------------------------------------------------- types

export type ComplianceStatus = 'passed' | 'failed' | 'not_applicable'

export interface ComplianceFramework {
  framework: string           // 'SOX' | 'SOC2' | 'HIPAA' | 'GDPR' | 'PCI'
  label: string               // human-readable long form
  control_count: number
}

export interface ComplianceControlResult {
  control_id: string          // e.g., 'SOX-404-ITGC-3.1'
  name: string
  section: string
  description: string
  status: ComplianceStatus
  passed: boolean
  metric: string              // short header ("3 users flagged")
  metric_value: number
  evidence: string[]
  recommendation: string
  deep_link?: string | null   // in-app path to the underlying surface
}

export interface ComplianceScorecardRun {
  run_id: string | null
  framework: string
  label: string
  snapshot_at: string | null
  duration_ms: number | null
  controls_total: number
  controls_passed: number
  controls_failed: number
  controls_not_applicable: number
  score_pct: number
  results: ComplianceControlResult[]
  has_data: boolean
}

// ---------------------------------------------------------------- keys

export const complianceKeys = {
  all: ['compliance'] as const,
  frameworks: (orgId: string) =>
    [...complianceKeys.all, 'frameworks', orgId] as const,
  latest: (orgId: string, framework: string) =>
    [...complianceKeys.all, 'latest', orgId, framework] as const,
}

// ---------------------------------------------------------------- hooks

export function useComplianceFrameworks(orgId: string) {
  return useQuery({
    queryKey: complianceKeys.frameworks(orgId),
    queryFn: () =>
      apiClient.get<ComplianceFramework[]>(endpoints.complianceFrameworks(orgId)),
    enabled: !!orgId,
    staleTime: 60 * 60 * 1000, // 1h — the framework list is static per build
  })
}

export function useLatestScorecard(orgId: string, framework: string) {
  return useQuery({
    queryKey: complianceKeys.latest(orgId, framework),
    queryFn: () =>
      apiClient.get<ComplianceScorecardRun>(
        endpoints.complianceLatest(orgId, framework),
      ),
    enabled: !!orgId && !!framework,
  })
}

export function useRunScorecard(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (framework: string) =>
      apiClient.post<ComplianceScorecardRun>(
        endpoints.complianceRun(orgId, framework),
      ),
    onSuccess: (data) => {
      qc.setQueryData(complianceKeys.latest(orgId, data.framework), data)
    },
  })
}
