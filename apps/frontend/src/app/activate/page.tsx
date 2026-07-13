'use client'

/**
 * Account activation page.
 *
 * Landing target for the activation link in the invitation email. URL:
 * `/activate?token=<token>`. Collects a password (with a confirm
 * field for the usual typo-safety), POSTs to /auth/activate, and on
 * success the backend sets the JWT cookie + returns the user; we
 * refetch AuthContext and route to /.
 *
 * Reuses the same Grove theme + global AnimatedBackground as the
 * login page — a user arriving from email should feel like they're
 * still inside the same product.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Logo } from '@/components/shared/Logo'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

function ActivateContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refetch } = useAuth()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError(
        'No activation token found in the URL. Ask your admin to resend the invite.',
      )
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await apiClient.post('/auth/activate', { token, password })
      // Success — backend set the JWT cookie. Refresh AuthContext so
      // the app knows we're logged in, then land on /.
      await refetch()
      router.push('/')
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full px-6 relative z-10">
        <div
          className="mb-8 text-center"
          style={{ animation: 'grove-fade-up 400ms ease-out both' }}
        >
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-copper-600 dark:text-copper-400 mb-3">
            Access Intelligence · Activation
          </p>
          <h1 className="text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk mb-3 tracking-tight text-balance">
            Set your password
          </h1>
          <p className="text-grove-ink/70 dark:text-grove-ink-dk/70">
            You&apos;re one step away from your AccessGraph account.
          </p>
        </div>

        <Card
          variant="bordered"
          copperBrackets
          className="shadow-grove-lift"
          style={{ animation: 'grove-fade-up 500ms ease-out 120ms both' }}
        >
          <CardHeader>
            <CardTitle className="text-center tracking-tight text-grove-ink dark:text-grove-ink-dk">
              Activate account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
                  New password
                </span>
                <div className="mt-1 relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    disabled={!token}
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
                  Confirm password
                </span>
                <div className="mt-1 relative">
                  <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    disabled={!token}
                  />
                </div>
              </label>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/15 ring-1 ring-red-200 dark:ring-red-900 rounded-md p-2.5">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full relative overflow-hidden grove-copper-wash"
                disabled={
                  submitting || !token || !password || !confirm
                }
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                {submitting ? 'Activating…' : 'Activate & sign in'}
              </Button>
            </form>

            <p className="text-center text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Activation links expire 24 hours after they&apos;re sent.
              If yours has expired, ask your admin to resend the invite.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong. Try again.'
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
  return 'Activation failed. The link may be expired or invalid.'
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-700 dark:text-primary-400" />
        </div>
      }
    >
      <ActivateContent />
    </Suspense>
  )
}
