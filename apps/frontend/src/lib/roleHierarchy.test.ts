import { describe, expect, it } from 'vitest'
import { ancestry, countLabel, visibleFor, type RoleHierarchy, type RoleNode } from './roleHierarchy'

const node = (id: string, name: string, parent: string | null, flags: RoleNode['flags'] = []): RoleNode => ({
  id, name, developer_name: name.replace(/ /g, '_'), parent_id: parent, depth: 1, portal_type: null,
  rollup_description: null, account_owner_access: {}, children: [], user_count: 0, inactive_user_count: 0,
  subtree_user_count: 0, owned: null, subtree_owned: null, branch_depth: 1, flags,
})

const h = {
  roles: {
    a: node('a', 'CEO', null),
    b: node('b', 'VP Sales', 'a'),
    c: node('c', 'Sales Rep', 'b', [{ code: 'deep', label: 'Deep', reason: '' }]),
    d: node('d', 'Ops', 'a'),
  },
} as unknown as RoleHierarchy

describe('role hierarchy helpers', () => {
  it('keeps the ancestors of a match so it stays in the tree', () => {
    expect(visibleFor(h, 'rep', false)).toEqual(new Set(['c', 'b', 'a']))
    expect(visibleFor(h, 'sales_rep', false)).toEqual(new Set(['c', 'b', 'a']))
    expect(visibleFor(h, '', true)).toEqual(new Set(['c', 'b', 'a']))
    expect(visibleFor(h, 'ops', true)).toEqual(new Set())
    expect(visibleFor(h, '  ', false)).toBeNull()
  })

  it('shows unknown counts as Unknown, never 0', () => {
    expect(countLabel(null)).toBe('Unknown')
    expect(countLabel(0)).toBe('0')
    expect(countLabel(9520)).toBe('9,520')
  })

  it('builds the path from the top', () => {
    expect(ancestry(h, 'c')).toEqual(['CEO', 'VP Sales', 'Sales Rep'])
  })
})
