import { describe, expect, it } from 'vitest'
import { fieldEditState } from './fieldPermissions'

describe('fieldEditState', () => {
  it('blocks field Edit when the object is Read only', () => {
    expect(fieldEditState(true, false)).toBe('blocked')
  })
  it('allows field Edit when the object is editable', () => {
    expect(fieldEditState(true, true)).toBe('available')
  })
  it('shows nothing when the field has no Edit', () => {
    expect(fieldEditState(false, true)).toBe('none')
    expect(fieldEditState(false, false)).toBe('none')
  })
})
