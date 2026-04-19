/**
 * AccessGraph Logo Component
 */

interface LogoProps {
  variant?: 'full' | 'icon'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Logo({ variant = 'full', className = '', size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 40, text: 'text-2xl' },
  }

  const iconSize = sizes[size].icon
  const textSize = sizes[size].text

  // Logo icon - 3D cube network structure in purple
  const LogoIcon = () => (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer vertices */}
      <circle cx="50" cy="10" r="6" fill="#8b5cf6" />
      <circle cx="15" cy="30" r="6" fill="#8b5cf6" />
      <circle cx="85" cy="30" r="6" fill="#8b5cf6" />
      <circle cx="15" cy="70" r="6" fill="#8b5cf6" />
      <circle cx="85" cy="70" r="6" fill="#8b5cf6" />
      <circle cx="50" cy="90" r="6" fill="#8b5cf6" />

      {/* Center vertex */}
      <circle cx="50" cy="50" r="8" fill="#7c3aed" />

      {/* Edges - top face */}
      <line x1="50" y1="10" x2="15" y2="30" stroke="#8b5cf6" strokeWidth="3" />
      <line x1="50" y1="10" x2="85" y2="30" stroke="#8b5cf6" strokeWidth="3" />
      <line x1="15" y1="30" x2="85" y2="30" stroke="#8b5cf6" strokeWidth="3" />

      {/* Edges - bottom face */}
      <line x1="50" y1="90" x2="15" y2="70" stroke="#8b5cf6" strokeWidth="3" />
      <line x1="50" y1="90" x2="85" y2="70" stroke="#8b5cf6" strokeWidth="3" />
      <line x1="15" y1="70" x2="85" y2="70" stroke="#8b5cf6" strokeWidth="3" />

      {/* Vertical edges */}
      <line x1="15" y1="30" x2="15" y2="70" stroke="#8b5cf6" strokeWidth="3" />
      <line x1="85" y1="30" x2="85" y2="70" stroke="#8b5cf6" strokeWidth="3" />

      {/* Center connections */}
      <line x1="50" y1="10" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
      <line x1="50" y1="90" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
      <line x1="15" y1="30" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
      <line x1="85" y1="30" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
      <line x1="15" y1="70" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
      <line x1="85" y1="70" x2="50" y2="50" stroke="#7c3aed" strokeWidth="3" />
    </svg>
  )

  if (variant === 'icon') {
    return <LogoIcon />
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <LogoIcon />
      <span className={`font-bold ${textSize}`}>
        <span className="text-gray-900 dark:text-white">Access</span>
        <span className="text-primary-600 dark:text-primary-400">Graph</span>
      </span>
    </div>
  )
}
