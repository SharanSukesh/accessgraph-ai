'use client'

/**
 * Onboarding Page
 * Guide users through connecting their Salesforce organization
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  const steps = [
    {
      title: 'Connect Salesforce',
      description: 'Securely connect your Salesforce organization',
    },
    {
      title: 'Configure Sync',
      description: 'Choose what data to analyze',
    },
    {
      title: 'Initial Analysis',
      description: 'We\'ll analyze your access patterns',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/')}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="text-center">
            <div className="h-16 w-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Get Started with AccessGraph AI
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Connect your Salesforce organization in just a few steps
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {steps.map((s, idx) => (
              <div key={idx} className="flex-1 relative">
                <div className="flex flex-col items-center">
                  <div
                    className={`h-12 w-12 rounded-full flex items-center justify-center mb-2 ${
                      idx + 1 < step
                        ? 'bg-primary-600 text-white'
                        : idx + 1 === step
                        ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 ring-4 ring-primary-200 dark:ring-primary-800'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                    }`}
                  >
                    {idx + 1 < step ? (
                      <Check className="h-6 w-6" />
                    ) : (
                      <span className="font-semibold">{idx + 1}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white text-center">
                    {s.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-32">
                    {s.description}
                  </p>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`absolute top-6 left-1/2 w-full h-0.5 -z-10 ${
                      idx + 1 < step
                        ? 'bg-primary-600'
                        : 'bg-gray-300 dark:bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content Card */}
        <Card variant="bordered" className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>{steps[step - 1].title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <>
                <p className="text-gray-600 dark:text-gray-400">
                  To get started, we need to connect to your Salesforce organization.
                  This requires OAuth authentication.
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                    What we'll access:
                  </h4>
                  <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      User profiles and permission sets
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Object and field metadata
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Permission assignments
                    </li>
                  </ul>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="text-gray-600 dark:text-gray-400">
                  Configure what data you'd like to sync and analyze.
                </p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-gray-900 dark:text-white">All Users</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-gray-900 dark:text-white">
                      Profiles & Permission Sets
                    </span>
                  </label>
                  <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <span className="text-gray-900 dark:text-white">Custom Objects</span>
                  </label>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-gray-600 dark:text-gray-400">
                  We're ready to perform the initial analysis of your Salesforce organization.
                  This may take a few minutes.
                </p>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                    What happens next:
                  </h4>
                  <ul className="space-y-1 text-sm text-green-800 dark:text-green-400">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Sync user and permission data
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Build access graph
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Analyze for anomalies
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Generate recommendations
                    </li>
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between max-w-2xl mx-auto mt-8">
          <Button
            variant="secondary"
            disabled={step === 1}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (step < 3) {
                setStep(step + 1)
              } else {
                // Redirect to Salesforce OAuth
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://accessgraph-ai-production.up.railway.app'
                window.location.href = `${apiUrl}/auth/salesforce/authorize`
              }
            }}
          >
            {step < 3 ? 'Next' : 'Start Analysis'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Help Text */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
          <p>
            Need help? Check out our{' '}
            <a href="#" className="text-primary-600 dark:text-primary-400 hover:underline">
              documentation
            </a>{' '}
            or{' '}
            <a href="#" className="text-primary-600 dark:text-primary-400 hover:underline">
              contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
