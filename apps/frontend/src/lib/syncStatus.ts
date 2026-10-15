/** Sync job states while the sync (and the analysis it runs at the end) is still going. */
export function isSyncActive(status?: string | null): boolean {
  return status === 'pending' || status === 'running'
}

/** True when a sync that was active has just reached a final state. */
export function syncJustFinished(previous?: string | null, current?: string | null): boolean {
  return isSyncActive(previous) && !!current && !isSyncActive(current)
}
