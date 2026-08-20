'use client'

/**
 * Login Page — email + password with User / Admin tabs.
 *
 * Both tabs POST to the same /auth/login-password endpoint; the tab
 * is purely a UX signal (matches the user's mental model — "I'm an
 * admin, this is where I go"). The backend decides admin status
 * server-side from the OrgUser row, so a regular user can't sneak in
 * via the Admin tab by clicking around.
 *
 * The AnimatedBackground is rendered globally by app/layout.tsx — we
 * don't render a second copy here.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  LogIn,
  Loader2,
  User,
  ShieldCheck,
  Mail,
  KeyRound,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Logo } from '@/components/shared/Logo'
import { Reveal } from '@/components/v2/motion'
import { useAuth } from '@/lib/auth/AuthContext'
import { cn } from '@/lib/utils/cn'

type LoginTab = 'user' | 'admin'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading, isAdmin, loginWithPassword } = useAuth()
  const redirect = searchParams.get('redirect')

  const [tab, setTab] = useState<LoginTab>('user')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already logged in? Bounce to redirect or home. The redirect check
  // includes isAdmin so an admin session picks up the admin-only
  // surfaces on the destination page.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(redirect || '/')
    }
  }, [isAuthenticated, isLoading, redirect, router, isAdmin])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await loginWithPassword(email.trim(), password)
      // Success — AuthContext.loginWithPassword calls fetchAll(),
      // isAuthenticated flips, the effect above navigates.
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      setError(msg)
    } finally {
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
          <p className="v2-micro text-copper-600 dark:text-copper-400 mb-3">
            Access Intelligence · v0.1
          </p>
          <h1 className="v2-display text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk mb-3 tracking-tight text-balance">
            Welcome back
          </h1>
          <p className="text-grove-ink/70 dark:text-grove-ink-dk/70">
            Sign in with your AccessGraph account
          </p>
        </div>

        <Reveal delay={0.12}>
        <Card
          variant="bordered"
          copperBrackets
          className="shadow-grove-lift"
        >
          <CardHeader className="pb-0">
            <CardTitle className="text-center tracking-tight text-grove-ink dark:text-grove-ink-dk sr-only">
              Sign in
            </CardTitle>

            {/* Tabs — pure UX; both submit to the same endpoint. */}
            <div className="flex items-center gap-1 border-b border-grove-border dark:border-grove-border-dk -mx-6 px-6">
              <TabButton
                active={tab === 'user'}
                onClick={() => setTab('user')}
                icon={User}
              >
                User
              </TabButton>
              <TabButton
                active={tab === 'admin'}
                onClick={() => setTab('admin')}
                icon={ShieldCheck}
              >
                Admin
              </TabButton>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {tab === 'admin' && (
              <div className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 bg-copper-50 dark:bg-copper-900/15 ring-1 ring-copper-200 dark:ring-copper-900 rounded-md p-3 leading-relaxed">
                Admin sign-in unlocks user management. Regular users
                should use the <strong>User</strong> tab — but this
                form uses the same credentials, so it&apos;s fine if
                you clicked here by mistake.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                  Email
                </span>
                <div className="mt-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  />
                </div>
              </label>

              <label className="block">
                <span className="v2-micro text-grove-ink/60 dark:text-grove-ink-dk/60">
                  Password
                </span>
                <div className="mt-1 relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:outline-none focus:ring-2 focus:ring-primary-500/40"
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
                disabled={submitting || !email || !password}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <LogIn className="h-5 w-5 mr-2" />
                )}
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="text-center text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Accounts are created by an admin. If you haven&apos;t
              received an activation email, ask your admin to resend
              it.
            </p>
          </CardContent>
        </Card>
        </Reveal>

        {/* Fork for greenfield clients — no Salesforce org yet. Links to
            the public New Implementation Advisor questionnaire. */}
        <Reveal delay={0.15}>
          <a
            href="/advisor"
            className="group mt-4 flex items-center justify-between rounded-xl border border-grove-border bg-grove-surface/70 px-4 py-3 transition-all duration-200 hover:border-copper-400/60 hover:shadow-grove-lift dark:border-grove-border-dk dark:bg-grove-surface-dk/70 dark:hover:border-copper-500/50"
          >
            <span className="text-sm text-grove-ink/75 dark:text-grove-ink-dk/75">
              <span className="font-semibold text-grove-ink dark:text-grove-ink-dk">
                Planning a new Salesforce implementation?
              </span>{' '}
              Find out exactly what to buy.
            </span>
            <span className="ml-3 shrink-0 text-sm font-semibold text-copper-600 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-copper-400">
              →
            </span>
          </a>
        </Reveal>

        <div className="v2-micro mt-8 text-center text-grove-ink/50 dark:text-grove-ink-dk/50">
          <p>Access Intelligence · Enterprise-grade</p>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary-700 text-primary-700 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-primary-700 dark:hover:text-primary-300 hover:border-grove-border dark:hover:border-grove-border-dk',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
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
  return 'Login failed. Check your credentials and try again.'
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-700 dark:text-primary-400" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
