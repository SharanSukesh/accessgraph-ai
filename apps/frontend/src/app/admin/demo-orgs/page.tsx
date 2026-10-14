'use client'

/**
 * Admin — Demo orgs.
 *
 * A demo org holds synthetic data from a committed fixture and never a
 * Salesforce connection. Admin only (the backend's require_admin is the
 * perimeter; the sidebar item is UX gating).
 *
 *   - List / fixtures → GET    /admin/demo-orgs
 *   - Create          → POST   /admin/demo-orgs  (then syncs the fixture)
 *   - Delete          → DELETE /admin/demo-orgs/{id}
 */

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Loader2, Trash2, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { Card } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { Pill } from '@/components/v2/primitives'
import { apiClient } from '@/lib/api/client'
import { orgKeys } from '@/lib/api/hooks/useOrgs'

interface DemoFixture {
  key: string
  org_name: string
  description: string
}

interface DemoOrgRow {
  id: string
  name: string
  fixture: string
  created_at: string | null
  last_sync_status: string | null
}

interface DemoOrgList {
  fixtures: DemoFixture[]
  orgs: DemoOrgRow[]
}

const QUERY_KEY = ['admin', 'demo-orgs']

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

export default function DemoOrgsPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery<DemoOrgList>({
    queryKey: QUERY_KEY,
    queryFn: () => apiClient.get<DemoOrgList>('/admin/demo-orgs'),
    // Keep polling while a new org's first sync is still running.
    refetchInterval: (query) =>
      query.state.data?.orgs.some((o) => o.last_sync_status === 'pending' || o.last_sync_status === 'running')
        ? 5000
        : false,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY })
    qc.invalidateQueries({ queryKey: orgKeys.lists() })
  }

  const create = useMutation({
    mutationFn: (fixture: string) => apiClient.post('/admin/demo-orgs', { fixture }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/demo-orgs/${id}`),
    onSuccess: refresh,
  })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  if (error) {
    return (
      <ErrorState
        message="You need admin privileges to view this page."
        onRetry={() => window.location.reload()}
      />
    )
  }

  const usedFixtures = new Set((data?.orgs ?? []).map((o) => o.fixture))

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon={FlaskConical}
          title="Demo orgs"
          eyebrow="Admin · demonstrations"
          subtitle="Synthetic orgs for demonstrations. They load from a committed fixture, never connect to Salesforce, and are labelled Demo data in the app and on every PDF page."
        />
      </Reveal>

      <Reveal>
        <Card variant="bordered" className="p-6">
          <h2 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">Create a demo org</h2>
          <div className="mt-4 space-y-3">
            {(data?.fixtures ?? []).map((f) => (
              <div
                key={f.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-grove-border p-3 dark:border-grove-border-dk"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">{f.org_name}</p>
                  <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">{f.description}</p>
                </div>
                <Button
                  size="sm"
                  disabled={create.isPending || usedFixtures.has(f.key)}
                  onClick={() => create.mutate(f.key)}
                  title={usedFixtures.has(f.key) ? 'Already created. Delete it below to recreate it.' : undefined}
                >
                  {create.isPending && create.variables === f.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="ml-1">Create</span>
                </Button>
              </div>
            ))}
            {isLoading && <p className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">Loading…</p>}
            {create.error && (
              <p className="text-sm text-red-700 dark:text-red-400">{errorText(create.error)}</p>
            )}
          </div>
        </Card>
      </Reveal>

      <Reveal>
        <Card variant="bordered" className="p-6">
          <h2 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">Existing demo orgs</h2>
          {data && data.orgs.length === 0 && (
            <p className="mt-3 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">None yet.</p>
          )}
          <ul className="mt-3 divide-y divide-grove-border dark:divide-grove-border-dk">
            {(data?.orgs ?? []).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/orgs/${o.id}/dashboard`}
                    className="truncate text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
                  >
                    {o.name}
                  </Link>
                  <Pill tone="copper">Demo data</Pill>
                  {o.last_sync_status && <Pill>Sync {o.last_sync_status}</Pill>}
                </div>
                {confirmingId === o.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
                      Delete this demo org and all its results?
                    </span>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(o.id, { onSettled: () => setConfirmingId(null) })}
                    >
                      {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingId(o.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-1">Delete</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {remove.error && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errorText(remove.error)}</p>
          )}
        </Card>
      </Reveal>
    </div>
  )
}
