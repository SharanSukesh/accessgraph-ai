/**
 * useCountUp — smooth-interpolate a numeric value from 0 to `target`
 * over `durationMs`. Designed for first-mount stat-card "count-up"
 * animations. Pure requestAnimationFrame — no library dependency.
 *
 * Skips the animation (returns `target` immediately) when:
 *   - the user prefers-reduced-motion, OR
 *   - `target` isn't a finite number.
 *
 * Re-fires whenever `target` changes by more than 0 (so stat updates
 * after a fresh fetch also tween).
 */
import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState<number>(() => {
    // SSR / first paint: render the final value so we don't flash 0
    // on snapshots from a back/forward cache, then animate from 0 on
    // mount via the effect below.
    return typeof window === 'undefined' ? target : 0
  })
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef<number>(0)

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(target)
      return
    }
    // Respect the OS reduced-motion preference — no count-up.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setValue(target)
      return
    }

    fromRef.current = value
    startRef.current = null

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / durationMs)
      const eased = easeOutCubic(t)
      const next = fromRef.current + (target - fromRef.current) * eased
      setValue(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Snap to exact target at the end — avoids tiny floating-point
        // mismatches showing up in the rendered number.
        setValue(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // value intentionally NOT in deps — we only re-trigger on target change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}
