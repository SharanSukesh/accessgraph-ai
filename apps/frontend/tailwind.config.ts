import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Severity badges in the Org Analyzer compute their class string from
  // a lookup dict. Tailwind's static scanner can't always trace that
  // through, so the bg-red-700 / bg-yellow-500 classes occasionally
  // dropped out of the production build. Safelist guarantees they ship.
  safelist: [
    'bg-red-700', 'bg-red-500', 'bg-amber-500', 'bg-yellow-500', 'bg-blue-500',
    'text-white', 'text-gray-900',
    // Grove copper accent — used in card corner accents, badges, and PageHeader
    'bg-copper-100', 'bg-copper-500', 'bg-copper-600',
    'text-copper-600', 'text-copper-700',
    'border-copper-200', 'border-copper-500',
    // Grove primary hits every route via the base palette — no need to safelist.
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Grove — deep evergreen brand anchored at 700 for the light-mode
        // brand (#094230) and 400 for the dark-mode brand (#6bbf95). The
        // scale interpolates outward from those two anchor points so every
        // existing `primary-*` class in the codebase swaps to Grove
        // automatically without site-wide find/replace.
        primary: {
          50:  '#f0f5f0',
          100: '#dae8dd',
          200: '#b8d1c0',
          300: '#8fb69c',
          400: '#6bbf95', // dark-mode brand (Grove dark)
          500: '#2e8064',
          600: '#146b4a',
          700: '#094230', // light-mode brand (Grove light)
          800: '#062e22',
          900: '#04211a',
        },
        // Grove neutrals — the warm cream / warm ink ladder the identity
        // uses. Exposed as its own scale so components can reach for it
        // without redefining tokens.
        grove: {
          canvas:      '#f6f2e7',  // page background (light)
          surface:     '#fdfaf1',  // card surface (light)
          ink:         '#16221a',  // primary text (light)
          border:      '#e2ddc9',  // hairline border (light)
          'canvas-dk': '#0c1a14',  // page background (dark)
          'surface-dk':'#132821',  // card surface (dark)
          'ink-dk':    '#eee8d3',  // primary text (dark)
          'border-dk': '#1e3529',  // hairline border (dark)
        },
        // Grove copper accent — the warm counterpoint to evergreen.
        // Used sparingly on hero card corner brackets, PageHeader icon
        // tiles, and the "Recommended" badge.
        copper: {
          50:  '#fbf1e8',
          100: '#f4dcc5',
          200: '#ecc39c',
          300: '#e0a674',
          400: '#d68954',
          500: '#c26b47', // primary copper accent
          600: '#a2542f',
          700: '#7d3f21',
          800: '#5a2d17',
          900: '#3d1d0e',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },
        success: {
          50:  '#eaf5ed',
          100: '#cfe6d6',
          500: '#2e8b57',
          600: '#1f7548',
          700: '#155a37',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        // Grove signature: serif for numerals in metric cards + report
        // covers. Used via `font-serif` on tabular-number columns.
        serif: [
          '"Iowan Old Style"', '"Charter"', '"Georgia"',
          '"Times New Roman"', 'serif',
        ],
      },
      boxShadow: {
        // Grove hover-lift — subtle warm shadow that respects the cream
        // ground. Uses ink @ low opacity so it darkens rather than tints.
        'grove-lift': '0 1px 2px 0 rgb(22 34 26 / 0.05), 0 8px 24px -12px rgb(22 34 26 / 0.12)',
        'grove-hero': '0 1px 2px 0 rgb(22 34 26 / 0.05), 0 12px 32px -16px rgb(9 66 48 / 0.20)',
      },
      keyframes: {
        // Grove card entrance / hover glow keyframes — subtle warm
        // transitions used by MetricCard + hero stat panels.
        'grove-hover-glow': {
          '0%':   { boxShadow: '0 0 0 0 rgb(194 107 71 / 0)' },
          '100%': { boxShadow: '0 0 0 3px rgb(194 107 71 / 0.15)' },
        },
        'grove-slide-in': {
          '0%':   { transform: 'translateX(-6px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'grove-fade-up': {
          '0%':   { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'grove-copper-shimmer': {
          '0%,100%': { opacity: '0.6' },
          '50%':     { opacity: '1' },
        },
      },
      animation: {
        'grove-slide-in':      'grove-slide-in 220ms ease-out forwards',
        'grove-fade-up':       'grove-fade-up 240ms ease-out forwards',
        'grove-copper-shimmer':'grove-copper-shimmer 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
