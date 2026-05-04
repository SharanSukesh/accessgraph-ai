'use client'

import { useState, useRef, useEffect } from 'react'
import { LogOut, ChevronDown } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { useAuth } from '@/lib/auth/AuthContext'

export function Navbar() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
  }

  // Use first letter of org name for avatar; fall back to "U"
  const avatarLetter = user?.org_name?.charAt(0).toUpperCase() || 'U'

  return (
    <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Logo is in sidebar - keep this area minimal */}
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {/* User menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center space-x-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 transition-colors"
              aria-label="Open user menu"
              aria-expanded={menuOpen}
            >
              <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
                <span className="text-white text-sm font-medium">{avatarLetter}</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ring-1 ring-black ring-opacity-5 focus:outline-none">
                {/* Org info header */}
                {user && (
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Connected to
                    </p>
                    <p
                      className="text-sm font-medium text-gray-900 dark:text-white truncate"
                      title={user.org_name}
                    >
                      {user.org_name || 'Unknown Org'}
                    </p>
                    {user.org_domain && (
                      <p
                        className="text-xs text-gray-500 dark:text-gray-400 truncate"
                        title={user.org_domain}
                      >
                        {user.org_domain}
                      </p>
                    )}
                  </div>
                )}

                {/* Logout */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
