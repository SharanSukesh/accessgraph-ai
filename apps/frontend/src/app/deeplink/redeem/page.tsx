'use client'

/**
 * Deep-link redeem page.
 *
 * Entry point opened by the managed-package LWC quick actions. Reads the
 * single-use JWT from `?token=`, posts it to the backend redeem endpoint,
 * and on success replaces the URL with the canonical destination
 * (e.g. /orgs/{org}/users/{sf_user_id}).
 *
 * If the token is invalid / expired / already used, shows a friendly error
 * and a "Sign in normally" link.
 */

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type RedeemState =
  | { kind: 'pending' }
  | { kind: 'error'; message: string }

function RedeemContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<RedeemState>({ kind: 'pending' })
  // Strict Mode + browser pre-fetch can both cause useEffect to fire twice.
  // The cancelled flag only suppresses a stale state update; it does NOT
  // abort the in-flight fetch. Without this ref, the second invocation hits
  // /auth/deeplink/redeem again and our backend's single-use replay
  // protection returns 409, overwriting the success state.
  const initiatedRef = useRef(false)

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setState({ kind: 'error', message: 'This link is missing its token.' })
      return
    }

    if (initiatedRef.current) return
    initiatedRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/deeplink/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        })

        if (!res.ok) {
          let message = 'This link is no longer valid.'
          if (res.status === 409) {
            message = 'This link has already been used. Open the dashboard to continue.'
          } else if (res.status === 401) {
            message = 'This link expired. Click the button in Salesforce again to get a fresh one.'
          } else if (res.status === 404) {
            message = 'Your org isn\'t connected to AccessGraph AI yet. Sign in to set it up.'
          }
          if (!cancelled) setState({ kind: 'error', message })
          return
        }

        const data = (await res.json()) as { destinationUrl: string }
        // The backend returns an absolute URL pointing at FRONTEND_URL; we
        // route to the path portion so Next.js handles it client-side.
        try {
          const url = new URL(data.destinationUrl)
          if (!cancelled) router.replace(url.pathname + url.search)
        } catch {
          // If parsing fails, fall back to a hard redirect.
          if (!cancelled) window.location.href = data.destinationUrl
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: 'Could not reach AccessGraph AI. Please try again in a moment.',
          })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            We couldn't open that link
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{state.message}</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            Sign in normally
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Opening AccessGraph AI…</p>
      </div>
    </div>
  )
}

export default function RedeemPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600" />
        </div>
      }
    >
      <RedeemContent />
    </Suspense>
  )
}
