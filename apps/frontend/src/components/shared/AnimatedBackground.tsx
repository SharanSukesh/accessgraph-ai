/**
 * Animated Background — Grove edition.
 *
 * A slowly-drifting network of nodes + lines behind the app, plus three
 * ambient gradient orbs (cream / evergreen / copper) that echo the
 * palette. Every colour resolves from Grove tokens so a future theme
 * swap only needs Tailwind. Respects `prefers-reduced-motion`: the
 * canvas still renders one frame but stops animating.
 *
 * Purely presentational. No routing, state, or data touched.
 */

'use client'

import { useEffect, useRef } from 'react'

/* ---------- Grove palette (kept in sync with tailwind.config) ---------- */
const GROVE = {
  light: {
    node:      'rgba(9, 66, 48, 0.42)',   // evergreen brand
    edge:      (a: number) => `rgba(9, 66, 48, ${a})`,
    accent:    'rgba(194, 107, 71, 0.55)', // copper — flag a few nodes
    edgeBase:  0.20,
    edgeWidth: 1.4,
  },
  dark: {
    node:      'rgba(107, 191, 149, 0.55)', // mint
    edge:      (a: number) => `rgba(107, 191, 149, ${a})`,
    accent:    'rgba(216, 121, 74, 0.6)',   // dark copper
    edgeBase:  0.24,
    edgeWidth: 1.5,
  },
}

/* Every ~7th node is a copper accent — matches Grove's identity, where
   copper appears sparingly as an accent counterpoint to the evergreen. */
const COPPER_STRIDE = 7

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const isDarkMode = () => document.documentElement.classList.contains('dark')
    const reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const nodes: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      copper: boolean
    }> = []

    const nodeCount = 60
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        radius: Math.random() * 2.5 + 2.5, // 2.5–5px — a touch quieter than v1
        copper: i % COPPER_STRIDE === 0,
      })
    }

    let animationId: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const tokens = isDarkMode() ? GROVE.dark : GROVE.light

      nodes.forEach((node) => {
        if (!reducedMotion) {
          node.x += node.vx
          node.y += node.vy
          if (node.x < 0 || node.x > canvas.width) node.vx *= -1
          if (node.y < 0 || node.y > canvas.height) node.vy *= -1
        }
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = node.copper ? tokens.accent : tokens.node
        ctx.fill()
      })

      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((otherNode) => {
          const dx = node.x - otherNode.x
          const dy = node.y - otherNode.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 150) {
            const opacity = (1 - distance / 150) * tokens.edgeBase
            ctx.beginPath()
            ctx.moveTo(node.x, node.y)
            ctx.lineTo(otherNode.x, otherNode.y)
            ctx.strokeStyle = tokens.edge(opacity)
            ctx.lineWidth = tokens.edgeWidth
            ctx.stroke()
          }
        })
      })

      if (!reducedMotion) {
        animationId = requestAnimationFrame(draw)
      }
    }

    draw()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Grove ambient orbs — cream / evergreen / copper.
          Warm evergreen and cream in the corners with a copper wash
          in the middle-left, echoing the identity's warm-editorial
          palette. Blur + low opacity keeps them ambient, not decorative. */}
      <div className="absolute top-0 left-0 w-[520px] h-[520px] rounded-full blur-3xl opacity-40 dark:opacity-20 animate-blob"
           style={{ background: 'radial-gradient(closest-side, #dae8dd, transparent 70%)' }} />
      <div className="absolute top-10 right-0 w-[520px] h-[520px] rounded-full blur-3xl opacity-35 dark:opacity-25 animate-blob animation-delay-2000"
           style={{ background: 'radial-gradient(closest-side, #6bbf95, transparent 70%)' }} />
      <div className="absolute bottom-0 left-32 w-[500px] h-[500px] rounded-full blur-3xl opacity-30 dark:opacity-20 animate-blob animation-delay-4000"
           style={{ background: 'radial-gradient(closest-side, #c26b47, transparent 70%)' }} />

      {/* Animated network canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle grid pattern — same as before, sits over the top. */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.05]" />
    </div>
  )
}
