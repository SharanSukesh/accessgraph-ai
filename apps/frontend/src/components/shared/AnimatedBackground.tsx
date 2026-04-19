/**
 * Animated Background Component
 * Professional gradient animation that adds depth and visual interest
 */

'use client'

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs - highly visible for both light and dark modes */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-400 rounded-full blur-3xl opacity-40 animate-blob" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-400 rounded-full blur-3xl opacity-40 animate-blob animation-delay-2000" />
      <div className="absolute bottom-0 left-20 w-[500px] h-[500px] bg-indigo-400 rounded-full blur-3xl opacity-40 animate-blob animation-delay-4000" />

      {/* Additional floating orbs for more depth */}
      <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-violet-300 rounded-full blur-2xl opacity-30 animate-blob animation-delay-3000" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-fuchsia-300 rounded-full blur-2xl opacity-30 animate-blob animation-delay-5000" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.05]" />
    </div>
  )
}
