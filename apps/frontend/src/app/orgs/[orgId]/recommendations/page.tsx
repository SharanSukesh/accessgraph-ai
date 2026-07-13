'use client'

/**
 * Recommendations Page
 * Review and manage security recommendations
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  CheckCircle,
  ListChecks,
  Filter,
  Search,
  Download,
  X,
  Check,
  Clock,
  Info,
  ChevronRight,
  ShieldAlert,
  Scale,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge, SeverityBadge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { useRecommendations } from '@/lib/api/hooks/useRecommendations'

export default function RecommendationsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  // 'all' | 'security' | 'equity' — distinguishes anomaly-driven recs from
  // the new GAEA equity-driven track. Default 'all' so existing users see
  // the familiar full list, but the chip row above makes the split obvious.
  const [trackFilter, setTrackFilter] = useState<'all' | 'security' | 'equity'>('all')
  const [selectedRec, setSelectedRec] = useState<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const {
    data: recommendations,
    isLoading,
    error,
  } = useRecommendations(orgId, {
    search,
    severity: severityFilter || undefined,
    status: statusFilter || undefined,
    track: trackFilter === 'all' ? undefined : trackFilter,
  })

  const handleSelectAll = () => {
    if (selectedIds.size === recommendations?.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(recommendations?.map((r: any) => r.id) || []))
    }
  }

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleExport = () => {
    if (!recommendations) return
    const data = recommendations.map((rec: any) => ({
      id: rec.id,
      title: rec.title,
      description: rec.description,
      severity: rec.severity,
      status: rec.status,
      action: rec.action,
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `recommendations-${orgId}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <ErrorState
        message="Failed to load recommendations. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  const pendingCount = recommendations?.filter((r: any) => r.status === 'pending').length || 0
  const inProgressCount = recommendations?.filter((r: any) => r.status === 'in_progress').length || 0
  const completedCount = recommendations?.filter((r: any) => r.status === 'completed').length || 0

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListChecks}
        title="Priority Actions"
        subtitle="Review and act on security recommendations"
        actions={
          <>
            {selectedIds.size > 0 && (
              <Badge variant="info">
                {selectedIds.size} selected
              </Badge>
            )}
            <Button variant="secondary" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Total
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {isLoading ? '...' : recommendations?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <CheckCircle className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Pending
              </p>
              <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
                {isLoading ? '...' : pendingCount}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900">
              <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                In Progress
              </p>
              <p className="mt-2 text-3xl font-bold text-primary-700 dark:text-primary-400">
                {isLoading ? '...' : inProgressCount}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Completed
              </p>
              <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
                {isLoading ? '...' : completedCount}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Track filter chips — distinguishes Security (existing) from Equity (GAEA) */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 mr-1">Track:</span>
        {([
          { value: 'all',      label: 'All',      icon: null },
          { value: 'security', label: 'Security', icon: ShieldAlert },
          { value: 'equity',   label: 'Equity',   icon: Scale },
        ] as const).map((chip) => {
          const active = trackFilter === chip.value
          const Icon = chip.icon
          return (
            <button
              key={chip.value}
              onClick={() => setTrackFilter(chip.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                active
                  ? chip.value === 'equity'
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300'
                    : chip.value === 'security'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-grove-border text-grove-ink dark:bg-primary-900/20 dark:text-grove-ink-dk'
                  : 'bg-primary-50 text-grove-ink/85 dark:bg-primary-900/20 dark:text-grove-ink-dk/70 hover:bg-grove-border dark:hover:bg-primary-900/25'
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/50" />
              <input
                type="text"
                placeholder="Search recommendations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recommendations List */}
        <div className="lg:col-span-2">
          <Card variant="bordered">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {recommendations ? `${recommendations.length} Recommendations` : 'Recommendations'}
                </CardTitle>
                {recommendations && recommendations.length > 0 && (
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    {selectedIds.size === recommendations.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={10} />
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-3">
                  {recommendations.map((rec: any) => (
                    <div
                      key={rec.id}
                      className={`p-4 border rounded-lg transition-all ${
                        selectedRec?.id === rec.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-grove-border dark:border-grove-border-dk hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rec.id)}
                          onChange={() => handleToggleSelect(rec.id)}
                          className="mt-1 rounded border-grove-border text-primary-600 focus:ring-primary-500"
                        />

                        {/* Content */}
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => setSelectedRec(rec)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {/* Track badge — first so it sets the mental model */}
                                {rec.track === 'equity' ? (
                                  <Badge variant="info" size="sm">
                                    <Scale className="h-3 w-3 mr-1 inline" />
                                    Equity
                                  </Badge>
                                ) : (
                                  <Badge variant="danger" size="sm">
                                    <ShieldAlert className="h-3 w-3 mr-1 inline" />
                                    Security
                                  </Badge>
                                )}
                                <SeverityBadge severity={rec.severity} />
                                <Badge
                                  variant={
                                    rec.status === 'completed'
                                      ? 'success'
                                      : rec.status === 'in_progress'
                                      ? 'info'
                                      : rec.status === 'dismissed'
                                      ? 'default'
                                      : 'warning'
                                  }
                                  size="sm"
                                >
                                  {rec.status?.replace(/_/g, ' ')}
                                </Badge>
                              </div>
                              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                                {rec.title}
                              </h3>
                            </div>
                            <ChevronRight className="h-5 w-5 text-grove-ink/50 flex-shrink-0" />
                          </div>
                          <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                            {rec.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No Recommendations Found"
                  description="No recommendations match your current filters"
                  icon="default"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div className="space-y-6">
          {selectedRec ? (
            <Card variant="bordered">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle>Recommendation Details</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRec(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1">
                    Title
                  </div>
                  <div className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                    {selectedRec.title}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1">
                    Severity
                  </div>
                  <SeverityBadge severity={selectedRec.severity} />
                </div>

                <div>
                  <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1">
                    Status
                  </div>
                  <Badge
                    variant={
                      selectedRec.status === 'completed'
                        ? 'success'
                        : selectedRec.status === 'in_progress'
                        ? 'info'
                        : selectedRec.status === 'dismissed'
                        ? 'default'
                        : 'warning'
                    }
                  >
                    {selectedRec.status?.replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div>
                  <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1">
                    Description
                  </div>
                  <div className="text-sm text-grove-ink dark:text-grove-ink-dk">
                    {selectedRec.description}
                  </div>
                </div>

                {selectedRec.action && (
                  <div>
                    <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 mb-1">
                      Recommended Action
                    </div>
                    <div className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                      {selectedRec.action}
                    </div>
                  </div>
                )}

                {selectedRec.affectedUserId && (
                  <div className="pt-4 border-t border-grove-border dark:border-grove-border-dk">
                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full"
                      onClick={() =>
                        router.push(`/orgs/${orgId}/users/${selectedRec.affectedUserId}`)
                      }
                    >
                      View Affected User
                    </Button>
                  </div>
                )}

                <div className="pt-4 border-t border-grove-border dark:border-grove-border-dk space-y-2">
                  <Button size="sm" variant="primary" className="w-full">
                    Mark as In Progress
                  </Button>
                  <Button size="sm" variant="secondary" className="w-full">
                    Mark as Completed
                  </Button>
                  <Button size="sm" variant="ghost" className="w-full">
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Info Card */
            <Card variant="bordered" className="bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-primary-700 dark:text-primary-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-primary-800 dark:text-primary-300">
                    <p className="font-medium mb-1">About Recommendations</p>
                    <p className="text-xs">
                      Recommendations are AI-generated suggestions to improve your security
                      posture. Select a recommendation to view details and take action.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <Card variant="bordered">
              <CardHeader>
                <CardTitle>Bulk Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button size="sm" variant="primary" className="w-full">
                  Mark {selectedIds.size} as In Progress
                </Button>
                <Button size="sm" variant="secondary" className="w-full">
                  Mark {selectedIds.size} as Completed
                </Button>
                <Button size="sm" variant="ghost" className="w-full">
                  Dismiss {selectedIds.size} items
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
