'use client'

/**
 * v2 motion vocabulary — one place for every entrance/scroll behavior
 * so the whole tree shares the same rhythm (durations 220–500ms,
 * ease-out family, 30–60ms stagger, 12–16px travel).
 *
 * Built on framer-motion (already a v1 dependency). Everything
 * respects prefers-reduced-motion via useReducedMotion.
 */

import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as const

// ---------------------------------------------------------------- Reveal

/** Fade-up on scroll into view. Wrap any block. */
export function Reveal({
  children,
  delay = 0,
  y = 14,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.45, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------- Stagger

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
}

/** Parent for a staggered group; children must be <StaggerItem>. */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------- CountUp

/**
 * Animate a number from 0 when it scrolls into view. Formats with
 * toLocaleString by default; pass `format` for custom rendering
 * (e.g. money, percentages).
 */
export function CountUp({
  value,
  duration = 900,
  format,
  className,
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px' })
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)

  useEffect(() => {
    if (!inView || reduced) {
      if (reduced) setDisplay(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // ease-out cubic — fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(value * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, value, duration, reduced])

  const text = format
    ? format(display)
    : Math.round(display).toLocaleString('en-US')

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  )
}

// ---------------------------------------------------------------- HoverCard

/** Scale-tap feedback wrapper for clickable cards (subtle, 0.98). */
export function Press({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div className={className} whileTap={{ scale: 0.98 }}>
      {children}
    </motion.div>
  )
}
