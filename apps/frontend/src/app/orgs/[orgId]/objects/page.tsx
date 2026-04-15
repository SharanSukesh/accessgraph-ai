'use client'

/**
 * Objects Page
 * Browse Salesforce objects and their access patterns
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Database, Search, Filter, Shield, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useObjects } from '@/lib/api/hooks/useObjects'

export default function ObjectsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [search, setSearch] = useState('')
  const [sensitiveFilter, setSensitiveFilter] = useState<string>('')

  const { data: objects, isLoading, error } = useObjects(orgId, {
    search,
    sensitive: sensitiveFilter || undefined,
  })

  if (error) {
    return (
      <ErrorState
        message="Failed to load objects. Please try again."
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
            Salesforce Objects
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Browse objects and analyze access patterns
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Objects
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : objects?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <Database className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Sensitive
              </p>
              <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.isSensitive).length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900">
              <Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Custom
              </p>
              <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.isCustom).length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                With Anomalies
              </p>
              <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.anomalyCount > 0).length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search objects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Sensitive Filter */}
            <select
              value={sensitiveFilter}
              onChange={(e) => setSensitiveFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Objects</option>
              <option value="sensitive">Sensitive Only</option>
              <option value="standard">Standard Only</option>
              <option value="custom">Custom Only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Objects Table */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>
            {objects ? `${objects.length} Objects` : 'Objects'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={10} />
          ) : objects && objects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Object
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      API Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Sensitivity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Users with Access
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Anomalies
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {objects.map((obj: any) => (
                    <tr
                      key={obj.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      onClick={() => router.push(`/orgs/${orgId}/objects/${obj.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Database className="h-5 w-5 text-gray-400 mr-3" />
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {obj.label}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white font-mono">
                          {obj.apiName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={obj.isCustom ? 'info' : 'default'} size="sm">
                          {obj.isCustom ? 'Custom' : 'Standard'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {obj.isSensitive ? (
                          <Badge variant="warning" size="sm">
                            Sensitive
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            Standard
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {obj.userCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {obj.anomalyCount > 0 ? (
                          <Badge variant="danger" size="sm">
                            {obj.anomalyCount}
                          </Badge>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No Objects Found"
              description="No objects match your current filters or data is not yet synced"
              icon="database"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
