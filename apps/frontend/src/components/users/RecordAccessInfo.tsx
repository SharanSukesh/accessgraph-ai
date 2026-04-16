'use client'

/**
 * Record Access Information Component
 * Displays record-level access information for a user
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { AlertCircle, CheckCircle, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'

interface RecordAccessInfoProps {
  userId: string
  orgId: string
}

export function RecordAccessInfo({ userId, orgId }: RecordAccessInfoProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['record-access', orgId, userId],
    queryFn: async () => {
      return await apiClient.get<any>(`/orgs/${orgId}/users/${userId}/record-access`)
    },
  })

  if (isLoading) {
    return <TableSkeleton rows={5} />
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Failed to load record access information</p>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { recordAccessSummary, implementationNote, nextSteps } = data

  return (
    <div className="space-y-6">
      {/* User Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">
              Record-Level Access for {data.userName}
            </h3>
            {data.role && (
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Role: {data.role}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Access Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Owned Records */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Owned Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.ownedRecords.description}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 mt-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                {recordAccessSummary.ownedRecords.example}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {recordAccessSummary.ownedRecords.note}
            </p>
          </CardContent>
        </Card>

        {/* Role Hierarchy Access */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              Role Hierarchy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.roleHierarchyAccess.description}
            </p>
            <div className="mt-3 space-y-1">
              {recordAccessSummary.roleHierarchyAccess.requiresData.map((req: string, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  {req}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              {recordAccessSummary.roleHierarchyAccess.note}
            </p>
          </CardContent>
        </Card>

        {/* Sharing Rules */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Sharing Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.sharingRules.description}
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 mt-3">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                {recordAccessSummary.sharingRules.example}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {recordAccessSummary.sharingRules.note}
            </p>
          </CardContent>
        </Card>

        {/* Manual Shares */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-cyan-600" />
              Manual Shares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.manualShares.description}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {recordAccessSummary.manualShares.note}
            </p>
          </CardContent>
        </Card>

        {/* Team Access */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-amber-600" />
              Team Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.teamAccess.description}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {recordAccessSummary.teamAccess.note}
            </p>
          </CardContent>
        </Card>

        {/* Territory Access */}
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Territory Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              {recordAccessSummary.territoryAccess.description}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {recordAccessSummary.territoryAccess.note}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Implementation Note */}
      <Card variant="bordered" className="bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <AlertCircle className="h-5 w-5" />
            Implementation Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line mb-4">
            {implementationNote}
          </p>
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Next Steps:
            </h4>
            <ul className="space-y-2">
              {nextSteps.map((step: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                  <Badge variant="warning" size="sm" className="mt-0.5">
                    {idx + 1}
                  </Badge>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
