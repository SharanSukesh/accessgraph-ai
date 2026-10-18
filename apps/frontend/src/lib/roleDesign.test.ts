import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  canDrop,
  personRecords,
  DesignError,
  diff,
  pushOperation,
  toApiName,
  treeOf,
  type DesignBase,
  type Operation,
} from './roleDesign'

const base: DesignBase = {
  roles: [
    { id: 'R1', name: 'CEO', developer_name: 'CEO', parent_id: null },
    { id: 'R2', name: 'VP Sales', developer_name: 'VP_Sales', parent_id: 'R1' },
    { id: 'R3', name: 'Sales Rep', developer_name: 'Sales_Rep', parent_id: 'R2' },
    { id: 'R4', name: 'VP Finance', developer_name: 'VP_Finance', parent_id: 'R1' },
  ],
  users: { u1: 'R2', u2: 'R3', u3: 'R4' },
  synced_at: null,
}

const fails = (ops: Operation[]) => {
  try {
    applyOperations(base, ops)
  } catch (e) {
    return e instanceof DesignError ? [e.message, e.index] : ['other', -1]
  }
  return null
}

describe('role design replay (matches the backend)', () => {
  it('replays moves, new roles, renames and user moves', () => {
    const s = applyOperations(base, [
      { op: 'create_role', role_id: 'new:1', name: 'Sales Ops', developer_name: 'Sales_Ops', parent_id: 'R2' },
      { op: 'move_user', user_id: 'u2', role_id: 'new:1' },
      { op: 'move_role', role_id: 'R3', parent_id: 'R4' },
      { op: 'rename_role', role_id: 'R4', name: 'CFO' },
    ])
    expect(s.roles.R3.parent_id).toBe('R4')
    expect(s.users.u2).toBe('new:1')
    const d = diff(base, s)
    expect(d.count).toBe(4)
    expect(d.created.map((r) => r.name)).toEqual(['Sales Ops'])
    // Children sort by their names in the draft: CFO (renamed VP Finance) before VP Sales.
    expect(treeOf(s).children.R1).toEqual(['R4', 'R2'])
  })

  it('blocks cycles and unsafe deletes with the same messages', () => {
    expect(fails([{ op: 'move_role', role_id: 'R1', parent_id: 'R3' }])).toEqual([
      "A role can't move under itself or one of the roles below it.", 0,
    ])
    expect(fails([{ op: 'delete_role', role_id: 'R3' }])?.[0]).toBe('Move its users to another role first.')
    expect(fails([{ op: 'delete_role', role_id: 'R2' }])?.[0]).toBe('Move the roles below it first.')
    expect(fails([{ op: 'create_role', role_id: 'new:2', name: 'X', developer_name: 'vp_sales', parent_id: null }])?.[0]).toBe(
      'Another role already uses the API name vp_sales.',
    )
    expect(fails([{ op: 'create_role', role_id: 'new:2', name: 'X', developer_name: 'A__B', parent_id: null }])?.[0]).toMatch(/^API name/)
    expect(fails([{ op: 'rename_role', role_id: 'R2', name: 'VP', developer_name: 'VP' }])?.[0]).toMatch(/can't change/)
  })

  it('knows where a role may be dropped', () => {
    const s = applyOperations(base, [])
    expect(canDrop(s, 'R2', 'R3')).toBe(false)
    expect(canDrop(s, 'R2', 'R2')).toBe(false)
    expect(canDrop(s, 'R3', 'R4')).toBe(true)
    expect(canDrop(s, 'R3', null)).toBe(true)
  })

  it('undo then a new edit drops the redo tail', () => {
    const a: Operation = { op: 'move_user', user_id: 'u1', role_id: 'R4' }
    const b: Operation = { op: 'move_user', user_id: 'u2', role_id: 'R4' }
    const c: Operation = { op: 'move_user', user_id: 'u3', role_id: 'R2' }
    expect(pushOperation([a, b], 1, c)).toEqual({ ops: [a, c], position: 2 })
  })

  it('suggests an API name from a role name', () => {
    expect(toApiName('Sales Ops, EMEA')).toBe('Sales_Ops_EMEA')
    expect(toApiName('  2nd line support ')).toBe('Role_2nd_line_support')
    expect(toApiName('Café & Bar')).toBe('Cafe_Bar')
  })
})

describe('impact labels', () => {
  it('never shows an uncounted total as zero', () => {
    expect(personRecords({ records: 39, at_least: false })).toBe('39 records')
    expect(personRecords({ records: 1, at_least: false })).toBe('1 record')
    expect(personRecords({ records: 39, at_least: true })).toBe('at least 39 records')
    expect(personRecords({ records: 0, at_least: true })).toBe('records not counted')
  })
})
