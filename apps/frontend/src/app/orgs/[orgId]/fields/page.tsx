'use client'

/**
 * Fields Page
 * Browse Salesforce fields with alphabetical filtering and pagination
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FileText, Search, Filter, Shield, Database, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useFields } from '@/lib/api/hooks/useFields'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function FieldsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [search, setSearch] = useState('')
  const [objectFilter, setObjectFilter] = useState<string>('')
  const [selectedLetter, setSelectedLetter] = useState<string>('')
  const [page, setPage] = useState(1)
  const limit = 100

  const { data, isLoading, error } = useFields(orgId, {
    search: search || undefined,
    objectName: objectFilter || undefined,
    startsWith: selectedLetter || undefined,
    page,
    limit,
  })

  const fields = data?.fields || []
  const pagination = data?.pagination

  const handleLetterClick = (letter: string) => {
    if (selectedLetter === letter) {
      setSelectedLetter('')
    } else {
      setSelectedLetter(letter)
    }
    setPage(1) // Reset to first page
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) {
    return (
      <ErrorState
        message="Failed to load fields. Please try again."
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
            Salesforce Fields
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Browse fields and analyze field-level security
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Fields
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : pagination?.total || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <FileText className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Current Page
              </p>
              <p className="mt-2 text-3xl font-bold text-blue-600 dark:text-blue-400">
                {isLoading ? '...' : fields.length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
              <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Pages
              </p>
              <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                {isLoading ? '...' : `${pagination?.page || 1}/${pagination?.totalPages || 1}`}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Alphabetical Filter */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Filter by Starting Letter</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedLetter === '' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleLetterClick('')}
              className="min-w-[60px]"
            >
              All
            </Button>
            {ALPHABET.map((letter) => (
              <Button
                key={letter}
                variant={selectedLetter === letter ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => handleLetterClick(letter)}
                className="w-10 h-10 p-0 font-semibold"
              >
                {letter}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Object Filter */}
            <input
              type="text"
              placeholder="Filter by object..."
              value={objectFilter}
              onChange={(e) => {
                setObjectFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent md:w-64"
            />
          </div>
        </CardContent>
      </Card>

      {/* Fields Table */}
      <Card variant="bordered">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {selectedLetter
                ? `Fields starting with "${selectedLetter}"`
                : 'All Fields'
              }
            </CardTitle>
            {pagination && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={15} />
          ) : fields && fields.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Field
                      </th>
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
                        Properties
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Users
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {fields.map((field: any) => (
                      <tr
                        key={field.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        onClick={() => router.push(`/orgs/${orgId}/fields/${encodeURIComponent(field.id)}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="h-5 w-5 text-gray-400 mr-3" />
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {field.label}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-gray-400" />
                            <div className="text-sm text-gray-900 dark:text-white">
                              {field.objectName}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 dark:text-white font-mono">
                            {field.apiName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant="default" size="sm">
                            {field.dataType}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {field.isSensitive && (
                              <Badge variant="warning" size="sm">
                                Sensitive
                              </Badge>
                            )}
                            {field.isEncrypted && (
                              <Badge variant="success" size="sm">
                                Encrypted
                              </Badge>
                            )}
                            {field.isCustom && (
                              <Badge variant="info" size="sm">
                                Custom
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white font-semibold">
                          {field.userCount || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-2">
                    {/* Show page numbers */}
                    {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
                      let pageNum: number
                      if (pagination.totalPages <= 7) {
                        pageNum = i + 1
                      } else if (page <= 4) {
                        pageNum = i + 1
                      } else if (page >= pagination.totalPages - 3) {
                        pageNum = pagination.totalPages - 6 + i
                      } else {
                        pageNum = page - 3 + i
                      }

                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'primary' : 'ghost'}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="w-10 h-10 p-0"
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!pagination.hasMore}
                    className="flex items-center gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="No Fields Found"
              description={
                selectedLetter
                  ? `No fields start with "${selectedLetter}". Try selecting a different letter.`
                  : "No fields match your current filters or data is not yet synced"
              }
              icon="file-text"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
