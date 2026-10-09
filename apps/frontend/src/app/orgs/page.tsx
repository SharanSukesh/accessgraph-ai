'use client'

/**
 * /orgs — client-org picker.
 *
 * Lists the client orgs the signed-in user may open (admins: all) and,
 * for roles that can write, the Salesforce connect dialog (environment
 * and privacy level). Renders
 * bare like /start (see AppLayout); picking an org enters the full
 * workspace at /orgs/{id}/dashboard.
 */

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  Pencil,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Button } from '@/components/shared/Button'
import { OrgEnvPill } from '@/components/shared/OrgEnvPill'
import { Eyebrow, Pill } from '@/components/v2/primitives'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { PrivacyLevelPicker } from '@/components/shared/PrivacyLevelPicker'
import {
  useAuth,
  type ConnectSalesforceOptions,
  type SalesforceEnv,
} from '@/lib/auth/AuthContext'
import { PRIVACY_LEVELS, privacyModeOf, type PrivacyMode } from '@/lib/privacy'
import { cn } from '@/lib/utils/cn'
import { orgKeys, type Organization } from '@/lib/api/hooks/useOrgs'
import { apiClient } from '@/lib/api/client'
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
              <ConnectOrgButton onConnect={connectSalesforce} />
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
                    <ConnectOrgButton onConnect={connectSalesforce} />
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
                <OrgRow org={org} canRename={canWrite} />
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

function ConnectOrgButton({
  onConnect,
}: {
  onConnect: (env: SalesforceEnv, opts: ConnectSalesforceOptions) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-4 w-4" />
        Connect a Salesforce org
      </Button>
      {open && <ConnectOrgDialog onConnect={onConnect} onClose={() => setOpen(false)} />}
    </>
  )
}

function ConnectOrgDialog({
  onConnect,
  onClose,
}: {
  onConnect: (env: SalesforceEnv, opts: ConnectSalesforceOptions) => void
  onClose: () => void
}) {
  const [env, setEnv] = useState<SalesforceEnv>('production')
  const [privacy, setPrivacy] = useState<PrivacyMode>('full')
  const [aggregates, setAggregates] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-org-title"
        className="v2-card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <Eyebrow>New client org</Eyebrow>
            <h2
              id="connect-org-title"
              className="v2-display mt-1.5 text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk"
            >
              Connect a Salesforce org
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-grove-ink/50 hover:bg-grove-border/40 hover:text-grove-ink dark:text-grove-ink-dk/50 dark:hover:text-grove-ink-dk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            onConnect(env, { privacy, aggregates: privacy === 'metadata_only' && aggregates })
          }}
          className="space-y-5"
        >
          <fieldset>
            <legend className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">
              Environment
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {ENVIRONMENTS.map(({ value, label, hint, icon: Icon }) => {
                const selected = env === value
                return (
                  <label
                    key={value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 transition-colors duration-150',
                      'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1',
                      selected
                        ? 'border-primary-500/70 bg-primary-50/70 dark:border-primary-600 dark:bg-primary-900/20'
                        : 'border-grove-border bg-grove-surface hover:border-primary-300 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:hover:border-primary-700',
                    )}
                  >
                    <input
                      type="radio"
                      name="connect-env"
                      value={value}
                      checked={selected}
                      onChange={() => setEnv(value)}
                      className="sr-only"
                    />
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        selected ? 'text-primary-700 dark:text-primary-400' : 'text-grove-ink/50 dark:text-grove-ink-dk/50',
                      )}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                        {label}
                      </span>
                      <span className="block text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">
              Privacy level
            </legend>
            <PrivacyLevelPicker
              name="connect-privacy"
              value={privacy}
              onChange={setPrivacy}
              aggregates={aggregates}
              onAggregatesChange={setAggregates}
            />
            <p className="mt-2 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Agree the level with the client first. An org admin can change it later on the
              Privacy page.
            </p>
          </fieldset>

          <p className="flex items-start gap-2 rounded-lg bg-copper-50/70 px-3 py-2.5 text-xs leading-relaxed text-copper-800 dark:bg-copper-900/20 dark:text-copper-300">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="font-semibold">Use a read-only integration user.</strong> Sign in
              to Salesforce as the client&apos;s dedicated integration user, not a personal admin
              account. See the client onboarding guide.
            </span>
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Continue to Salesforce
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const ENVIRONMENTS: {
  value: SalesforceEnv
  label: string
  hint: string
  icon: typeof Building2
}[] = [
  { value: 'production', label: 'Production', hint: 'login.salesforce.com', icon: Building2 },
  { value: 'sandbox', label: 'Sandbox', hint: 'test.salesforce.com', icon: FlaskConical },
]

const SYNC_STATUS_LABELS: Record<string, string> = {
  completed: 'completed',
  failed: 'failed',
  running: 'running',
  pending: 'queued',
  partial: 'partially completed',
}

function OrgRow({ org, canRename }: { org: Organization; canRename: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(org.name)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || name.trim() === org.name) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await apiClient.patch(`/orgs/${org.id}`, { name: name.trim() })
      await queryClient.invalidateQueries({ queryKey: orgKeys.all })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="flex items-center gap-3 rounded-2xl border border-primary-400/60 bg-grove-surface p-5 dark:bg-grove-surface-dk"
      >
        <input
          autoFocus
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          aria-label="Client org name"
          className="flex-1 rounded-lg border border-grove-border bg-transparent px-3 py-2 text-base font-semibold text-grove-ink dark:border-grove-border-dk dark:text-grove-ink-dk"
        />
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    )
  }

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
          {canRename && (
            <button
              type="button"
              aria-label={`Rename ${org.name}`}
              title="Rename"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setName(org.name)
                setEditing(true)
              }}
              className="rounded p-1 text-grove-ink/40 hover:bg-grove-border/40 hover:text-grove-ink dark:text-grove-ink-dk/40 dark:hover:text-grove-ink-dk"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <OrgEnvPill isSandbox={org.is_sandbox} />
          {org.is_demo ? (
            <Pill>Demo</Pill>
          ) : org.is_connected ? (
            <Pill tone="mint">Connected</Pill>
          ) : (
            <Pill tone="copper">Needs reconnect</Pill>
          )}
          {!org.is_demo && org.is_connected && <PosturePill posture={org.connected_as} />}
          {org.write_back_enabled && <Pill tone="copper">Write-back on</Pill>}
          {privacyModeOf(org) !== 'full' && (
            <span title={PRIVACY_LEVELS[privacyModeOf(org)].summary}>
              <Pill>{PRIVACY_LEVELS[privacyModeOf(org)].label}</Pill>
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
          {org.domain || org.instance_url || 'No Salesforce domain'}
          {org.connected_as?.username && (
            <>
              <span aria-hidden> · </span>
              Connected as {org.connected_as.username}
            </>
          )}
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


// Steers consultants toward a read-only integration user; see
// docs/CLIENT_ONBOARDING_SECURITY.md.
function PosturePill({ posture }: { posture: Organization['connected_as'] }) {
  if (!posture || posture.assessment_failed) {
    return <Pill>Connection user unverified</Pill>
  }
  if (posture.recommended) {
    return <Pill tone="mint">Integration user</Pill>
  }
  const reasons = [
    ...(posture.elevated_permissions ?? []),
    ...(posture.is_integration_user ? [] : ['not an integration licence']),
  ]
  return (
    <span title={`Connected as ${posture.username ?? 'unknown'}: ${reasons.join(', ')}. Reconnect as a read-only integration user.`}>
      <Pill tone="copper">Elevated connection</Pill>
    </span>
  )
}
