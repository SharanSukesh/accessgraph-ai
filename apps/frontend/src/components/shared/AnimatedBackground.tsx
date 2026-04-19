/**
 * Animated Background Component
 * Professional gradient animation with animated network nodes
 */

'use client'

import { useEffect, useRef } from 'react'

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Network nodes
    const nodes: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
    }> = []

    // Create nodes - larger and more visible
    const nodeCount = 50
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 3 + 2, // Increased from 2+1 to 3+2 (2-5px)
      })
    }

    // Animation loop
    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update and draw nodes
      nodes.forEach((node) => {
        // Update position
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1

        // Draw node - larger, darker, more visible
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(124, 58, 237, 0.8)' // Darker purple (primary-600)
        ctx.fill()
      })

      // Draw connections - thicker, darker, more visible
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((otherNode) => {
          const dx = node.x - otherNode.x
          const dy = node.y - otherNode.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) {
            ctx.beginPath()
            ctx.moveTo(node.x, node.y)
            ctx.lineTo(otherNode.x, otherNode.y)
            const opacity = (1 - distance / 150) * 0.4 // Increased from 0.3
            ctx.strokeStyle = `rgba(124, 58, 237, ${opacity})` // Darker purple
            ctx.lineWidth = 2 // Increased from 1 to 2px
            ctx.stroke()
          }
        })
      })

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Animated gradient orbs - more visible */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-300 dark:bg-purple-800 rounded-full blur-3xl opacity-30 dark:opacity-15 animate-blob" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-300 dark:bg-pink-800 rounded-full blur-3xl opacity-30 dark:opacity-15 animate-blob animation-delay-2000" />
      <div className="absolute bottom-0 left-20 w-[500px] h-[500px] bg-indigo-300 dark:bg-indigo-800 rounded-full blur-3xl opacity-30 dark:opacity-15 animate-blob animation-delay-4000" />

      {/* Animated network canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] dark:opacity-[0.06]" />
    </div>
  )
}
