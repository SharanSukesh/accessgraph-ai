import { describe, expect, it } from 'vitest'
import { apiParams, nextListState, rangeLabel, readListState, writeListState } from './listState'

describe('list state in the URL', () => {
  it('reads defaults and ignores bad values', () => {
    const s = readListState(new URLSearchParams('page=0&size=7&dir=up'), '', { sort: 'name' })
    expect(s).toEqual({ page: 1, pageSize: 25, sort: 'name', dir: 'asc', q: '', filters: {} })
  })

  it('round-trips with a prefix and leaves defaults out of the URL', () => {
    const base = new URLSearchParams('tab=users&other=1')
    const d = { sort: 'name', filters: ['kind'] }
    const s = { page: 3, pageSize: 50 as const, sort: 'users', dir: 'desc' as const, q: 'fin', filters: { kind: 'profile' } }
    const url = writeListState(base, s, 'u', d)
    expect(url.toString()).toBe('tab=users&other=1&u.page=3&u.size=50&u.sort=users&u.dir=desc&u.q=fin&u.kind=profile')
    expect(readListState(url, 'u', d)).toEqual(s)
    const plain = writeListState(base, { ...s, page: 1, pageSize: 25, sort: 'name', dir: 'asc', q: '', filters: {} }, 'u', d)
    expect(plain.toString()).toBe('tab=users&other=1')
  })

  it('returns to page 1 on any change except the page itself', () => {
    const s = readListState(new URLSearchParams('page=4'))
    expect(nextListState(s, { page: 5 }).page).toBe(5)
    expect(nextListState(s, { q: 'x' }).page).toBe(1)
    expect(nextListState(s, { pageSize: 100 }).page).toBe(1)
    expect(nextListState(s, { filters: { kind: 'group' } }).page).toBe(1)
    expect(nextListState(s, { sort: 'name', dir: 'desc' }).page).toBe(1)
  })

  it('builds API parameters and the range label', () => {
    const s = readListState(new URLSearchParams('page=2&size=100&sort=name&q=a%20b&kind=x'), '', { filters: ['kind'] })
    expect(apiParams(s)).toEqual({ page: '2', page_size: '100', dir: 'asc', sort: 'name', q: 'a b', kind: 'x' })
    expect(rangeLabel(1, 25, 403)).toBe('Showing 1–25 of 403')
    expect(rangeLabel(17, 25, 403)).toBe('Showing 401–403 of 403')
    expect(rangeLabel(1, 25, 0)).toBe('Showing 0 of 0')
    expect(rangeLabel(2, 100, 2500)).toBe('Showing 101–200 of 2,500')
  })
})
