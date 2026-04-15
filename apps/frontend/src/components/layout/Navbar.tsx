'use client'

import { ThemeToggle } from '@/components/shared/ThemeToggle'

export function Navbar() {
  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {process.env.NEXT_PUBLIC_APP_NAME}
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {/* User menu placeholder */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
              <span className="text-white text-sm font-medium">U</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
