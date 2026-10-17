import type { EquityDiagnostic } from '@/lib/api/hooks/useEquity'

// Empty-state copy for the suggested grants section. Different message
// based on which signal is missing, so admins know what to fix instead
// of seeing a generic "no data" placeholder.
export function suggestedGrantsEmpty(
  d: EquityDiagnostic | undefined,
): { title: string; description: string } {
  if (!d?.has_data) {
    return {
      title: 'No equity snapshot yet',
      description:
        'Click "Generate recommendations" above to compute the first batch.',
    }
  }
  if (d.vip_count === 0) {
    return {
      title: 'No VIPs to anchor recommendations',
      description:
        'Set ManagerId on a user in Salesforce, or pin one via the ' +
        'vip_designations table. Then click Generate again.',
    }
  }
  if (d.reason === 'no_disparity') {
    return {
      title: 'No disparity to close',
      description:
        'Every group is equally close to VIP resources, so Equity added ' +
        'nothing to Priority Actions.',
    }
  }
  if (d.recommendations_generated === 0) {
    return {
      title: 'No improvements found',
      description:
        'The policy could not find grants that meaningfully reduce ' +
        'disparity for the current data. Try syncing the org for fresh ' +
        'permission state, or increasing the budget.',
    }
  }
  return {
    title: 'No equity recommendations',
    description:
      'Recommendations may have been cleared. Click "Generate ' +
      'recommendations" to run a fresh batch.',
  }
}
