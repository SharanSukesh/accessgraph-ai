'use client'

/**
 * MarqueeLabel — sidebar / palette label that gracefully handles
 * overflow. Measures the label's rendered width vs its container on
 * mount + resize; if the label is wider than the container, applies a
 * CSS marquee animation on hover so the full text becomes readable.
 * Otherwise renders the label as a plain span with no animation.
 *
 * Reduced-motion behaviour: when
 * `window.matchMedia('(prefers-reduced-motion: reduce)').matches`
 * is true, the marquee is disabled and the label falls back to
 * `text-overflow: ellipsis` with a `title` tooltip carrying the full
 * text. Users who opt out of motion get a stationary, standard
 * overflow-ellipsis label they can hover for a native tooltip.
 *
 * Zero-dependency, pure CSS animation. Safe to use inside any
 * fixed-width container that clips overflow-x.
 */

import { useEffect, useRef, useState } from 'react'

export function MarqueeLabel({ text }: { text: string }) {
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const innerRef = useRef<HTMLSpanElement | null>(null)
  const [overflows, setOverflows] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const c = containerRef.current
    const i = innerRef.current
    if (!c || !i) return
    const measure = () => {
      setOverflows(i.scrollWidth > c.clientWidth + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    ro.observe(i)
    return () => ro.disconnect()
  }, [text])

  // Non-overflowing labels render exactly as before — a plain span, no
  // extra layout. Preserves the current sidebar visual identity for
  // every label that fits.
  if (!overflows) {
    return <span className="whitespace-nowrap">{text}</span>
  }

  // Reduced-motion fallback — no scroll, just ellipsis + tooltip.
  if (reduceMotion) {
    return (
      <span
        className="whitespace-nowrap overflow-hidden text-ellipsis block w-full"
        title={text}
      >
        {text}
      </span>
    )
  }

  // Marquee track: the container clips, the inner span shifts left
  // on hover via a CSS transform animation. Duplicated text with a
  // gap gives an infinite-scroll feel; the animation resets on
  // hover-out.
  return (
    <span
      ref={containerRef}
      className="relative flex-1 overflow-hidden whitespace-nowrap grove-marquee-track"
      title={text}
    >
      <span
        ref={innerRef}
        className="inline-block will-change-transform grove-marquee-inner"
      >
        {text}
        <span aria-hidden className="inline-block px-6">·</span>
        {text}
      </span>
    </span>
  )
}
