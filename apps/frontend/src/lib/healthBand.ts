/**
 * Health score bands, the same as the backend's (_HEALTH_BAND in
 * services/org_analyzer.py) so the score card, the executive summary and
 * the PDF never disagree.
 */
export const HEALTH_BANDS: { min: number; label: string; tone: 'good' | 'warning' | 'serious' | 'critical' }[] = [
  { min: 90, label: 'Excellent', tone: 'good' },
  { min: 75, label: 'Good', tone: 'good' },
  { min: 60, label: 'Needs attention', tone: 'warning' },
  { min: 40, label: 'Concerning', tone: 'serious' },
  { min: 0, label: 'Critical', tone: 'critical' },
]

export function healthBand(score: number) {
  return HEALTH_BANDS.find((b) => score >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1]
}
