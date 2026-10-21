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
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { Pagination } from '@/components/shared/Pagination'
import { ListSearch } from '@/components/shared/ListSearch'
import { SortHeader } from '@/components/shared/SortHeader'
import { EncryptionBadge } from '@/components/schema/FieldMetadata'
import { DocumentationDownload } from '@/components/schema/DocumentationDownload'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export function FieldsView({ embedded = false }: { embedded?: boolean } = {}) {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  // Paged by the server; page, size, sort, search, object and letter live in the URL (f.*).
  const { state, update } = useListState('f', { sort: 'apiName', filters: ['object_type', 'starts_with'] })
  const { data, isLoading, error } = usePaged<any>(['fields', orgId], `/orgs/${orgId}/fields`, state)
  const fields = data?.items || []
  // Field types come from the synced describe; the column appears only when some are known.
  const showType = fields.some((f: any) => f.dataType)
  const schemaNotes: string[] = data?.schemaNotes || []
  const selectedLetter = state.filters.starts_with || ''
  const sortProps = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }), className: 'px-6 py-3' }

  const handleLetterClick = (letter: string) => {
    update({ filters: { starts_with: selectedLetter === letter ? '' : letter } })
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
      {!embedded && <PageHeader
        icon={FileText}
        title="Salesforce Fields"
        subtitle="Browse fields and analyze field-level security"
        actions={<DocumentationDownload orgId={orgId} />}
      />}

      {/* Summary Cards */}
      <Reveal>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Total Fields
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {isLoading ? '...' : data?.total || 0}
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
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                On this page
              </p>
              <p className="mt-2 text-3xl font-bold text-primary-700 dark:text-primary-400">
                {isLoading ? '...' : fields.length}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25">
              <Database className="h-6 w-6 text-primary-700 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Pages
              </p>
              <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                {isLoading ? '...' : `${data?.page || 1}/${data?.pages || 1}`}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
      </div>
      </Reveal>

      {/* Alphabetical Filter */}
      <Reveal delay={0.05}>
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
      </Reveal>

      {/* Filters */}
      <Reveal delay={0.1}>
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search fields..." />
            <div className="md:w-64">
              <ListSearch
                value={state.filters.object_type || ''}
                onChange={(v) => update({ filters: { object_type: v } })}
                placeholder="Filter by object..."
              />
            </div>
          </div>
        </CardContent>
      </Card>
      </Reveal>

      {/* Fields Table */}
      <Reveal delay={0.15}>
      {schemaNotes.length > 0 && (
        <div className="rounded-lg px-4 py-3 text-sm bg-grove-surface dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink/75 dark:text-grove-ink-dk/75 space-y-1">
          {schemaNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </div>
      )}

      <Card variant="bordered">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {selectedLetter
                ? `Fields starting with "${selectedLetter}"`
                : 'All Fields'
              }
            </CardTitle>
            {data && (
              <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                {data.total.toLocaleString('en-US')} fields
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
                  <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                    <tr>
                      <SortHeader label="Field" column="label" {...sortProps} />
                      <SortHeader label="Object" column="object" {...sortProps} />
                      <SortHeader label="API Name" column="apiName" {...sortProps} />
                      {showType && <SortHeader label="Type" column="type" {...sortProps} />}
                      <th className="px-6 py-3 text-left v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                        Properties
                      </th>
                      <SortHeader label="Users with Read" column="users" align="right" {...sortProps} />
                    </tr>
                  </thead>
                  <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                    {fields.map((field: any) => (
                      <tr
                        key={field.id}
                        className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15 cursor-pointer transition-colors"
                        onClick={() => router.push(`/orgs/${orgId}/fields/${encodeURIComponent(field.id)}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="h-5 w-5 text-grove-ink/50 dark:text-grove-ink-dk/50 mr-3" />
                            <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                              {field.label}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-grove-ink/50 dark:text-grove-ink-dk/50" />
                            <div className="text-sm text-grove-ink dark:text-grove-ink-dk">
                              {field.objectName}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-grove-ink dark:text-grove-ink-dk font-mono">
                            {field.apiName}
                          </div>
                        </td>
                        {showType && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.dataType && (
                              <Badge variant="default" size="sm">
                                {field.typeLabel || field.dataType}
                              </Badge>
                            )}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {field.isSensitive && (
                              <Badge variant="warning" size="sm">
                                Sensitive
                              </Badge>
                            )}
                            <EncryptionBadge encryption={field.encryption} />
                            {field.isCustom && (
                              <Badge variant="info" size="sm">
                                Custom
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-grove-ink dark:text-grove-ink-dk font-semibold">
                          {field.userCount === null ? '—' : field.userCount.toLocaleString('en-US')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={data!.page}
                pageSize={data!.page_size}
                total={data!.total}
                label="fields"
                onPage={(page) => update({ page })}
                onPageSize={(pageSize) => update({ pageSize })}
              />
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
      </Reveal>
    </div>
  )
}
