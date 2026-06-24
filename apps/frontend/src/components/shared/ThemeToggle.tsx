'use client'

/**
 * Theme toggle — refined for the sidebar.
 *
 * Two shapes:
 *   - `compact` (default): square icon button, lives in the sidebar
 *     footer alongside Reconnect / Sync buttons.
 *   - `row`: full-width row with label, used when the sidebar is
 *     expanded so the toggle reads as a labelled action.
 *
 * Uses lucide Sun / Moon (matching the rest of the icon set) and the
 * site's indigo/slate palette — no emoji.
 */

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ThemeToggleProps {
  variant?: 'compact' | 'row'
  className?: string
}

export function ThemeToggle({ variant = 'compact', className }: ThemeToggleProps) {
  const [darkMode, setDarkMode] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isDark =
      localStorage.theme === 'dark' ||
      (!('theme' in localStorage) &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)

    setDarkMode(isDark)

    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleTheme = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)

    if (newDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.theme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
    }
  }

  // Avoid SSR-hydration flicker — render a placeholder until mounted.
  if (!mounted) {
    if (variant === 'row') {
      return <div className={cn('h-11', className)} />
    }
    return <div className={cn('w-9 h-9', className)} />
  }

  const Icon = darkMode ? Sun : Moon
  const label = darkMode ? 'Light mode' : 'Dark mode'

  if (variant === 'row') {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          'flex items-center w-full rounded-lg text-sm font-medium transition-all duration-150 px-4 py-3 space-x-3',
          'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60',
          className,
        )}
        aria-label={label}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
      </button>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'p-3 rounded-lg transition-all duration-150 relative group',
        'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/60',
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
