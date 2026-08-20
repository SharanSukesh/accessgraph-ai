'use client'

/**
 * /advisor — legacy public questionnaire URL, now retired.
 *
 * The New Implementation Advisor lives behind the login at
 * /implementation (reached via the /start engagement chooser). This
 * stub keeps old links/bookmarks working by forwarding them into the
 * gated flow — unauthenticated visitors land on /login via the
 * workspace's auth gate.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function AdvisorRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/implementation')
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary-600 dark:text-primary-400" />
    </div>
  )
}
