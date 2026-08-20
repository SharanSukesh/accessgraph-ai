'use client'

/**
 * Tiny shared gate states for workspace tabs: loading spinner and the
 * "fill the questionnaire first" prompt.
 */

import Link from 'next/link'
import { Loader2, ListChecks, ArrowRight } from 'lucide-react'

export function CenterSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
    </div>
  )
}

export function RequirementsPrompt() {
  return (
    <div className="v2-card mx-auto mt-16 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-copper-50 text-copper-600 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-800">
        <ListChecks className="h-6 w-6" />
      </span>
      <h2 className="v2-display text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">
        Start with your requirements
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
        This tab is generated from the questionnaire — eight quick steps about
        your teams, needs, and constraints.
      </p>
      <Link
        href="/implementation/advisor"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-grove-hero dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300"
      >
        Fill the questionnaire <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
