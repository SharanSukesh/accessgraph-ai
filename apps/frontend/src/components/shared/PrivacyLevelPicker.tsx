'use client'

/**
 * Radio cards for choosing a client org's privacy level, plus the
 * aggregate-statistics opt-in shown for Metadata only. Used by the
 * connect dialog and the Privacy page.
 */

import { Check, Eye, EyeOff, UserRoundX } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  AGGREGATES_HINT,
  AGGREGATES_LABEL,
  PRIVACY_LEVELS,
  PRIVACY_MODES,
  type PrivacyMode,
} from '@/lib/privacy'

const ICONS: Record<PrivacyMode, typeof Eye> = {
  full: Eye,
  masked: UserRoundX,
  metadata_only: EyeOff,
}

export function PrivacyLevelPicker({
  name,
  value,
  onChange,
  aggregates,
  onAggregatesChange,
  disabled = false,
}: {
  name: string
  value: PrivacyMode
  onChange: (mode: PrivacyMode) => void
  aggregates: boolean
  onAggregatesChange: (allow: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Privacy level" className="space-y-2">
        {PRIVACY_MODES.map((mode) => {
          const selected = value === mode
          const Icon = ICONS[mode]
          return (
            <label
              key={mode}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors duration-150',
                'focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-1',
                selected
                  ? 'border-primary-500/70 bg-primary-50/70 dark:border-primary-600 dark:bg-primary-900/20'
                  : 'border-grove-border bg-grove-surface hover:border-primary-300 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:hover:border-primary-700',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name={name}
                value={mode}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(mode)}
                className="sr-only"
              />
              <span
                className={cn(
                  'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
                  selected
                    ? 'bg-primary-700 text-grove-canvas ring-primary-700 dark:bg-primary-600 dark:ring-primary-600'
                    : 'bg-grove-canvas text-grove-ink/60 ring-grove-border dark:bg-grove-canvas-dk dark:text-grove-ink-dk/60 dark:ring-grove-border-dk',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {PRIVACY_LEVELS[mode].label}
                  {selected && <Check className="h-3.5 w-3.5 text-primary-700 dark:text-primary-400" />}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                  {PRIVACY_LEVELS[mode].summary}
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {value === 'metadata_only' && (
        <label
          className={cn(
            'ml-11 flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-sm',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          <input
            type="checkbox"
            checked={aggregates}
            disabled={disabled}
            onChange={(e) => onAggregatesChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-grove-border text-primary-700 focus:ring-primary-500 dark:border-grove-border-dk"
          />
          <span>
            <span className="font-medium text-grove-ink dark:text-grove-ink-dk">{AGGREGATES_LABEL}</span>
            <span className="mt-0.5 block text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
              {AGGREGATES_HINT}
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
