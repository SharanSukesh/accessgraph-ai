'use client'

/**
 * PageTransition — replays a brief fade-in + 4px translate-Y on every
 * route change so navigation feels orchestrated instead of abrupt.
 *
 * Implementation: wraps the page's content in a `<div>` keyed by the
 * current pathname. Next.js's App Router preserves the parent layout,
 * so changing `key` here causes the inner subtree to remount, replaying
 * the CSS keyframe `animate-fade-in-up` (already declared in
 * `globals.css`) on every navigation.
 *
 * No logic / state / data is touched.
 */

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="animate-fade-in-up">
      {children}
    </div>
  )
}
