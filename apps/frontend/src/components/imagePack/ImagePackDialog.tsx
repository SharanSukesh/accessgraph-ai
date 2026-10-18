'use client'

/**
 * Image pack dialog (roadmap item 3): tick the visuals, choose the format,
 * layouts and logos, then download a ZIP of images, a PowerPoint file
 * (one 16:9 slide per visual), or a ZIP holding both. Visuals that can't
 * be drawn yet are listed with the reason and can't be ticked.
 */

import { useEffect, useState } from 'react'
import { Download, Loader2, X as XIcon } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { API_BASE_URL } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import { useImagePack } from '@/lib/api/hooks/useImagePack'
import {
  type ImageFormat,
  type ImageLayout,
  type PackRequest,
  type VisualKey,
  packProblem,
  packSummary,
} from '@/lib/imagePack'

const LABEL = 'text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80'
const MUTED = 'text-xs text-grove-ink/55 dark:text-grove-ink-dk/55'

function Check({
  checked,
  disabled,
  onChange,
  children,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-55' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-0.5 accent-primary-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  )
}

export function ImagePackDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data, isLoading } = useImagePack(orgId)
  const [picked, setPicked] = useState<Set<VisualKey> | null>(null)
  const [format, setFormat] = useState<ImageFormat>('png')
  const [transparent, setTransparent] = useState(false)
  const [layouts, setLayouts] = useState<ImageLayout[]>(['slide'])
  const [images, setImages] = useState(true)
  const [pptx, setPptx] = useState(false)
  const [firmLogo, setFirmLogo] = useState(true)
  const [clientLogo, setClientLogo] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Everything available is ticked to start with.
  useEffect(() => {
    if (data && picked === null) setPicked(new Set(data.visuals.filter((v) => v.available).map((v) => v.key)))
  }, [data, picked])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const visuals = data?.visuals ?? []
  const req: PackRequest = {
    visuals: visuals.filter((v) => picked?.has(v.key)).map((v) => v.key),
    format,
    transparent: format === 'png' && transparent,
    layouts,
    images,
    pptx,
    firm_logo: firmLogo,
    client_logo: clientLogo,
  }
  const problem = packProblem(req)

  const toggle = (key: VisualKey, on: boolean) => {
    const next = new Set(picked ?? [])
    on ? next.add(key) : next.delete(key)
    setPicked(next)
  }
  const toggleLayout = (l: ImageLayout, on: boolean) =>
    setLayouts((ls) => (on ? [...ls.filter((x) => x !== l), l].sort() : ls.filter((x) => x !== l)) as ImageLayout[])

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}${endpoints.imagePack(orgId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.detail === 'string' ? body.detail : `Download failed (${res.status}).`)
      }
      // The server's filename isn't readable cross-origin, so name it here
      // the same way: demo orgs' files carry the demo prefix.
      const name = `${data?.is_demo ? 'demo-' : ''}visuals.${req.pptx && !req.images ? 'pptx' : 'zip'}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-pack-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-grove-surface p-6 shadow-xl dark:bg-grove-canvas-dk"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="image-pack-title" className="text-lg font-semibold">Image pack</h2>
            <p className={`mt-1 ${MUTED}`}>
              Ready-to-drop visuals in your report branding. Names follow this client&apos;s privacy level.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-grove-ink/50 hover:text-grove-ink/80 dark:text-grove-ink-dk/50">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !data ? (
          <p className={MUTED}>Checking which visuals are ready…</p>
        ) : (
          <div className="space-y-5">
            <fieldset>
              <legend className={LABEL}>Visuals</legend>
              <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {visuals.map((v) => (
                  <Check key={v.key} checked={!!picked?.has(v.key)} disabled={!v.available} onChange={(on) => toggle(v.key, on)}>
                    {v.title}
                    {!v.available && v.note && <span className={`block ${MUTED}`}>{v.note}</span>}
                  </Check>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <fieldset>
                <legend className={LABEL}>Format</legend>
                <div className="mt-2 space-y-2 text-sm">
                  {(['png', 'jpeg'] as const).map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="format" className="accent-primary-700" checked={format === f} onChange={() => setFormat(f)} />
                      {f === 'png' ? 'PNG' : 'JPEG (always on white)'}
                    </label>
                  ))}
                  <Check checked={format === 'png' && transparent} disabled={format !== 'png'} onChange={setTransparent}>
                    Transparent background
                  </Check>
                </div>
              </fieldset>
              <fieldset>
                <legend className={LABEL}>Layouts</legend>
                <div className="mt-2 space-y-2">
                  <Check checked={layouts.includes('slide')} disabled={!images} onChange={(on) => toggleLayout('slide', on)}>
                    16:9 slide <span className={MUTED}>(3840×2160, title and caption)</span>
                  </Check>
                  <Check checked={layouts.includes('crop')} disabled={!images} onChange={(on) => toggleLayout('crop', on)}>
                    Tight crop <span className={MUTED}>(no slide frame)</span>
                  </Check>
                </div>
              </fieldset>
              <fieldset>
                <legend className={LABEL}>Download</legend>
                <div className="mt-2 space-y-2">
                  <Check checked={images} onChange={setImages}>Images (ZIP)</Check>
                  <Check checked={pptx} onChange={setPptx}>
                    PowerPoint <span className={MUTED}>(one 16:9 slide per visual)</span>
                  </Check>
                </div>
              </fieldset>
              <fieldset>
                <legend className={LABEL}>Logos on slides</legend>
                <div className="mt-2 space-y-2">
                  <Check checked={firmLogo} onChange={setFirmLogo}>Your firm&apos;s logo</Check>
                  <Check checked={clientLogo} onChange={setClientLogo}>The client&apos;s logo</Check>
                  <p className={MUTED}>Set them under Report branding.</p>
                </div>
              </fieldset>
            </div>

            {data.is_demo && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                Demo org: every image and slide carries the &ldquo;Demo data&rdquo; label, whatever the options.
              </p>
            )}
            {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-grove-border pt-4 dark:border-grove-border-dk">
              <p className={MUTED}>{problem ?? packSummary(req)}</p>
              <Button variant="primary" size="md" disabled={!!problem || busy} onClick={download}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {busy ? 'Rendering…' : 'Download'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
