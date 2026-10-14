import { describe, expect, it } from 'vitest'
import { isSyncActive, syncJustFinished } from './syncStatus'

describe('sync status', () => {
  it('treats pending and running as active', () => {
    expect(isSyncActive('pending')).toBe(true)
    expect(isSyncActive('running')).toBe(true)
    expect(isSyncActive('completed')).toBe(false)
    expect(isSyncActive(undefined)).toBe(false)
  })

  it('fires once when an active sync ends', () => {
    expect(syncJustFinished('running', 'completed')).toBe(true)
    expect(syncJustFinished('pending', 'failed')).toBe(true)
    expect(syncJustFinished('completed', 'completed')).toBe(false)
    expect(syncJustFinished(undefined, 'completed')).toBe(false)
    expect(syncJustFinished('running', 'running')).toBe(false)
  })
})
