'use client'

/**
 * Login Page
 * Salesforce OAuth authentication
 */

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogIn, Shield, Network, Sparkles, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Logo } from '@/components/shared/Logo'
import { useAuth } from '@/lib/auth/AuthContext'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading, login } = useAuth()
  const redirect = searchParams.get('redirect')

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (redirect) {
        router.push(redirect)
      } else {
        // Redirect to first org's dashboard (will be handled by root page)
        router.push('/')
      }
    }
  }, [isAuthenticated, isLoading, redirect, router])

  const handleLogin = () => {
    login()
  }

  return (
    // The AnimatedBackground is rendered by the root layout (app/layout.tsx)
    // and applies to every page. We don't render it here - that would stack
    // a second canvas on top of the global one and double the opacity.
    // No bg-gradient on the wrapper either - it would create a stacking
    // context that hides the global -z-10 canvas.
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full px-6 relative z-10">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-6">
            <Logo size="lg" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to AccessGraph AI
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Enterprise Access Intelligence for Salesforce
          </p>
        </div>

        {/* Login Card */}
        <Card variant="bordered" className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-center">Sign In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Features */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                  <Network className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span>Visualize access patterns across your org</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span>AI-powered anomaly detection</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <span>Smart security recommendations</span>
              </div>
            </div>

            {/* Login Button */}
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleLogin}
            >
              <LogIn className="h-5 w-5 mr-2" />
              Sign in with Salesforce
            </Button>

            {/* Info */}
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              <p>
                By signing in, you'll authorize AccessGraph AI to access your Salesforce
                organization's permission data.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Secured by Salesforce OAuth • Enterprise-Grade Security
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary-600 dark:text-primary-400" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
