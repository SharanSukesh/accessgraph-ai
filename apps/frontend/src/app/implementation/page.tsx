'use client'

/**
 * /implementation index — route to the questionnaire on first visit,
 * or straight to the overview once answers exist.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { loadAnswers } from '@/lib/advisor/storage'

export default function ImplementationIndex() {
  const router = useRouter()

  useEffect(() => {
    router.replace(loadAnswers() ? '/implementation/overview' : '/implementation/advisor')
  }, [router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
    </div>
  )
}
