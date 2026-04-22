'use client'

/**
 * Login Page
 * Salesforce OAuth authentication
 */

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogIn, Shield, Network, Sparkles } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Logo } from '@/components/shared/Logo'
import { useAuth } from '@/lib/auth/AuthContext'

export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full px-6">
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
