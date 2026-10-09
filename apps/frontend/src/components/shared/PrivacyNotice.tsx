'use client'

/**
 * Privacy-level surfaces: the "not available for this client" state a
 * feature page shows when the org's privacy level switches it off, and
 * the masked-names info banner.
 */

import { type ReactNode } from 'react'
import Link from 'next/link'
import { EyeOff, Info } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { isPrivacyModeError } from '@/lib/api/client'
import {
  PRIVACY_LEVELS,
  isFeatureAvailable,
  privacyModeOf,
  type PrivacyFeature,
} from '@/lib/privacy'

export function PrivacyUnavailable({
  message,
  title = 'Not available for this client',
}: {
  message?: string
  title?: string
}) {
  const { currentOrg } = useAuth()
  const mode = privacyModeOf(currentOrg)
  const text =
    message ??
    `This client org uses the ${PRIVACY_LEVELS[mode].label} privacy level, so Newton does not hold the data this feature needs.`

  return (
    <div className="v2-card flex items-start gap-4 p-6">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-800">
        <EyeOff className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
          {text}
        </p>
        {currentOrg && (
          <p className="mt-3 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
            The privacy level is agreed with the client and set on the{' '}
            <Link
              href={`/orgs/${currentOrg.id}/privacy`}
              className="font-medium text-primary-700 hover:underline dark:text-primary-400"
            >
              Privacy page
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Renders the unavailable state instead of `children` when the current
 * org's privacy level switches `feature` off, so the page never fires
 * requests the backend would refuse.
 */
export function PrivacyGate({
  feature,
  header,
  children,
}: {
  feature: PrivacyFeature
  header?: ReactNode
  children: ReactNode
}) {
  const { currentOrg } = useAuth()
  if (isFeatureAvailable(currentOrg, feature)) return <>{children}</>
  return (
    <div className="space-y-6">
      {header}
      <PrivacyUnavailable />
    </div>
  )
}

/** The friendly 409 message when `err` is a privacy-level refusal, else null. */
export function privacyErrorMessage(err: unknown): string | null {
  if (!isPrivacyModeError(err)) return null
  return err.message
}

export function MaskedUsersBanner() {
  const { currentOrg } = useAuth()
  if (privacyModeOf(currentOrg) !== 'masked') return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/15 dark:text-primary-300">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Names are masked for this client. Each user appears as an alias; use the Salesforce ID
        to look them up in the client&apos;s org.
      </p>
    </div>
  )
}
