'use client'

/**
 * Roadmap — phased go-live plan derived from the answers, plus the
 * week-one guardrails. Timeframes are consulting bands, not promises.
 */

import { useMemo } from 'react'
import { Check, Clock } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { GuardrailsCard } from '@/components/advisor/ResultsBlocks'
import { recommend, buildRoadmap, estimateTimeline } from '@/lib/advisor/rules'

export default function RoadmapPage() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])
  const phases = useMemo(
    () => (answers && rec ? buildRoadmap(answers, rec) : []),
    [answers, rec],
  )

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · plan</p>
            <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
              Implementation roadmap
            </h1>
          </div>
          <p className="flex items-center gap-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
            <Clock className="h-4 w-4 text-copper-500 dark:text-copper-400" />
            Estimated <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">{estimateTimeline(answers, rec)}</span> to full rollout
          </p>
        </div>
      </Reveal>

      {/* Phases */}
      <Stagger className="space-y-4">
        {phases.map((p, i) => (
          <StaggerItem key={p.name}>
            <div className="v2-card v2-card-ink relative overflow-visible p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {p.name}
                </h2>
                <span className="v2-micro rounded-full bg-copper-50 px-2.5 py-1 text-copper-700 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-800">
                  {p.timeframe}
                </span>
              </div>
              <p className="mt-1 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">{p.goal}</p>
              <ul className="mt-4 space-y-2">
                {p.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
                    <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
                    {item}
                  </li>
                ))}
              </ul>
              {i < phases.length - 1 && (
                <span className="absolute -bottom-4 left-8 h-4 w-px bg-grove-border dark:bg-grove-border-dk" />
              )}
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal><GuardrailsCard rec={rec} /></Reveal>

      <Reveal>
        <p className="text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">
          Timeframes are planning bands based on seat count and cloud scope —
          real schedules depend on data quality, integration complexity, and
          stakeholder availability. Sequenced so each phase ships value on its own.
        </p>
      </Reveal>
    </div>
  )
}
