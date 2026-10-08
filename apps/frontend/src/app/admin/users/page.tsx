'use client'

/**
 * Admin — Users management.
 *
 * Only visible to admins (the sidebar nav item is gated on
 * useAuth().isAdmin). If a non-admin visits this route directly,
 * the backend will 403 on every API call and the page just shows
 * an empty list — no client-side redirect needed.
 *
 * Actions:
 *   - Create user  → POST /auth/users → activation email sent
 *   - Resend       → POST /auth/users/{id}/resend-activation
 *   - View list    → GET /auth/users
 *   - Org access   → GET/PUT /auth/users/{id}/orgs (non-admin roles
 *                    only; org_admin sees every client org)
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  UserPlus,
  Mail,
  UserCheck,
  UserX,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Copy,
  Trash2,
  Building2,
  Pencil,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { apiClient } from '@/lib/api/client'
import type { Organization } from '@/lib/api/hooks/useOrgs'
import { useAuth } from '@/lib/auth/AuthContext'
import { cn } from '@/lib/utils/cn'
import { endpoints } from '@/lib/api/endpoints'
import { useFirmBrand, useUpdateFirmBrand } from '@/lib/api/hooks/useOrgAnalyzer'

// ---------------------------------------------------------------- types

interface OrgUserRow {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  is_email_verified: boolean
  invited_at: string | null
  last_login_at: string | null
}

interface CreateUserResponse {
  user: OrgUserRow
  activation_url_for_admin: string | null
}

interface CreateUserBody {
  email: string
  name?: string
  role: 'org_admin' | 'analyst' | 'viewer' | 'auditor'
  org_ids: string[]
}

interface OrgAccess {
  org_ids: string[]
}

// ---------------------------------------------------------------- page

export default function AdminUsersPage() {
  const qc = useQueryClient()
  // Admins get every client org from GET /orgs — the grant universe.
  const { orgs } = useAuth()

  const {
    data: users,
    isLoading,
    error,
  } = useQuery<OrgUserRow[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiClient.get<OrgUserRow[]>('/auth/users'),
    staleTime: 15_000,
  })

  const createMutation = useMutation<CreateUserResponse, unknown, CreateUserBody>({
    mutationFn: (body) => apiClient.post('/auth/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const resendMutation = useMutation<CreateUserResponse, unknown, string>({
    mutationFn: (userId) =>
      apiClient.post(`/auth/users/${userId}/resend-activation`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const deleteMutation = useMutation<
    { deleted: boolean; was_pending: boolean; email: string },
    unknown,
    string
  >({
    mutationFn: (userId) => apiClient.delete(`/auth/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<CreateUserBody['role']>('viewer')
  const [inviteOrgIds, setInviteOrgIds] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending) return
    try {
      await createMutation.mutateAsync({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        org_ids: role === 'org_admin' ? [] : inviteOrgIds,
      })
      setEmail('')
      setName('')
      setRole('viewer')
      setInviteOrgIds([])
    } catch {
      // Error surfaces via createMutation.error below
    }
  }

  if (error) {
    return (
      <ErrorState
        message="You need admin privileges to view this page."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon={UserPlus}
          title="Users"
          eyebrow="Admin · access"
          subtitle="Invite new users to AccessGraph. They'll receive an activation email and set their own password."
        />
      </Reveal>

      <Reveal>
        <FirmBrandCard />
      </Reveal>

      {/* Create user form */}
      <Reveal>
      <Card variant="bordered" className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                Email
              </span>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                />
              </div>
            </label>

            <label className="block">
              <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                Name (optional)
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
            </label>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <label className="block">
              <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                Role
              </span>
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as CreateUserBody['role'])
                }
                className="mt-1 px-3 py-2 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <option value="viewer">Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="auditor">Auditor</option>
                <option value="org_admin">Admin</option>
              </select>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={createMutation.isPending || !email.trim()}
              className="grove-copper-wash relative overflow-hidden"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              {createMutation.isPending ? 'Creating…' : 'Create & invite'}
            </Button>
          </div>

          {role !== 'org_admin' && orgs.length > 0 && (
            <div>
              <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                Client org access (optional)
              </span>
              <div className="mt-1">
                <OrgCheckboxList
                  orgs={orgs}
                  selected={inviteOrgIds}
                  onChange={setInviteOrgIds}
                />
              </div>
            </div>
          )}

          {createMutation.isError && (
            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/15 ring-1 ring-red-200 dark:ring-red-900 rounded-md p-2.5">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                {extractErrorMessage(createMutation.error)}
              </span>
            </div>
          )}

          {createMutation.isSuccess && createMutation.data && (
            <SuccessCard result={createMutation.data} />
          )}
        </form>
      </Card>
      </Reveal>

      {/* Existing users list */}
      {isLoading ? (
        <TableSkeleton />
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon="users"
          title="No users yet"
          description="Create the first account using the form above. They'll receive an activation email."
        />
      ) : (
        <Reveal>
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              orgs={orgs}
              onResend={(id) => resendMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              resendPending={
                resendMutation.isPending && resendMutation.variables === u.id
              }
              resendResult={
                resendMutation.data && resendMutation.variables === u.id
                  ? resendMutation.data
                  : null
              }
              deletePending={
                deleteMutation.isPending && deleteMutation.variables === u.id
              }
              deleteError={
                deleteMutation.isError && deleteMutation.variables === u.id
                  ? extractErrorMessage(deleteMutation.error)
                  : null
              }
            />
          ))}
        </div>
        </Reveal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- row

function UserRow({
  user,
  orgs,
  onResend,
  onDelete,
  resendPending,
  resendResult,
  deletePending,
  deleteError,
}: {
  user: OrgUserRow
  orgs: Organization[]
  onResend: (userId: string) => void
  onDelete: (userId: string) => void
  resendPending: boolean
  resendResult: CreateUserResponse | null
  deletePending: boolean
  deleteError: string | null
}) {
  const verified = user.is_email_verified
  const roleLabel = ROLE_LABEL[user.role] ?? user.role
  // Pending invites get 'Cancel invite' language; activated users get
  // 'Delete account'. Same endpoint under the hood — the label reflects
  // what the admin thinks they're doing.
  const isPending = !verified
  const deleteLabel = isPending ? 'Cancel invite' : 'Delete account'
  const deleteConfirmText = isPending
    ? `Cancel the pending invite for ${user.email}? Their activation link will stop working immediately.`
    : `Permanently delete ${user.email}? They'll lose access on their next request. This can't be undone.`
  const handleDelete = () => {
    if (typeof window !== 'undefined' && window.confirm(deleteConfirmText)) {
      onDelete(user.id)
    }
  }
  return (
    <Card
      variant="bordered"
      className="p-4 transition-colors duration-200 hover:bg-primary-50/40 dark:hover:bg-primary-900/10"
    >
      <CardContent className="p-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className={cn(
              'p-2 rounded-full',
              verified
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-400'
                : 'bg-copper-50 text-copper-600 dark:bg-copper-900/25 dark:text-copper-400',
            )}
          >
            {verified ? (
              <UserCheck className="h-4 w-4" />
            ) : (
              <UserX className="h-4 w-4" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                {user.name || user.email}
              </span>
              <span
                className={cn(
                  'text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full',
                  user.role === 'org_admin'
                    ? 'bg-primary-600 text-white'
                    : 'bg-grove-canvas text-grove-ink/70 ring-1 ring-grove-border dark:bg-grove-surface-dk dark:text-grove-ink-dk/70 dark:ring-grove-border-dk',
                )}
              >
                {roleLabel}
              </span>
              {!verified && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-copper-50 text-copper-700 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
                  Awaiting activation
                </span>
              )}
              {!user.is_active && (
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/25 dark:text-red-400 dark:ring-red-900">
                  Disabled
                </span>
              )}
            </div>
            {user.name && (
              <div className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 mt-0.5">
                {user.email}
              </div>
            )}
            <div className="mt-1 flex items-center gap-4 flex-wrap text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">
              {user.last_login_at && (
                <span>Last login {formatRelative(user.last_login_at)}</span>
              )}
              {!user.last_login_at && user.invited_at && (
                <span>Invited {formatRelative(user.invited_at)}</span>
              )}
            </div>
          </div>

          {!verified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResend(user.id)}
              disabled={resendPending || deletePending}
            >
              {resendPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Resend
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deletePending || resendPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
          >
            {deletePending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            {deleteLabel}
          </Button>
        </div>

        <UserOrgAccess user={user} orgs={orgs} />

        {deleteError && (
          <div className="mt-3 flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/15 ring-1 ring-red-200 dark:ring-red-900 rounded-md p-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{deleteError}</span>
          </div>
        )}

        {resendResult && (
          <div className="mt-3">
            <SuccessCard result={resendResult} title="Activation email re-sent." />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- org access

function UserOrgAccess({ user, orgs }: { user: OrgUserRow; orgs: Organization[] }) {
  const qc = useQueryClient()
  const isAdminRole = user.role === 'org_admin'
  const queryKey = ['admin', 'users', user.id, 'orgs']
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])

  const { data, isLoading } = useQuery<OrgAccess>({
    queryKey,
    queryFn: () => apiClient.get<OrgAccess>(`/auth/users/${user.id}/orgs`),
    enabled: !isAdminRole,
    staleTime: 15_000,
  })

  const saveMutation = useMutation<OrgAccess, unknown, string[]>({
    mutationFn: (orgIds) =>
      apiClient.put<OrgAccess>(`/auth/users/${user.id}/orgs`, { org_ids: orgIds }),
    onSuccess: (result) => {
      qc.setQueryData(queryKey, result)
      setEditing(false)
    },
  })

  const grantedIds = data?.org_ids ?? []
  const nameById = new Map(orgs.map((o) => [o.id, o.name]))

  return (
    <div className="mt-3 border-t border-grove-border pt-3 dark:border-grove-border-dk">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Building2 className="h-3.5 w-3.5 text-grove-ink/45 dark:text-grove-ink-dk/45" />
        <span className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Org access</span>
        {isAdminRole ? (
          <span className="text-grove-ink/75 dark:text-grove-ink-dk/75">All client orgs</span>
        ) : isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-grove-ink/45" />
        ) : grantedIds.length === 0 ? (
          <span className="text-grove-ink/55 dark:text-grove-ink-dk/55">No client orgs</span>
        ) : (
          grantedIds.map((id) => (
            <span
              key={id}
              className="rounded-full bg-grove-canvas px-2 py-0.5 text-grove-ink/75 ring-1 ring-grove-border dark:bg-grove-surface-dk dark:text-grove-ink-dk/75 dark:ring-grove-border-dk"
            >
              {nameById.get(id) ?? 'Unknown org'}
            </span>
          ))
        )}
        {!isAdminRole && !editing && !isLoading && (
          <button
            type="button"
            onClick={() => {
              setDraft(grantedIds)
              setEditing(true)
            }}
            className="ml-auto inline-flex items-center gap-1 font-medium text-primary-700 hover:underline dark:text-primary-400"
          >
            <Pencil className="h-3 w-3" />
            Edit access
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3">
          {orgs.length === 0 ? (
            <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              No client orgs are connected yet.
            </p>
          ) : (
            <OrgCheckboxList orgs={orgs} selected={draft} onChange={setDraft} />
          )}
          {saveMutation.isError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-900/15 dark:text-red-400 dark:ring-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span className="leading-relaxed">{extractErrorMessage(saveMutation.error)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save access
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                saveMutation.reset()
                setEditing(false)
              }}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function OrgCheckboxList({
  orgs,
  selected,
  onChange,
}: {
  orgs: Organization[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 v2-scroll">
      {orgs.map((org) => (
        <label
          key={org.id}
          className="flex cursor-pointer items-center gap-2 rounded-md border border-grove-border px-3 py-2 text-sm text-grove-ink transition-colors hover:bg-primary-50/40 dark:border-grove-border-dk dark:text-grove-ink-dk dark:hover:bg-primary-900/15"
        >
          <input
            type="checkbox"
            checked={selected.includes(org.id)}
            onChange={() => toggle(org.id)}
            className="rounded"
          />
          <span className="truncate">{org.name}</span>
          {org.is_sandbox && (
            <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-copper-600 dark:text-copper-400">
              Sandbox
            </span>
          )}
        </label>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- helpers

function SuccessCard({
  result,
  title,
}: {
  result: CreateUserResponse
  title?: string
}) {
  const url = result.activation_url_for_admin
  return (
    <div className="text-xs bg-primary-50/60 dark:bg-primary-900/15 ring-1 ring-primary-200 dark:ring-primary-900 rounded-md p-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary-700 dark:text-primary-400" />
        <div className="flex-1">
          <div className="font-semibold text-grove-ink dark:text-grove-ink-dk">
            {title ??
              `Invited ${result.user.email}. Activation email sent.`}
          </div>
          {url && (
            <>
              <p className="mt-1 text-grove-ink/70 dark:text-grove-ink-dk/70">
                Email sender is in dev mode (no <code>RESEND_API_KEY</code>).
                Copy the activation link and send it to them manually:
              </p>
              <div className="mt-2 flex items-start gap-2">
                <code className="flex-1 text-[11px] font-mono break-all bg-grove-canvas dark:bg-grove-surface-dk p-2 rounded ring-1 ring-grove-border dark:ring-grove-border-dk">
                  {url}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(url)}
                  className="p-2 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex-shrink-0"
                  title="Copy link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  org_admin: 'Admin',
  analyst: 'Analyst',
  auditor: 'Auditor',
  viewer: 'Viewer',
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong.'
  const e = err as Record<string, unknown> & { message?: string }
  const errorData = (e.data as Record<string, unknown> | undefined) ?? undefined
  const detail = errorData?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    if (typeof d.message === 'string') return d.message
    if (typeof d.error === 'string') return d.error
  }
  if (e.message && typeof e.message === 'string') return e.message
  return 'Failed to create user.'
}


// Firm-wide letterhead branding for client PDF reports. A client org's own
// brand settings (Health Report > Branding) override these per engagement.
function FirmBrandCard() {
  const brand = useFirmBrand()
  const { save, uploadLogo } = useUpdateFirmBrand()
  const [firmName, setFirmName] = useState<string | null>(null)
  const [accent, setAccent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = firmName ?? brand.data?.firm_name ?? ''
  const color = accent ?? brand.data?.accent_hex ?? ''
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

  return (
    <Card variant="bordered" className="p-6">
      <h2 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk">Firm branding</h2>
      <p className="mt-1 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
        Your logo, name and accent colour on every client report. Client logos are set per org on its Health Report.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">Firm name</span>
          <input
            value={name}
            onChange={(e) => setFirmName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-grove-border bg-transparent px-3 py-2 text-sm dark:border-grove-border-dk"
          />
        </label>
        <label className="block">
          <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">Accent colour (#RRGGBB)</span>
          <input
            value={color}
            onChange={(e) => setAccent(e.target.value)}
            placeholder="#14532d"
            className="mt-1 w-full rounded-lg border border-grove-border bg-transparent px-3 py-2 text-sm dark:border-grove-border-dk"
          />
        </label>
        <div>
          <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">Logo (PNG / JPEG, 256KB max)</span>
          <div className="mt-1 flex items-center gap-3">
            {brand.data?.has_logo && (
              <img
                src={`${apiBase}${endpoints.firmBrandLogo}?t=${Date.now()}`}
                alt="Firm logo"
                className="h-10 max-w-[120px] rounded border border-grove-border bg-white object-contain p-1"
              />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="text-xs"
              disabled={uploadLogo.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setError(null)
                uploadLogo.mutate(file, { onError: (err) => setError((err as Error).message) })
              }}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() => {
            setError(null)
            save.mutate(
              { firm_name: name.trim() || null, accent_hex: color.trim() || null },
              { onError: (err) => setError((err as Error).message) },
            )
          }}
        >
          {save.isPending ? 'Saving…' : 'Save firm branding'}
        </Button>
        {save.isSuccess && <span className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">Saved</span>}
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </Card>
  )
}
