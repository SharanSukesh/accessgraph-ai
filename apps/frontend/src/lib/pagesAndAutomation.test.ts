import { describe, expect, it } from 'vitest'
import { byObject, grantStep, groupPages, matches, pathLabel, runLabel, sortPages, type FlowRow, type PageRow } from './pagesAndAutomation'

const page = (app: string | null, rt: string): PageRow => ({
  object: 'Opportunity', app, record_type: rt, form_factor: 'Desktop', page: 'P', rule: 'Org default', considered: [],
})
const flow = (can: boolean | null, why = ''): FlowRow => ({
  id: 'f', api_name: 'F', label: 'F', process_type: 'Flow', trigger_type: null, active: true, restricted: false,
  via: [], can_run: can, why,
})

describe('pages and automation helpers', () => {
  it('groups pages by object and app, with "any other app" last', () => {
    const g = groupPages([page(null, 'Master'), page('Sales', 'Master'), page('Sales', 'Renewal')])
    expect(g).toHaveLength(1)
    expect(g[0].apps.map((a) => a.app)).toEqual(['Sales', 'Any other app'])
    expect(g[0].apps[0].rows).toHaveLength(2)
  })

  it('says in words whether a flow can run', () => {
    expect(runLabel(flow(true))).toBe('Can run')
    expect(runLabel(flow(false))).toBe("Can't run")
    expect(runLabel(flow(null, 'Starts on its own (record change)'))).toBe('Runs on its own')
    expect(runLabel(flow(null, "Depends on the Run Flows permission, which wasn't read."))).toBe('Unknown')
    expect(pathLabel(['Permission set group: Bundle', 'Permission set: X'])).toBe('Permission set group: Bundle → Permission set: X')
  })
})

describe('pages and automation tab helpers', () => {
  it('reads each step of a grant path as a typed chip', () => {
    expect(grantStep('Profile: Sales Rep')).toEqual({ type: 'profile', kind: 'Profile', name: 'Sales Rep' })
    expect(grantStep('Permission set group: Sales Manager Bundle')).toEqual({
      type: 'permission_set_group', kind: 'Group', name: 'Sales Manager Bundle',
    })
    expect(grantStep('Permission set: Discount Approvals')).toEqual({ type: 'permission_set', kind: 'Permission set', name: 'Discount Approvals' })
    expect(grantStep('Flow User (user setting)')).toEqual({ type: 'user', kind: 'User setting', name: 'Flow User' })
  })

  it('searches names and grant paths, case-insensitively', () => {
    expect(matches('', 'x')).toBe(true)
    expect(matches('acc', 'Account')).toBe(true)
    expect(matches('bundle', 'Flow', [['Permission set group: Sales Bundle', 'Permission set: P']])).toBe(true)
    expect(matches('zzz', 'Account', null, [['Profile: Sales Rep']])).toBe(false)
  })

  it('groups by object and orders record pages', () => {
    expect(byObject([{ object: 'Case' }, { object: 'Account' }, { object: 'Case' }]).map((g) => [g.object, g.rows.length])).toEqual([
      ['Account', 1], ['Case', 2],
    ])
    expect(sortPages([page(null, 'B'), page('Sales', 'B'), page('Sales', 'A')]).map((r) => `${r.app}:${r.record_type}`)).toEqual([
      'Sales:A', 'Sales:B', 'null:B',
    ])
  })
})
