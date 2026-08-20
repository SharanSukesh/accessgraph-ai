/**
 * New Implementation workspace — client-side persistence.
 *
 * v1 keeps everything in localStorage: the questionnaire answers and
 * the pricebook overrides (negotiated unit prices + discount). No
 * backend, no auth coupling — a consultant can run a what-if in the
 * room with the client. Backend persistence is a tracked follow-up.
 */

import { type AdvisorAnswers, DEFAULT_ANSWERS } from './rules'

const ANSWERS_KEY = 'newton.advisor.answers.v1'
const PRICEBOOK_KEY = 'newton.advisor.pricebook.v1'

export interface PricebookOverrides {
  /** Global negotiated discount off list, 0–60 (%). */
  discountPct: number
  /** Per-line unit-price overrides, keyed by license persona. */
  unitOverrides: Record<string, number>
  /** Per-line seat overrides, keyed by license persona. */
  seatOverrides: Record<string, number>
}

export const DEFAULT_PRICEBOOK: PricebookOverrides = {
  discountPct: 0,
  unitOverrides: {},
  seatOverrides: {},
}

export function loadAnswers(): AdvisorAnswers | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ANSWERS_KEY)
    if (!raw) return null
    // Merge over defaults so answers saved by an older questionnaire
    // version still satisfy the current shape.
    return { ...DEFAULT_ANSWERS, ...JSON.parse(raw) }
  } catch {
    return null
  }
}

export function saveAnswers(a: AdvisorAnswers): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ANSWERS_KEY, JSON.stringify(a))
  } catch {
    // Storage full / blocked — the workspace degrades to session-only.
  }
}

export function clearAnswers(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ANSWERS_KEY)
    window.localStorage.removeItem(PRICEBOOK_KEY)
  } catch {
    /* ignore */
  }
}

export function loadPricebook(): PricebookOverrides {
  if (typeof window === 'undefined') return DEFAULT_PRICEBOOK
  try {
    const raw = window.localStorage.getItem(PRICEBOOK_KEY)
    if (!raw) return DEFAULT_PRICEBOOK
    return { ...DEFAULT_PRICEBOOK, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PRICEBOOK
  }
}

export function savePricebook(p: PricebookOverrides): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PRICEBOOK_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}
