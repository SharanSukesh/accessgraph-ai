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
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'

interface DataInventory {
  snapshots: {
    users: number
    roles: number
    profiles: number
    permission_sets: number
    permission_set_groups: number
    object_permissions: number
    field_permissions: number
    groups: number
    group_members: number
    account_shares: number
    opportunity_shares: number
    team_members: number
    sharing_rules: number
    owd: number
  }
  sync_jobs: number
  audit_logs: number
  anomalies: number
  recommendations: number
  risk_scores: number
}

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

  // Calculate total records
  const totalSnapshots = inventory
    ? Object.values(inventory.snapshots).reduce((sum, count) => sum + count, 0)
    : 0
  const totalAnalysis = (inventory?.anomalies || 0) + (inventory?.recommendations || 0) + (inventory?.risk_scores || 0)
  const totalRecords =
    totalSnapshots +
    (inventory?.sync_jobs || 0) +
    (inventory?.audit_logs || 0) +
    totalAnalysis

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Privacy & Data Management
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          GDPR compliance, data retention policies, and privacy controls
        </p>
      </div>

      {/* Data Inventory Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card variant="bordered" className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Records
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {totalRecords.toLocaleString()}
                </p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Snapshots
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {totalSnapshots.toLocaleString()}
                </p>
              </div>
              <FileText className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Audit Logs
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
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
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Analysis Data
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
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
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <Calendar className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Snapshots
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    User permissions, roles, profiles, sharing rules
                  </p>
                </div>
              </div>
              <Badge variant="info">
                {policies?.snapshots_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <Shield className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Audit Logs
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Security and compliance audit trail
                  </p>
                </div>
              </div>
              <Badge variant="success">
                {policies?.audit_logs_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <Database className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Sync Jobs
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Salesforce sync job history
                  </p>
                </div>
              </div>
              <Badge variant="info">
                {policies?.sync_jobs_days} days
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <CheckCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    Analysis Data
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
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
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">
                Delete Old Snapshots
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
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

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">
                Run All Cleanup Tasks
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
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
            {inventory &&
              Object.entries(inventory.snapshots).map(([key, value]) => (
                <div
                  key={key}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <p className="text-xs text-gray-600 dark:text-gray-400 uppercase">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                    {value.toLocaleString()}
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
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Type <span className="font-mono font-bold">DELETE_ALL_DATA</span> to
                    confirm:
                  </label>
                  <input
                    id="delete-confirmation"
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
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
      <Card variant="bordered" className="bg-gray-50 dark:bg-gray-800/50">
        <CardContent className="py-4">
          <div className="flex items-center justify-center space-x-6 text-sm">
            <a
              href="/legal/privacy"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Privacy Policy
            </a>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <a
              href="/legal/terms"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Terms of Service
            </a>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <a
              href="/legal/security"
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              Security Practices
            </a>
            <span className="text-gray-300 dark:text-gray-600">•</span>
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
