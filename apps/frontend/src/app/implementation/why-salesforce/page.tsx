'use client'

/**
 * Why Salesforce — the value story, personalized from the answers.
 * The tab a champion forwards to their CFO.
 */

import { useMemo } from 'react'
import { Sparkles, ShieldCheck, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { recommend, buildBenefits, fmtUsd } from '@/lib/advisor/rules'

export default function WhySalesforcePage() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])
  const benefits = useMemo(
    () => (answers && rec ? buildBenefits(answers, rec) : []),
    [answers, rec],
  )

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  return (
    <div className="space-y-6">
      <Reveal>
        <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · the case</p>
        <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          Why Salesforce
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
          What a {fmtUsd(rec.annualTotal)}/yr platform investment actually buys —
          written from your answers, not a brochure.
        </p>
      </Reveal>

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {benefits.map((b) => (
          <StaggerItem key={b.title}>
            <div className="v2-card v2-card-ink h-full p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                <Sparkles className="h-4 w-4 shrink-0 text-copper-500 dark:text-copper-400" />
                {b.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-grove-ink/70 dark:text-grove-ink-dk/70">
                {b.detail}
              </p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Honest counterweight — builds trust */}
      <Reveal>
        <div className="v2-card p-6">
          <h2 className="v2-display mb-3 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
            And the honest caveats
          </h2>
          <ul className="space-y-2 text-sm leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
            <li>• List prices are a starting point, not the price — never sign without negotiating.</li>
            <li>• The platform rewards governance: skipping the week-one guardrails is how orgs end up needing cleanup engagements later.</li>
            <li>• Licenses are the smaller half of year-one cost — budget implementation services alongside them.</li>
            <li>• Adoption is the real ROI variable; a phased rollout with per-team training beats a big-bang launch.</li>
          </ul>
        </div>
      </Reveal>

      {/* Post-go-live tie-in */}
      <Reveal>
        <div className="flex items-start gap-3 rounded-2xl border border-primary-300/50 bg-primary-50/40 p-5 dark:border-primary-800/50 dark:bg-primary-900/15">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-700 dark:text-primary-400" />
          <div className="text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
            <p className="font-semibold text-grove-ink dark:text-grove-ink-dk">
              After go-live, Newton keeps the org honest.
            </p>
            <p className="mt-1">
              The same platform you're using now monitors live orgs for license
              waste, permission sprawl, anomalous access, and compliance drift —
              so the clean org you launch stays clean.{' '}
              <Link href="/start" className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                See the existing-org workspace <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  )
}
