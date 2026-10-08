'use client'

/**
 * /orgs — client-org picker.
 *
 * Lists the client orgs the signed-in user may open (admins: all) and,
 * for roles that can write, the Salesforce connect buttons. Renders
 * bare like /start (see AppLayout); picking an org enters the full
 * workspace at /orgs/{id}/dashboard.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Building2,
  ArrowRight,
  ArrowLeft,
  Plus,
  FlaskConical,
  LogOut,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/shared/Button'
import { OrgEnvPill } from '@/components/shared/OrgEnvPill'
import { Eyebrow, Pill } from '@/components/v2/primitives'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { useAuth } from '@/lib/auth/AuthContext'
import type { Organization } from '@/lib/api/hooks/useOrgs'
import { formatRelativeTime } from '@/lib/utils/formatters'

export default function OrgsPage() {
  const router = useRouter()
  const { user, orgs, isLoading, isAuthenticated, canWrite, connectSalesforce, logout } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login?redirect=/orgs')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-grove-canvas/80 px-4 py-12 dark:bg-grove-canvas-dk/80">
      <div className="mx-auto w-full max-w-3xl">
        <Reveal>
          <div className="mb-8 flex items-center justify-between">
            <Logo variant="full" size="md" />
            <Link
              href="/start"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-grove-ink/60 transition-colors hover:text-primary-700 dark:text-grove-ink-dk/60 dark:hover:text-primary-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Switch engagement
            </Link>
          </div>

          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Client orgs</Eyebrow>
              <h1 className="v2-display mt-2 text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                Which org are we working in?
              </h1>
            </div>
            {canWrite && orgs.length > 0 && (
              <ConnectButtons onConnect={connectSalesforce} />
            )}
          </div>
        </Reveal>

        {orgs.length === 0 ? (
          <Reveal>
            <div className="v2-card flex flex-col items-center p-10 text-center">
              <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-800">
                <Building2 className="h-5 w-5" />
              </span>
              {canWrite ? (
                <>
                  <h2 className="v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Connect your first client org
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                    Sign in to the client&apos;s Salesforce org to grant Newton read access. The
                    first sync starts automatically.
                  </p>
                  <div className="mt-6">
                    <ConnectButtons onConnect={connectSalesforce} />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Nothing here yet
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                    No client orgs have been shared with you yet. Ask an admin.
                  </p>
                </>
              )}
            </div>
          </Reveal>
        ) : (
          <Stagger className="space-y-3">
            {orgs.map((org) => (
              <StaggerItem key={org.id}>
                <OrgRow org={org} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        <div className="mt-10 flex items-center justify-center gap-3 text-xs text-grove-ink/45 dark:text-grove-ink-dk/45">
          <span>Signed in as {user?.email}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1 font-medium transition-colors hover:text-copper-700 dark:hover:text-copper-400"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function ConnectButtons({
  onConnect,
}: {
  onConnect: (env: 'production' | 'sandbox') => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="sm" onClick={() => onConnect('production')}>
        <Plus className="mr-1.5 h-4 w-4" />
        Connect production org
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onConnect('sandbox')}>
        <FlaskConical className="mr-1.5 h-4 w-4" />
        Connect sandbox
      </Button>
    </div>
  )
}

const SYNC_STATUS_LABELS: Record<string, string> = {
  completed: 'completed',
  failed: 'failed',
  running: 'running',
  pending: 'queued',
  partial: 'partially completed',
}

function OrgRow({ org }: { org: Organization }) {
  return (
    <Link
      href={`/orgs/${org.id}/dashboard`}
      className="group flex items-center gap-4 rounded-2xl border border-grove-border bg-grove-surface p-5 shadow-grove-lift transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-400/60 hover:shadow-grove-hero dark:border-grove-border-dk dark:bg-grove-surface-dk"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-800">
        <Building2 className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-semibold text-grove-ink dark:text-grove-ink-dk">
            {org.name}
          </h2>
          <OrgEnvPill isSandbox={org.is_sandbox} />
          {org.is_demo ? (
            <Pill>Demo</Pill>
          ) : org.is_connected ? (
            <Pill tone="mint">Connected</Pill>
          ) : (
            <Pill tone="copper">Needs reconnect</Pill>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
          {org.domain || org.instance_url || 'No Salesforce domain'}
          <span aria-hidden> · </span>
          {org.last_sync_at
            ? `Last sync ${formatRelativeTime(org.last_sync_at)}${
                org.last_sync_status
                  ? ` (${SYNC_STATUS_LABELS[org.last_sync_status] ?? org.last_sync_status})`
                  : ''
              }`
            : 'Never synced'}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-grove-ink/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-copper-600 dark:text-grove-ink-dk/40 dark:group-hover:text-copper-400" />
    </Link>
  )
}
