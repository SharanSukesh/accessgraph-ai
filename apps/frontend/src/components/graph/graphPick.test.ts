import { describe, expect, it } from 'vitest'
import { pickTabs, visibleGraph } from './graphPick'

const graph = {
  nodes: [
    { id: 'u', type: 'user', label: 'Jun', properties: {} },
    { id: 'p', type: 'profile', label: 'Sales Manager', properties: {} },
    { id: 'object_Account', type: 'object', label: 'Account', properties: { objectName: 'Account', fields: [1, 2] } },
    { id: 'layout_Opportunity_L', type: 'layout', label: 'Opp Layout', properties: { object: 'Opportunity', recordTypes: ['New Business', 'Renewal'] } },
    { id: 'apex_class_1', type: 'apex_class', label: 'QuoteService', properties: { namespace: 'abc' } },
    { id: 'flow_1', type: 'flow', label: 'Case Triage', properties: { process_type: 'Flow', trigger_type: null } },
    { id: 'flow_2', type: 'flow', label: 'Account Owner Notification', properties: { process_type: 'AutoLaunchedFlow', trigger_type: 'RecordAfterSave' } },
  ],
  edges: [
    { source: 'u', target: 'p', type: 'HAS_PROFILE' },
    { source: 'p', target: 'layout_Opportunity_L', type: 'USES_LAYOUT' },
    { source: 'p', target: 'flow_1', type: 'GRANTS_FLOW' },
  ],
}

describe('graph picker', () => {
  it('offers each element type from the graph, with a detail line', () => {
    const tabs = Object.fromEntries(pickTabs(graph).map((t) => [t.key, t.items]))
    expect(tabs.object).toEqual([{ id: 'object_Account', name: 'Account', detail: '2 fields' }])
    expect(tabs.layout[0].detail).toBe('Opportunity · New Business, Renewal')
    expect(tabs.apex_class[0].name).toBe('abc.QuoteService')
    expect(tabs.flow.map((f) => [f.name, f.detail])).toEqual([
      ['Account Owner Notification', 'Record-triggered flow'],
      ['Case Triage', 'Screen flow'],
    ])
    expect(tabs.lightning_page).toEqual([])
  })

  it('gives the legend only what is drawn', () => {
    const none = visibleGraph(graph, [], [])!
    expect(none.nodes.map((n) => n.type)).toEqual(['user', 'profile'])
    const some = visibleGraph(graph, ['Account'], ['flow_1'])!
    expect(some.nodes.map((n) => n.id)).toEqual(['u', 'p', 'object_Account', 'flow_1'])
    expect(some.edges.map((e) => e.type)).toEqual(['HAS_PROFILE', 'GRANTS_FLOW'])
  })
})
