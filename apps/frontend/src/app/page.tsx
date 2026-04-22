'use client'

/**
 * Landing Page
 * Smart routing to dashboard or onboarding based on organization availability
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user) {
        // Redirect to dashboard
        router.push(`/orgs/${user.org_id}/dashboard`)
      } else {
        // Redirect to login
        router.push('/login')
      }
    }
  }, [isAuthenticated, isLoading, user, router])

  // Show loading while checking authentication
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  )
}
