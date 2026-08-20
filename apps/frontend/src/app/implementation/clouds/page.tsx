'use client'

/**
 * Clouds & Add-ons — per-cloud verdicts, add-on budget lines, and the
 * AppExchange starting kit.
 */

import { useMemo } from 'react'
import { Reveal } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { CloudGrid, AddOnsCard, PackagesCard } from '@/components/advisor/ResultsBlocks'
import { recommend } from '@/lib/advisor/rules'

export default function CloudsPage() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  return (
    <div className="space-y-6">
      <Reveal>
        <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · products</p>
        <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          Clouds & add-ons
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
          What to buy at go-live, what to price for later, and the AppExchange
          connectors that cover your integration list.
        </p>
      </Reveal>

      <Reveal><CloudGrid rec={rec} /></Reveal>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal><AddOnsCard rec={rec} /></Reveal>
        <Reveal delay={0.06}><PackagesCard rec={rec} /></Reveal>
      </div>
    </div>
  )
}
