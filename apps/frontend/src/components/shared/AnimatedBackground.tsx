/**
 * Animated Background Component
 * Professional gradient animation that adds depth and visual interest
 */

'use client'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs - more visible */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-primary-400/30 dark:bg-primary-600/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-80 animate-blob" />
      <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400/30 dark:bg-purple-600/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-80 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-400/30 dark:bg-pink-600/20 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-3xl opacity-80 animate-blob animation-delay-4000" />

      {/* Additional floating orbs for more depth */}
      <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-indigo-300/25 dark:bg-indigo-500/15 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-2xl opacity-60 animate-blob animation-delay-3000" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-violet-300/25 dark:bg-violet-500/15 rounded-full mix-blend-multiply dark:mix-blend-soft-light filter blur-2xl opacity-60 animate-blob animation-delay-5000" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.07]" />
    </div>
  )
}
