import { describe, expect, it } from 'vitest'
import { groupPages, pathLabel, runLabel, type FlowRow, type PageRow } from './pagesAndAutomation'

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
