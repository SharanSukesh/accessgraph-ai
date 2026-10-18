'use client'

/**
 * Per-visual download (roadmap item 3): saves just this visual as an image,
 * as a 16:9 slide or a tight crop, PNG (optionally transparent) or JPEG.
 * Disabled, with the reason, when the visual can't be drawn yet.
 */

import { useEffect, useRef, useState } from 'react'
import { ImageDown } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import { useImagePack } from '@/lib/api/hooks/useImagePack'
import { IMAGE_CHOICES, type VisualKey, visualQuery } from '@/lib/imagePack'

export function VisualDownloadButton({ orgId, visual }: { orgId: string; visual: VisualKey }) {
  const { data } = useImagePack(orgId)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const info = data?.visuals.find((v) => v.key === visual)
  if (!info) return null
  const label = `Download ${info.title} as an image`

  return (
    <div className="relative inline-block" ref={box}>
      <button
        type="button"
        disabled={!info.available}
        onClick={() => setOpen((o) => !o)}
        title={info.available ? label : info.note ?? undefined}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-grove-border px-2 py-1 text-xs font-medium text-grove-ink/80 hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-grove-border-dk dark:text-grove-ink-dk/80 dark:hover:bg-primary-900/15"
      >
        <ImageDown className="h-3.5 w-3.5" aria-hidden /> Image
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-grove-border bg-grove-surface p-1 shadow-grove-lift dark:border-grove-border-dk dark:bg-grove-surface-dk"
        >
          {IMAGE_CHOICES.map((c) => (
            <a
              key={c.label}
              role="menuitem"
              href={`${API_BASE_URL}${endpoints.imagePackVisual(orgId, visual)}?${visualQuery(c.choice)}`}
              onClick={() => setOpen(false)}
              className="block rounded px-2.5 py-1.5 text-xs hover:bg-primary-50/50 dark:hover:bg-primary-900/20"
            >
              <span className="font-medium text-grove-ink dark:text-grove-ink-dk">{c.label}</span>
              <span className="block text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">{c.hint}</span>
            </a>
          ))}
          {data?.is_demo && (
            <p className="border-t border-grove-border px-2.5 py-1.5 text-[11px] text-amber-700 dark:border-grove-border-dk dark:text-amber-300">
              Demo org: every image carries the &ldquo;Demo data&rdquo; label.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
