import { describe, expect, it } from 'vitest'
import { v1PathFor, v2Enabled } from './v2Gate'

describe('v2 gate', () => {
  it('is off unless the flag is exactly "true"', () => {
    expect(v2Enabled(undefined)).toBe(false)
    expect(v2Enabled('false')).toBe(false)
    expect(v2Enabled('1')).toBe(false)
    expect(v2Enabled('true')).toBe(true)
  })

  it('maps every /v2 path to its v1 page', () => {
    expect(v1PathFor('/v2')).toBe('/orgs')
    expect(v1PathFor('/v2/login')).toBe('/login')
    expect(v1PathFor('/v2/orgs/abc/dashboard')).toBe('/orgs/abc/dashboard')
    expect(v1PathFor('/v2/orgs/abc/license-fit')).toBe('/orgs/abc/license-fit')
    expect(v1PathFor('/v2/orgs/abc/users/005x')).toBe('/orgs/abc/users/005x')
    expect(v1PathFor('/v2/orgs/abc/admin-users')).toBe('/admin/users')
    expect(v1PathFor('/v2/orgs/abc/permission-sets')).toBe('/orgs/abc/dashboard')
    expect(v1PathFor('/v2/orgs/abc')).toBe('/orgs/abc/dashboard')
    expect(v1PathFor('/v2/anything-else')).toBe('/orgs')
  })
})
