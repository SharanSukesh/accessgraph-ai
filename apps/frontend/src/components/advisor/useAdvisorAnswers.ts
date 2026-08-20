'use client'

/**
 * useAdvisorAnswers — mount-safe localStorage read for the workspace
 * tabs. Reads after hydration to avoid SSR/client mismatch; `ready`
 * gates rendering so pages can show a brief spinner instead of a
 * flash of the "no answers yet" state.
 */

import { useEffect, useState } from 'react'
import { type AdvisorAnswers } from '@/lib/advisor/rules'
import { loadAnswers } from '@/lib/advisor/storage'

export function useAdvisorAnswers(): {
  ready: boolean
  answers: AdvisorAnswers | null
} {
  const [state, setState] = useState<{
    ready: boolean
    answers: AdvisorAnswers | null
  }>({ ready: false, answers: null })

  useEffect(() => {
    setState({ ready: true, answers: loadAnswers() })
  }, [])

  return state
}
