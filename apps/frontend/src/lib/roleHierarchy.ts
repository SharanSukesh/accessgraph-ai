/**
 * Role hierarchy view (backend services/role_hierarchy.py): types and the
 * small helpers the tree uses.
 */

export type OwnedCounts = Record<string, number | null>

export interface RoleFlag {
  code: 'empty' | 'single_user' | 'deep' | 'wide'
  label: string
  reason: string
}

export interface RoleNode {
  id: string
  name: string
  developer_name: string | null
  parent_id: string | null
  depth: number
  portal_type: string | null
  rollup_description: string | null
  account_owner_access: Record<string, string>
  children: string[]
  user_count: number | null
  inactive_user_count: number | null
  subtree_user_count: number | null
  owned: OwnedCounts | null
  subtree_owned: OwnedCounts | null
  branch_depth: number
  flags: RoleFlag[]
}

export interface RoleHierarchy {
  roles: Record<string, RoleNode>
  roots: string[]
  portal_roots: string[]
  summary: {
    roles: number
    portal_roles: number
    max_depth: number
    users_without_role: number | null
    flags: Partial<Record<RoleFlag['code'], number>>
  }
  thresholds: { deep_after: number; wide_after: number; defaults: { deep_after: number; wide_after: number } }
  users_allowed: boolean
  users_hidden_reason: string | null
  owned_objects: string[]
  partial_label: string | null
  partial_objects: string[]
}

export interface RoleUser {
  id: string
  name: string
  profile: string | null
  is_active: boolean
  risk_score: number | null
  risk_level: string | null
  last_login_at: string | null
  owned: OwnedCounts | null
}

/** "1,204", or "Unknown" (never 0) when the count wasn't taken. */
export function countLabel(n: number | null | undefined): string {
  return n == null ? 'Unknown' : n.toLocaleString('en-GB')
}

/** Ids of roles whose name matches (case-insensitive), plus their ancestors so they stay visible. */
export function visibleFor(h: RoleHierarchy, query: string, flaggedOnly: boolean): Set<string> | null {
  const q = query.trim().toLowerCase()
  if (!q && !flaggedOnly) return null
  const keep = new Set<string>()
  for (const r of Object.values(h.roles)) {
    const hit = (!q || r.name.toLowerCase().includes(q) || (r.developer_name ?? '').toLowerCase().includes(q)) &&
      (!flaggedOnly || r.flags.length > 0)
    if (!hit) continue
    let cur: RoleNode | undefined = r
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id)
      cur = cur.parent_id ? h.roles[cur.parent_id] : undefined
    }
  }
  return keep
}

/** Path from the top of the hierarchy to a role, names only. */
export function ancestry(h: RoleHierarchy, id: string): string[] {
  const out: string[] = []
  let cur: RoleNode | undefined = h.roles[id]
  while (cur) {
    out.unshift(cur.name)
    cur = cur.parent_id ? h.roles[cur.parent_id] : undefined
  }
  return out
}
