'use client'

/**
 * Privacy & Data Management Dashboard
 * GDPR compliance, data retention, and privacy controls
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Database,
  Trash2,
  Calendar,
  AlertTriangle,
  Shield,
  FileText,
  CheckCircle,
  Info,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'

// Flat dict returned by GET /orgs/{id}/privacy/inventory. The backend
// (DataRetentionService.get_data_inventory) returns one key per record
// class rather than a nested "snapshots" bucket, so we treat it as a
// map + partition into snapshot vs. non-snapshot keys in-component.
type DataInventory = Record<string, number>

// Keys the backend emits that are NOT snapshot counts. Used to split
// the flat inventory into "snapshots" vs "everything else" for the
// UI. Anything not in this set is treated as a snapshot record type.
const NON_SNAPSHOT_KEYS = new Set([
  'sync_jobs',
  'audit_logs',
  'anomalies',
  'recommendations',
  'risk_scores', // may be absent — safe to list
  'total_records',
])

interface RetentionPolicy {
  snapshots_days: number
  audit_logs_days: number
  sync_jobs_days: number
  analysis_days: number
}

export default function PrivacyPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const queryClient = useQueryClient()
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [showDangerZone, setShowDangerZone] = useState(false)

  // Fetch data inventory
  const {
    data: inventoryData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['privacy-inventory', orgId],
    queryFn: async () => {
      const response = await apiClient.get<{
        organization_id: string
        data_inventory: DataInventory
        retention_policies: RetentionPolicy
      }>(`/orgs/${orgId}/privacy/inventory`)
      return response
    },
  })

  // Delete old snapshots mutation
  const deleteSnapshotsMutation = useMutation({
    mutationFn: async (retentionDays: number) => {
      return await apiClient.delete(
        `/orgs/${orgId}/privacy/snapshots?retention_days=${retentionDays}`
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-inventory', orgId] })
    },
  })

  // Cleanup all old data mutation
  const cleanupAllMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.delete(`/orgs/${orgId}/privacy/cleanup`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-inventory', orgId] })
    },
  })

  // Delete all organization data mutation (GDPR)
  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.delete(
        `/orgs/${orgId}/privacy/all-data?confirm=DELETE_ALL_DATA`
      )
    },
    onSuccess: () => {
      // Redirect to home after deletion
      window.location.href = '/'
    },
  })

  if (error) {
    return (
      <ErrorState
        message="Failed to load privacy data. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  const inventory = inventoryData?.data_inventory
  const policies = inventoryData?.retention_policies

  // Partition the flat inventory dict into snapshot vs non-snapshot
  // keys. The backend emits `total_records` in the same dict; exclude
  // it here since we compute our own total to keep the UI honest even
  // if the backend total ever drifts from the sum of its parts.
  const snapshotEntries = inventory
    ? Object.entries(inventory).filter(
        ([key]) => !NON_SNAPSHOT_KEYS.has(key),
      )
    : []
  const totalSnapshots = snapshotEntries.reduce(
    (sum, [, count]) => sum + (count || 0),
    0,
  )
  const totalAnalysis =
    (inventory?.anomalies || 0) +
    (inventory?.recommendations || 0) +
    (inventory?.risk_scores || 0)
  const totalRecords =
    totalSnapshots +
    (inventory?.sync_jobs || 0) +
    (inventory?.audit_logs || 0) +
    totalAnalysis

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Privacy & Data Management"
        subtitle="GDPR compliance, data retention policies, and privacy controls"
      />

      {/* Data Inventory Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card variant="bordered" className="bg-primary-50 dark:bg-primary-900/15 border-primary-200 dark:border-primary-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                  Total Records
                </p>
                <p className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {totalRecords.toLocaleString()}
                </p>
              </div>
              <Database className="h-8 w-8 text-primary-700" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-copper-50 dark:bg-copper-900/10 border-copper-200 dark:border-copper-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                  Snapshots
                </p>
                <p className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {totalSnapshots.toLocaleString()}
                </p>
              </div>
              <FileText className="h-8 w-8 text-copper-600" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                  Audit Logs
                </p>
                <p className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {(inventory?.audit_logs || 0).toLocaleString()}
                </p>
              </div>
              <Shield className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                  Analysis Data
                </p>
                <p className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {totalAnalysis.toLocaleString()}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention Policies */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Data Retention Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-grove-ink/65 dark:text-grove-ink-dk/65" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Snapshots
                  </p>
                  <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                    User permissions, roles, profiles, sharing rules
                  </p>
                </div>
              </div>
              <Badge variant="info">
                {policies?.snapshots_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-grove-ink/65 dark:text-grove-ink-dk/65" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Audit Logs
                  </p>
                  <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                    Security and compliance audit trail
                  </p>
                </div>
              </div>
              <Badge variant="success">
                {policies?.audit_logs_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <Database className="h-5 w-5 text-grove-ink/65 dark:text-grove-ink-dk/65" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Sync Jobs
                  </p>
                  <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                    Salesforce sync job history
                  </p>
                </div>
              </div>
              <Badge variant="info">
                {policies?.sync_jobs_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-5 w-5 text-grove-ink/65 dark:text-grove-ink-dk/65" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Analysis Data
                  </p>
                  <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                    Anomalies, recommendations, risk scores
                  </p>
                </div>
              </div>
              <Badge variant="warning">
                {policies?.analysis_days} days
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management Actions */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                Delete Old Snapshots
              </p>
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1">
                Remove snapshots older than {policies?.snapshots_days} days to free up storage
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                deleteSnapshotsMutation.mutate(policies?.snapshots_days || 90)
              }
              disabled={deleteSnapshotsMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteSnapshotsMutation.isPending ? 'Deleting...' : 'Delete Old Data'}
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                Run All Cleanup Tasks
              </p>
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1">
                Apply retention policies to all data types (snapshots, audit logs, sync jobs, analysis)
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => cleanupAllMutation.mutate()}
              disabled={cleanupAllMutation.isPending}
            >
              <Database className="h-4 w-4 mr-2" />
              {cleanupAllMutation.isPending ? 'Cleaning...' : 'Cleanup All'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Snapshot Inventory */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Detailed Data Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {snapshotEntries.map(([key, value]) => (
              <div
                key={key}
                className="p-3 bg-primary-50/40 dark:bg-primary-900/10 rounded-lg"
              >
                <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 uppercase">
                  {key.replace(/_/g, ' ')}
                </p>
                <p className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {(value || 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GDPR Danger Zone */}
      <Card variant="bordered" className="border-red-200 dark:border-red-800">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <CardTitle className="text-red-600 dark:text-red-400">
              Danger Zone
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-900 dark:text-red-300">
                    GDPR Right to Erasure (Article 17)
                  </p>
                  <p className="text-sm text-red-800 dark:text-red-400 mt-1">
                    This action will permanently delete ALL data for this organization, including
                    snapshots, audit logs, sync jobs, anomalies, and recommendations. This action
                    cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            {!showDangerZone ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDangerZone(true)}
              >
                Show Delete Options
              </Button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="delete-confirmation"
                    className="block text-sm font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-2"
                  >
                    Type <span className="font-mono font-bold">DELETE_ALL_DATA</span> to
                    confirm:
                  </label>
                  <input
                    id="delete-confirmation"
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="w-full px-3 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="DELETE_ALL_DATA"
                  />
                </div>

                <div className="flex items-center space-x-3">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteAllMutation.mutate()}
                    disabled={
                      deleteConfirmation !== 'DELETE_ALL_DATA' ||
                      deleteAllMutation.isPending
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteAllMutation.isPending
                      ? 'Deleting...'
                      : 'Delete All Organization Data'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowDangerZone(false)
                      setDeleteConfirmation('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legal Links */}
      <Card variant="bordered" className="bg-primary-50/40 dark:bg-primary-900/10">
        <CardContent className="py-4">
          <div className="flex items-center justify-center space-x-6 text-sm">
            <a
              href="/legal/privacy"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Privacy Policy
            </a>
            <span className="text-grove-border dark:text-grove-ink-dk/85">•</span>
            <a
              href="/legal/terms"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Terms of Service
            </a>
            <span className="text-grove-border dark:text-grove-ink-dk/85">•</span>
            <a
              href="/legal/security"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Security Practices
            </a>
            <span className="text-grove-border dark:text-grove-ink-dk/85">•</span>
            <a
              href="/legal/dpa"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Data Processing Agreement
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
