'use client'

/**
 * Licensing & Tiers — the tier decision in full: recommendation,
 * complete tier ladder with per-tier verdicts, and the license mix.
 */

import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { Reveal } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { TierLadderCard, LicenseTable } from '@/components/advisor/ResultsBlocks'
import { recommend, fmtUsd } from '@/lib/advisor/rules'

export default function LicensingPage() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  return (
    <div className="space-y-6">
      <Reveal>
        <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · licensing</p>
        <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          Salesforce {rec.tier}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
          {fmtUsd(rec.perSeat)}/user/mo core seats · {rec.totalSeats} internal seats ·{' '}
          {fmtUsd(rec.annualTotal)}/yr at list
        </p>
      </Reveal>

      {/* Full rationale */}
      <Reveal>
        <div className="v2-card p-6">
          <h2 className="v2-display mb-3 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
            Why this tier
          </h2>
          <ul className="space-y-2">
            {rec.tierRationale.map((r) => (
              <li key={r} className="flex gap-2.5 text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <Reveal><TierLadderCard rec={rec} /></Reveal>
      <Reveal><LicenseTable rec={rec} /></Reveal>
    </div>
  )
}
