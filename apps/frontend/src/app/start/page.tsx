'use client'

/**
 * /start — post-login mode chooser.
 *
 * After signing in, the user picks their engagement mode:
 *  - Existing Salesforce org → the full Newton workspace
 *    (/orgs/{orgId}/dashboard)
 *  - New implementation → the greenfield workspace (/implementation):
 *    questionnaire → licensing/pricebook/roadmap dashboard. Org-scoped
 *    surfaces (anomalies, org chart, sprawl…) don't apply there.
 *
 * Auth-gated like the root page; renders bare (no sidebar chrome).
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Database, Compass, ArrowRight } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { useAuth } from '@/lib/auth/AuthContext'

export default function StartPage() {
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
    )
  }

  const orgHref = user?.org_id ? `/orgs/${user.org_id}/dashboard` : '/onboarding'

  return (
    <div className="flex min-h-screen items-center justify-center bg-grove-canvas/80 px-4 dark:bg-grove-canvas-dk/80">
      <div className="w-full max-w-2xl">
        <Reveal>
          <div className="mb-10 text-center">
            <div className="flex justify-center">
              <Logo variant="full" size="md" />
            </div>
            <p className="v2-micro mt-6 text-copper-600 dark:text-copper-400">Choose your engagement</p>
            <h1 className="v2-display mt-2 text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
              What are we working on today?
            </h1>
          </div>
        </Reveal>

        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-stretch">
          {[
            {
              href: orgHref,
              icon: Database,
              title: 'Existing Salesforce org',
              body:
                'Connect and analyze a live org — health report, license waste, anomalies, sprawl, compliance, and restructure planning.',
              cta: 'Open workspace',
            },
            {
              href: '/implementation',
              icon: Compass,
              title: 'New implementation',
              body:
                'No Salesforce yet. Answer the requirements questionnaire and get licensing tiers, an editable pricebook, a phased roadmap, and the case for the platform.',
              cta: 'Start planning',
            },
          ].map((card) => (
            <StaggerItem key={card.href} className="h-full">
              <Link
                href={card.href}
                className="group flex h-full flex-col rounded-2xl border border-grove-border bg-grove-surface p-6 shadow-grove-lift transition-all duration-200 hover:-translate-y-1 hover:border-primary-400/60 hover:shadow-grove-hero dark:border-grove-border-dk dark:bg-grove-surface-dk"
              >
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-200 transition-transform duration-200 group-hover:scale-110 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-800">
                  <card.icon className="h-5 w-5" />
                </span>
                <h2 className="v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {card.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                  {card.body}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors group-hover:text-copper-600 dark:text-primary-400 dark:group-hover:text-copper-400">
                  {card.cta}{' '}
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>

        <p className="v2-micro mt-10 text-center text-grove-ink/40 dark:text-grove-ink-dk/40">
          Newton · Access Intelligence · Enterprise-grade
        </p>
      </div>
    </div>
  )
}
