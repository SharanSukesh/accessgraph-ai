'use client'

/**
 * New Implementation Advisor — public one-shot questionnaire.
 *
 * Renders the shared AdvisorWizard, then the full recommendation
 * inline. Answers are also saved to localStorage, so signing in and
 * entering the New Implementation workspace picks up right where the
 * public run left off.
 *
 * Public route — no auth, no backend (AppLayout bypasses /advisor).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Printer, RotateCcw, Check } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Reveal, CountUp } from '@/components/v2/motion'
import { AdvisorWizard } from '@/components/advisor/AdvisorWizard'
import {
  TierLadderCard, CloudGrid, LicenseTable, AddOnsCard, PackagesCard,
  GuardrailsCard, CaveatsCard,
} from '@/components/advisor/ResultsBlocks'
import { type AdvisorAnswers, recommend, fmtUsd } from '@/lib/advisor/rules'
import { loadAnswers, saveAnswers } from '@/lib/advisor/storage'

export default function AdvisorPage() {
  const [showResults, setShowResults] = useState(false)
  const [answers, setAnswers] = useState<AdvisorAnswers | null>(null)
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])

  return (
    <div className="min-h-screen bg-grove-canvas/80 px-4 py-10 dark:bg-grove-canvas-dk/80">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Logo variant="full" size="md" className="text-primary-700 dark:text-primary-400" />
          <Link
            href="/login"
            className="text-sm font-medium text-grove-ink/60 transition-colors hover:text-primary-700 dark:text-grove-ink-dk/60 dark:hover:text-primary-400"
          >
            Already on Salesforce? Sign in →
          </Link>
        </div>

        {!showResults || !rec ? (
          <>
            <Reveal>
              <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation advisor</p>
              <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                What should you buy from Salesforce?
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                Eight quick steps. You get a defensible shopping list — the right
                tier (Starter Suite through Agentforce 1), which clouds you
                actually need, license mix with list-price math, and the
                org-design guardrails we wish every client had on day one.
              </p>
            </Reveal>
            <div className="mt-8">
              <AdvisorWizard
                initialAnswers={answers ?? loadAnswers()}
                onComplete={(a) => {
                  setAnswers(a)
                  saveAnswers(a)
                  setShowResults(true)
                }}
              />
            </div>
          </>
        ) : (
          <div className="space-y-6 print:space-y-4">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="v2-micro text-copper-600 dark:text-copper-400">Your recommendation</p>
                  <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Salesforce {rec.tier}
                  </h1>
                </div>
                <div className="flex gap-2 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
                  >
                    <Printer className="h-4 w-4" /> Print / PDF
                  </button>
                  <button
                    onClick={() => setShowResults(false)}
                    className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
                  >
                    <RotateCcw className="h-4 w-4" /> Adjust answers
                  </button>
                </div>
              </div>
            </Reveal>

            {/* Hero total */}
            <Reveal delay={0.05}>
              <div className="v2-card v2-card-hero p-8">
                <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                  <div>
                    <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Estimated annual licensing (list)</p>
                    <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                      <CountUp value={rec.annualTotal} format={(n) => fmtUsd(n)} />
                    </p>
                    <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      {rec.totalSeats} internal seats · before negotiation (target 15–30% below list)
                    </p>
                  </div>
                  <div className="sm:ml-auto">
                    <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Why {rec.tier}</p>
                    <ul className="max-w-sm space-y-1.5">
                      {rec.tierRationale.map((r) => (
                        <li key={r} className="flex gap-2 text-xs leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary-600 dark:text-primary-400" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal><TierLadderCard rec={rec} /></Reveal>
            <Reveal><CloudGrid rec={rec} /></Reveal>
            <Reveal><LicenseTable rec={rec} /></Reveal>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Reveal><AddOnsCard rec={rec} /></Reveal>
              <Reveal delay={0.06}><PackagesCard rec={rec} /></Reveal>
            </div>
            <Reveal><GuardrailsCard rec={rec} /></Reveal>
            <Reveal>
              <CaveatsCard rec={rec}>
                <p className="mt-4 border-t border-grove-border pt-4 text-sm text-grove-ink/75 dark:border-grove-border-dk dark:text-grove-ink-dk/75">
                  Sign in to open the full New Implementation workspace — an editable
                  pricebook, a phased roadmap, and the case for Salesforce —{' '}
                  <Link href="/login" className="font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                    sign in →
                  </Link>
                </p>
              </CaveatsCard>
            </Reveal>
          </div>
        )}

        <p className="v2-micro mt-10 text-center text-grove-ink/40 dark:text-grove-ink-dk/40">
          Newton · Access Intelligence · Enterprise-grade
        </p>
      </div>
    </div>
  )
}
