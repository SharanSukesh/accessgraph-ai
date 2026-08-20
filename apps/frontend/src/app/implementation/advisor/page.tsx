'use client'

/**
 * Requirements tab — the 8-step questionnaire inside the workspace.
 * Pre-fills saved answers; completion persists and lands on Overview.
 */

import { useRouter } from 'next/navigation'
import { Reveal } from '@/components/v2/motion'
import { AdvisorWizard } from '@/components/advisor/AdvisorWizard'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { saveAnswers } from '@/lib/advisor/storage'
import { Loader2 } from 'lucide-react'

export default function RequirementsPage() {
  const router = useRouter()
  const { ready, answers } = useAdvisorAnswers()

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
    )
  }

  return (
    <div>
      <Reveal>
        <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · requirements</p>
        <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          {answers ? 'Adjust your requirements' : 'Tell us what you need'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
          {answers
            ? 'Everything downstream — licensing, pricebook, roadmap — recomputes from these answers.'
            : 'Eight quick steps. Every tab in this workspace is generated from what you answer here.'}
        </p>
      </Reveal>
      <div className="mt-8">
        <AdvisorWizard
          initialAnswers={answers}
          completeLabel={answers ? 'Update recommendation' : 'Build my recommendation'}
          onComplete={(a) => {
            saveAnswers(a)
            router.push('/implementation/overview')
          }}
        />
      </div>
    </div>
  )
}
