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

    // Detect dark mode
    const isDarkMode = () => document.documentElement.classList.contains('dark')

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

    // Create nodes - larger for better visibility
    const nodeCount = 50
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 3 + 3, // Increased to 3-6px for better visibility
      })
    }

    // Animation loop
    let animationId: number
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Check current theme
      const darkMode = isDarkMode()

      // Adjust colors based on theme
      // Light mode: darker, more opaque for visibility on white background
      // Dark mode: lighter, less opaque for subtlety on dark background
      const nodeColor = darkMode
        ? 'rgba(124, 58, 237, 0.7)' // Dark mode: lighter opacity
        : 'rgba(109, 40, 217, 0.9)'  // Light mode: darker purple (primary-700), higher opacity

      const edgeBaseOpacity = darkMode ? 0.3 : 0.5 // Higher in light mode
      const edgeWidth = darkMode ? 2 : 2.5 // Slightly thicker in light mode

      // Update and draw nodes
      nodes.forEach((node) => {
        // Update position
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1

        // Draw node - adapt to theme
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = nodeColor
        ctx.fill()
      })

      // Draw connections - adapt to theme
      nodes.forEach((node, i) => {
        nodes.slice(i + 1).forEach((otherNode) => {
          const dx = node.x - otherNode.x
          const dy = node.y - otherNode.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) {
            ctx.beginPath()
            ctx.moveTo(node.x, node.y)
            ctx.lineTo(otherNode.x, otherNode.y)
            const opacity = (1 - distance / 150) * edgeBaseOpacity
            const edgeColor = darkMode
              ? `rgba(124, 58, 237, ${opacity})` // Dark mode
              : `rgba(109, 40, 217, ${opacity})`  // Light mode: darker
            ctx.strokeStyle = edgeColor
            ctx.lineWidth = edgeWidth
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
