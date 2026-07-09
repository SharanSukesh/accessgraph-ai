/**
 * AccessGraph Logo — Grove edition.
 *
 * Same geometric graph-network mark, retinted to Grove: deep evergreen
 * outer vertices, warm copper center node. The mark reads as a
 * pared-back version of the app's own graph atmosphere. Purely visual;
 * accepts the same props as before so every existing call-site keeps
 * working without a change.
 */

interface LogoProps {
  variant?: 'full' | 'icon'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/* Grove tokens — kept as literals so the SVG doesn't need to reach into
   CSS custom properties (which don't resolve inside <fill> in some
   older Safari builds). If the theme changes, swap these three. */
const OUTER = '#094230'  // Grove evergreen brand (primary-700)
const OUTER_DARK = '#6bbf95' // Grove mint — only used when dark mode wraps
const CENTER = '#c26b47' // Copper accent
const EDGE_ALPHA = 'rgba(9, 66, 48, 0.82)'  // Slightly transparent edge

export function Logo({ variant = 'full', className = '', size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  }
  const iconSize = sizes[size].icon
  const textSize = sizes[size].text

  const LogoIcon = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} text-primary-700 dark:text-primary-400`}
      aria-hidden
    >
      {/* Outer vertices — the six graph nodes. currentColor lets Tailwind
          drive light/dark: evergreen in light, mint in dark. */}
      <circle cx="50" cy="10" r="5.5" fill="currentColor" />
      <circle cx="15" cy="30" r="5.5" fill="currentColor" />
      <circle cx="85" cy="30" r="5.5" fill="currentColor" />
      <circle cx="15" cy="70" r="5.5" fill="currentColor" />
      <circle cx="85" cy="70" r="5.5" fill="currentColor" />
      <circle cx="50" cy="90" r="5.5" fill="currentColor" />

      {/* Center vertex — the copper accent. This is the single warm note
          Grove uses to anchor a mostly-evergreen composition. */}
      <circle cx="50" cy="50" r="7" fill={CENTER} />

      {/* Edges use currentColor at a strong opacity so they follow theme */}
      <g stroke="currentColor" strokeWidth="2.4" opacity="0.85">
        {/* Top face */}
        <line x1="50" y1="10" x2="15" y2="30" />
        <line x1="50" y1="10" x2="85" y2="30" />
        <line x1="15" y1="30" x2="85" y2="30" />
        {/* Bottom face */}
        <line x1="50" y1="90" x2="15" y2="70" />
        <line x1="50" y1="90" x2="85" y2="70" />
        <line x1="15" y1="70" x2="85" y2="70" />
        {/* Verticals */}
        <line x1="15" y1="30" x2="15" y2="70" />
        <line x1="85" y1="30" x2="85" y2="70" />
      </g>

      {/* Center spokes — copper, matching the center node */}
      <g stroke={CENTER} strokeWidth="2.4" opacity="0.9">
        <line x1="50" y1="10" x2="50" y2="50" />
        <line x1="50" y1="90" x2="50" y2="50" />
        <line x1="15" y1="30" x2="50" y2="50" />
        <line x1="85" y1="30" x2="50" y2="50" />
        <line x1="15" y1="70" x2="50" y2="50" />
        <line x1="85" y1="70" x2="50" y2="50" />
      </g>
    </svg>
  )

  if (variant === 'icon') {
    return <LogoIcon />
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <LogoIcon />
      <span className={`font-bold ${textSize}`}>
        <span className="text-grove-ink dark:text-grove-ink-dk">Access</span>
        <span className="text-primary-700 dark:text-primary-400">Graph</span>
      </span>
    </div>
  )
}
