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
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils/cn'

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
}

// ---------------------------------------------------------------- page

export default function AdminUsersPage() {
  const qc = useQueryClient()

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

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<CreateUserBody['role']>('viewer')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (createMutation.isPending) return
    try {
      await createMutation.mutateAsync({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
      })
      setEmail('')
      setName('')
      setRole('viewer')
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
      <PageHeader
        icon={UserPlus}
        title="Users"
        subtitle="Invite new users to AccessGraph. They'll receive an activation email and set their own password."
      />

      {/* Create user form */}
      <Card variant="bordered" className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
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
              <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
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
              <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
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
        <div className="space-y-2">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              onResend={(id) => resendMutation.mutate(id)}
              resendPending={
                resendMutation.isPending && resendMutation.variables === u.id
              }
              resendResult={
                resendMutation.data && resendMutation.variables === u.id
                  ? resendMutation.data
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- row

function UserRow({
  user,
  onResend,
  resendPending,
  resendResult,
}: {
  user: OrgUserRow
  onResend: (userId: string) => void
  resendPending: boolean
  resendResult: CreateUserResponse | null
}) {
  const verified = user.is_email_verified
  const roleLabel = ROLE_LABEL[user.role] ?? user.role
  return (
    <Card variant="bordered" className="p-4">
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
              disabled={resendPending}
            >
              {resendPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Resend
            </Button>
          )}
        </div>

        {resendResult && (
          <div className="mt-3">
            <SuccessCard result={resendResult} title="Activation email re-sent." />
          </div>
        )}
      </CardContent>
    </Card>
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
  const errorData = (e.errorData as Record<string, unknown> | undefined) ?? undefined
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
