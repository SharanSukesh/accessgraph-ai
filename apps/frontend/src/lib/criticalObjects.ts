import type { ObjectScore } from '@/lib/api/hooks/useDataQuality'

const ORDER: Record<string, number> = { stale: 0, mostly_empty: 1, never_populated: 2 }

/** Objects with at least one critical flag, worst first (stale, then mostly
 * empty, then unused fields; larger objects first within each). */
export function criticalObjects(scores: ObjectScore[] | undefined): ObjectScore[] {
  return (scores ?? [])
    .filter((s) => (s.critical_flags ?? []).length > 0)
    .sort((a, b) => {
      const rank = (s: ObjectScore) => Math.min(...(s.critical_flags ?? []).map((f) => ORDER[f.code] ?? 9))
      return rank(a) - rank(b) || b.record_count - a.record_count
    })
}

/** Caveats that apply to an object's counts, in words. */
export function countCaveats(s: ObjectScore): string[] {
  return [s.estimate_label, s.coverage_label].filter((c): c is string => !!c)
}
