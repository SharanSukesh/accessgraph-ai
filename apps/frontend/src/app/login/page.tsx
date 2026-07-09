'use client'

/**
 * Login Page
 * Salesforce OAuth authentication
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogIn, Shield, Network, Sparkles, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Logo } from '@/components/shared/Logo'
import { useAuth } from '@/lib/auth/AuthContext'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading, login } = useAuth()
  const redirect = searchParams.get('redirect')
  // Sandbox/scratch orgs must auth via test.salesforce.com (production orgs
  // use login.salesforce.com). We default the toggle to whatever ?env= came
  // in on the URL or was stashed in sessionStorage by AuthContext, so users
  // arriving from the SF package's deep link don't have to re-tick the box.
  const [isSandbox, setIsSandbox] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const fromUrl = new URLSearchParams(window.location.search).get('env')
    const fromStorage = window.sessionStorage.getItem('accessgraph_env')
    const env = (fromUrl || fromStorage || '').toLowerCase()
    if (env === 'sandbox' || env === 'scratch' || env === 'test') {
      setIsSandbox(true)
    }
  }, [])

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (redirect) {
        router.push(redirect)
      } else {
        // Redirect to first org's dashboard (will be handled by root page)
        router.push('/')
      }
    }
  }, [isAuthenticated, isLoading, redirect, router])

  const handleLogin = () => {
    login(undefined, isSandbox ? 'sandbox' : undefined)
  }

  return (
    // The AnimatedBackground is rendered by the root layout (app/layout.tsx)
    // and applies to every page. We don't render it here - that would stack
    // a second canvas on top of the global one and double the opacity.
    // No bg-gradient on the wrapper either - it would create a stacking
    // context that hides the global -z-10 canvas.
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full px-6 relative z-10">
        {/* Grove — eyebrow + serif welcome. The eyebrow is a small mono
            uppercase tag (the identity's system-label voice); the title
            uses the serif stack so the brand voice reads on first frame. */}
        <div className="mb-8 text-center" style={{ animation: 'grove-fade-up 400ms ease-out both' }}>
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-copper-600 dark:text-copper-400 mb-3">
            Access Intelligence · v0.1
          </p>
          <h1 className="text-4xl font-serif font-semibold text-grove-ink dark:text-grove-ink-dk mb-3 tracking-tight text-balance">
            Welcome to AccessGraph AI
          </h1>
          <p className="text-grove-ink/70 dark:text-grove-ink-dk/70">
            Enterprise access intelligence for Salesforce
          </p>
        </div>

        {/* Login Card — Grove: cream surface, copper brackets on the
            corners to mark this as the important surface. Fade-up mount. */}
        <Card
          variant="bordered"
          copperBrackets
          className="shadow-grove-lift"
          style={{ animation: 'grove-fade-up 500ms ease-out 120ms both' }}
        >
          <CardHeader>
            <CardTitle className="text-center font-serif tracking-tight text-grove-ink dark:text-grove-ink-dk">
              Sign In
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Grove — feature list. Icons live in evergreen tiles with a
                warm hairline ring. The palette encodes hierarchy: three
                evergreen tiles carry the same weight, and the copper on
                the CTA is the single warm-accent moment on the surface. */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800 flex items-center justify-center flex-shrink-0">
                  <Network className="h-5 w-5 text-primary-700 dark:text-primary-400" />
                </div>
                <span>User-centric access graph — beyond field-by-field lookup</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-primary-700 dark:text-primary-400" />
                </div>
                <span>ML detection of over-privileged users</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200 dark:ring-primary-800 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-primary-700 dark:text-primary-400" />
                </div>
                <span>AI-generated fixes — not just alerts</span>
              </div>
            </div>

            {/* Grove — CTA in evergreen brand with copper wash on hover.
                The wash appears via .grove-copper-wash + relative overflow. */}
            <Button
              variant="primary"
              size="lg"
              className="w-full relative overflow-hidden grove-copper-wash"
              onClick={handleLogin}
            >
              <LogIn className="h-5 w-5 mr-2" />
              Sign in with Salesforce
            </Button>

            {/* Sandbox/scratch toggle. Without this, the OAuth flow defaults to
                login.salesforce.com which rejects sandbox/scratch credentials. */}
            <label className="flex items-center justify-center gap-2 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isSandbox}
                onChange={(e) => setIsSandbox(e.target.checked)}
                className="h-4 w-4 rounded border-grove-border dark:border-grove-border-dk text-primary-700 focus:ring-primary-500"
              />
              <span>This is a sandbox or scratch org</span>
            </label>

            {/* Info */}
            <div className="text-center text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              <p>
                By signing in, you'll authorize AccessGraph AI to access your Salesforce
                organization's permission data.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer — Grove mono system-label voice */}
        <div className="mt-8 text-center text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50 font-mono uppercase tracking-[0.16em]">
          <p>
            Secured by Salesforce OAuth · Enterprise-grade
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-700 dark:text-primary-400" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
