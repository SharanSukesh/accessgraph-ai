/**
 * Animated Background Component
 * Professional gradient animation that adds depth and visual interest
 */

'use client'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs - subtle and professional */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-200 dark:bg-purple-900 rounded-full blur-3xl opacity-20 dark:opacity-10 animate-blob" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-200 dark:bg-pink-900 rounded-full blur-3xl opacity-20 dark:opacity-10 animate-blob animation-delay-2000" />
      <div className="absolute bottom-0 left-20 w-[500px] h-[500px] bg-indigo-200 dark:bg-indigo-900 rounded-full blur-3xl opacity-20 dark:opacity-10 animate-blob animation-delay-4000" />

      {/* Additional floating orbs for more depth */}
      <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-violet-200 dark:bg-violet-900 rounded-full blur-2xl opacity-15 dark:opacity-8 animate-blob animation-delay-3000" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-fuchsia-200 dark:bg-fuchsia-900 rounded-full blur-2xl opacity-15 dark:opacity-8 animate-blob animation-delay-5000" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]" />
    </div>
  )
}
