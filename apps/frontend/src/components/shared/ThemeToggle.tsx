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
    return <div className={cn('w-11 h-11', className)} />
  }

  const Icon = darkMode ? Sun : Moon
  const label = darkMode ? 'Light mode' : 'Dark mode'

  if (variant === 'row') {
    return (
      <button
        onClick={toggleTheme}
        className={cn(
          'flex items-center w-full rounded-lg text-sm font-medium transition-all duration-200 ease-out px-4 py-3 space-x-3',
          'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300',
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
        // Fixed 44×44 to match every other footer button in the collapsed
        // sidebar. Grove tokens on hover/idle.
        'flex items-center justify-center w-11 h-11 rounded-lg transition-all duration-200 ease-out relative group',
        'text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/60 dark:hover:bg-primary-900/15 hover:text-primary-700 dark:hover:text-primary-300',
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
