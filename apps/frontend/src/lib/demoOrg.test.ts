import { describe, expect, it } from 'vitest'
import { unavailableForDemo } from './demoOrg'

describe('demo org availability', () => {
  it('greys out live-only pages and Record Access for demo orgs only', () => {
    for (const slug of ['equity', 'sprawl', 'records']) {
      expect(unavailableForDemo(true, slug)).toBe(true)
      expect(unavailableForDemo(false, slug)).toBe(false)
    }
    expect(unavailableForDemo(true, 'org-analyzer')).toBe(false)
    expect(unavailableForDemo(true, 'license-fit')).toBe(false)
    // Change Risk reads the fixture's Setup Audit Trail on a demo org (item 14).
    expect(unavailableForDemo(true, 'change-risk')).toBe(false)
  })
})
