'use client'

/**
 * Landing Page
 * Smart routing to dashboard or onboarding based on organization availability
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ArrowRight, Check, X, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { useOrgs } from '@/lib/api/hooks/useOrgs'
import { apiClient } from '@/lib/api/client'

interface HealthCheck {
  status: string
  service: string
  version: string
}

export default function HomePage() {
  const router = useRouter()
  const { data: orgs, isLoading: orgsLoading } = useOrgs()
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  // Auto-redirect to dashboard if orgs exist
  useEffect(() => {
    if (!orgsLoading && orgs && orgs.length > 0) {
      // Redirect to the first org's dashboard
      setTimeout(() => {
        router.push(`/orgs/${orgs[0].id}/dashboard`)
      }, 1000)
    }
  }, [orgs, orgsLoading, router])

  // Fetch health status
  useEffect(() => {
    async function fetchHealth() {
      try {
        const data = await apiClient.get<HealthCheck>('/health')
        setHealth(data)
      } catch (err) {
        console.error('Health check failed:', err)
      } finally {
        setHealthLoading(false)
      }
    }
    fetchHealth()
  }, [])

  // If loading, show loader
  if (orgsLoading || healthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary-600 dark:text-primary-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading AccessGraph AI...</p>
        </div>
      </div>
    )
  }

  // If orgs exist, show redirecting message
  if (orgs && orgs.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-6">
            <div className="h-16 w-16 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome Back!
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Redirecting you to {orgs[0].name}...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary-600 dark:text-primary-400 mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  // No orgs - show welcome and onboarding
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="h-20 w-20 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Building2 className="h-12 w-12 text-white" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            AccessGraph AI
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Enterprise Access Intelligence Platform for Salesforce
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card variant="bordered" className="text-center p-6">
            <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Access Analysis
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Visualize and understand who has access to what in your Salesforce org
            </p>
          </Card>

          <Card variant="bordered" className="text-center p-6">
            <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Anomaly Detection
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              AI-powered detection of unusual access patterns and security risks
            </p>
          </Card>

          <Card variant="bordered" className="text-center p-6">
            <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Smart Recommendations
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Actionable insights to optimize permissions and reduce risk
            </p>
          </Card>
        </div>

        {/* Health Status */}
        {health && (
          <Card variant="bordered" className="mb-8">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      health.status === 'ok'
                        ? 'bg-green-500 animate-pulse'
                        : 'bg-red-500'
                    }`}
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {health.service}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Version {health.version} • {health.status === 'ok' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                {health.status === 'ok' ? (
                  <Check className="h-6 w-6 text-green-500" />
                ) : (
                  <X className="h-6 w-6 text-red-500" />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <Card variant="bordered" className="bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border-primary-200 dark:border-primary-800">
          <CardContent className="py-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-xl mx-auto">
              Connect your Salesforce organization to begin analyzing access patterns and
              improving security
            </p>
            <Button
              size="lg"
              className="mx-auto"
              onClick={() => router.push('/onboarding')}
            >
              Connect Salesforce
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Powered by AI • Built for Enterprise • Designed for Security Teams
          </p>
        </div>
      </div>
    </div>
  )
}
