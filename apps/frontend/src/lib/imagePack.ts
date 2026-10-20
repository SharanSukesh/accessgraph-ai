/**
 * Image pack (backend services/report/image_pack.py): the Health Report's
 * visuals as PNG/JPEG images, one at a time or as a ZIP / PowerPoint set.
 * The images carry no logos or demo label: they go into the consultant's
 * own branded slides. 'summary' is the key figures on one slide.
 */

export type VisualKey =
  | 'summary'
  | 'health_score'
  | 'savings'
  | 'risk_distribution'
  | 'top_anomalies'
  | 'license_fit'
  | 'compliance'
  | 'critical_objects'
  | 'code_coverage'
  | 'api_usage'
  | 'data_model'

export interface VisualAvailability {
  key: VisualKey
  title: string
  available: boolean
  note: string | null
  user_level: boolean
}

export interface ImagePackListing {
  visuals: VisualAvailability[]
  is_demo: boolean
}

export type ImageFormat = 'png' | 'jpeg'
export type ImageLayout = 'slide' | 'crop'

export interface ImageChoice {
  format: ImageFormat
  transparent: boolean
  layout: ImageLayout
}

/** The per-visual download menu, in the order it lists them. */
export const IMAGE_CHOICES: { label: string; hint: string; choice: ImageChoice }[] = [
  { label: 'Slide, PNG', hint: '16:9, 3840×2160', choice: { format: 'png', transparent: false, layout: 'slide' } },
  { label: 'Slide, transparent PNG', hint: 'sits on your own template', choice: { format: 'png', transparent: true, layout: 'slide' } },
  { label: 'Slide, JPEG', hint: '16:9, white background', choice: { format: 'jpeg', transparent: false, layout: 'slide' } },
  { label: 'Tight crop, PNG', hint: 'no slide frame', choice: { format: 'png', transparent: false, layout: 'crop' } },
  { label: 'Tight crop, transparent PNG', hint: 'no slide frame', choice: { format: 'png', transparent: true, layout: 'crop' } },
  { label: 'Tight crop, JPEG', hint: 'no slide frame', choice: { format: 'jpeg', transparent: false, layout: 'crop' } },
]

/** orgName: the org's name in the slide footer (no footer otherwise). */
export function visualQuery(c: ImageChoice, orgName = false): string {
  return new URLSearchParams({
    format: c.format,
    transparent: String(c.format === 'png' && c.transparent),
    layout: c.layout,
    org_name: String(orgName),
  }).toString()
}

export interface PackRequest {
  visuals: VisualKey[]
  format: ImageFormat
  transparent: boolean
  layouts: ImageLayout[]
  images: boolean
  pptx: boolean
  /** The org's name in the slide footer; slides have no footer otherwise. */
  org_name: boolean
}

/** What the dialog's choices allow, in words; null when it can be downloaded. */
export function packProblem(r: PackRequest): string | null {
  if (!r.visuals.length) return 'Tick the summary or at least one image.'
  if (!r.images && !r.pptx) return 'Choose images, a PowerPoint file, or both.'
  if (r.images && !r.layouts.length) return 'Choose at least one layout.'
  return null
}

/** "ZIP of 4 images" / "PowerPoint, 2 slides" / "ZIP of 4 images and a PowerPoint file". */
export function packSummary(r: PackRequest): string {
  const n = r.visuals.length * (r.images ? r.layouts.length : 0)
  const images = `${n} image${n === 1 ? '' : 's'}`
  if (r.images && r.pptx) return `ZIP of ${images} and a PowerPoint file`
  if (r.pptx) return `PowerPoint, ${r.visuals.length} slide${r.visuals.length === 1 ? '' : 's'}`
  return `ZIP of ${images}`
}
