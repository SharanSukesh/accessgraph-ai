'use client'

import { useEffect, useState } from 'react'
import type { GraphTheme } from './graphStyle'

export function currentGraphTheme(): GraphTheme {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** The app's light/dark theme, following the toggle (the `dark` class on <html>). */
export function useGraphTheme(): GraphTheme {
  const [theme, setTheme] = useState<GraphTheme>(currentGraphTheme)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentGraphTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}
