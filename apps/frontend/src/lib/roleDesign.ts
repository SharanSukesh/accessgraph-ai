/**
 * Role design mode (roadmap 35b): the same replay as the backend
 * (services/role_design.py), so undo, redo and every edit show at once.
 * The server re-validates on save; this copy only has to agree with it.
 */

export interface BaseRole {
  id: string
  name: string
  developer_name: string | null
  parent_id: string | null
  access?: Record<string, string>
}

export interface DesignBase {
  roles: BaseRole[]
  users: Record<string, string | null>
  synced_at: string | null
}

export type Operation =
  | { op: 'move_role'; role_id: string; parent_id: string | null }
  | { op: 'move_user'; user_id: string; role_id: string | null }
  | { op: 'create_role'; role_id: string; name: string; developer_name: string; parent_id: string | null }
  | { op: 'rename_role'; role_id: string; name: string; developer_name?: string }
  | { op: 'delete_role'; role_id: string }

export interface DesignRole extends BaseRole {
  isNew: boolean
}

export interface DesignState {
  roles: Record<string, DesignRole>
  users: Record<string, string | null>
}

export class DesignError extends Error {
  constructor(message: string, public index: number) {
    super(message)
  }
}

export const NEW_PREFIX = 'new:'
const API_NAME = /^[A-Za-z](?:[A-Za-z0-9]|_(?!_))*$/

export function validApiName(s: string): boolean {
  return API_NAME.test(s) && !s.endsWith('_')
}

/** "Sales Ops, EMEA" -> "Sales_Ops_EMEA" (a suggestion the consultant can edit). */
export function toApiName(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[A-Za-z]/.test(s) ? s : s ? `Role_${s}` : ''
}

export function descendants(roles: Record<string, { parent_id: string | null }>, id: string): Set<string> {
  const kids: Record<string, string[]> = {}
  for (const [rid, r] of Object.entries(roles)) (kids[r.parent_id ?? ''] ??= []).push(rid)
  const out = new Set<string>()
  const stack = [id]
  while (stack.length) {
    for (const c of kids[stack.pop() as string] ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return out
}

export function applyOperations(base: DesignBase, ops: Operation[]): DesignState {
  const roles: Record<string, DesignRole> = {}
  for (const r of base.roles) roles[r.id] = { ...r, isNew: false }
  const users = { ...base.users }
  const usedApi = (dev: string, except?: string) =>
    Object.values(roles).some((r) => r.id !== except && (r.developer_name ?? '').toLowerCase() === dev.toLowerCase())

  ops.forEach((op, i) => {
    const need = (id: string | null | undefined, what = 'Role') => {
      if (!id || !roles[id]) throw new DesignError(`${what} not found in this draft.`, i)
    }
    switch (op.op) {
      case 'move_role':
        need(op.role_id)
        if (op.parent_id !== null) {
          need(op.parent_id, 'New parent role')
          if (op.parent_id === op.role_id || descendants(roles, op.role_id).has(op.parent_id))
            throw new DesignError("A role can't move under itself or one of the roles below it.", i)
        }
        roles[op.role_id] = { ...roles[op.role_id], parent_id: op.parent_id }
        break
      case 'move_user':
        if (!(op.user_id in users)) throw new DesignError('User not found in this draft.', i)
        if (op.role_id !== null) need(op.role_id)
        users[op.user_id] = op.role_id
        break
      case 'create_role':
        if (!op.role_id.startsWith(NEW_PREFIX) || roles[op.role_id]) throw new DesignError('A new role needs a new id.', i)
        if (!op.name.trim()) throw new DesignError('A role needs a name.', i)
        if (!validApiName(op.developer_name))
          throw new DesignError(
            'API name: start with a letter; letters, numbers and single underscores only; no underscore at the end.',
            i,
          )
        if (usedApi(op.developer_name)) throw new DesignError(`Another role already uses the API name ${op.developer_name}.`, i)
        if (op.parent_id !== null) need(op.parent_id, 'Parent role')
        roles[op.role_id] = {
          id: op.role_id, name: op.name.trim(), developer_name: op.developer_name, parent_id: op.parent_id, access: {}, isNew: true,
        }
        break
      case 'rename_role': {
        need(op.role_id)
        if (!op.name.trim()) throw new DesignError('A role needs a name.', i)
        const r = { ...roles[op.role_id], name: op.name.trim() }
        if (op.developer_name !== undefined && op.developer_name !== r.developer_name) {
          if (!r.isNew) throw new DesignError("An existing role's API name can't change here: the export identifies roles by API name.", i)
          if (!validApiName(op.developer_name)) throw new DesignError('API name: start with a letter; letters, numbers and single underscores only.', i)
          if (usedApi(op.developer_name, op.role_id)) throw new DesignError(`Another role already uses the API name ${op.developer_name}.`, i)
          r.developer_name = op.developer_name
        }
        roles[op.role_id] = r
        break
      }
      case 'delete_role':
        need(op.role_id)
        if (Object.values(roles).some((r) => r.parent_id === op.role_id)) throw new DesignError('Move the roles below it first.', i)
        if (Object.values(users).some((r) => r === op.role_id)) throw new DesignError('Move its users to another role first.', i)
        delete roles[op.role_id]
        break
      default:
        throw new DesignError('Unknown change.', i)
    }
  })
  return { roles, users }
}

export interface DesignDiff {
  created: DesignRole[]
  deleted: BaseRole[]
  renamed: { id: string; from: string; to: string }[]
  reparented: { id: string; from: string | null; to: string | null }[]
  movedUsers: { userId: string; from: string | null; to: string | null }[]
  count: number
}

export function diff(base: DesignBase, state: DesignState): DesignDiff {
  const created = Object.values(state.roles).filter((r) => r.isNew)
  const deleted = base.roles.filter((r) => !state.roles[r.id])
  const renamed = base.roles
    .filter((r) => state.roles[r.id] && state.roles[r.id].name !== r.name)
    .map((r) => ({ id: r.id, from: r.name, to: state.roles[r.id].name }))
  const reparented = base.roles
    .filter((r) => state.roles[r.id] && state.roles[r.id].parent_id !== r.parent_id)
    .map((r) => ({ id: r.id, from: r.parent_id, to: state.roles[r.id].parent_id }))
  const movedUsers = Object.entries(state.users)
    .filter(([u, r]) => (base.users[u] ?? null) !== r)
    .map(([userId, to]) => ({ userId, from: base.users[userId] ?? null, to }))
  return {
    created, deleted, renamed, reparented, movedUsers,
    count: created.length + deleted.length + renamed.length + reparented.length + movedUsers.length,
  }
}

/** Roots and children of the draft, names in alphabetical order. */
export function treeOf(state: DesignState): { roots: string[]; children: Record<string, string[]> } {
  const children: Record<string, string[]> = {}
  const roots: string[] = []
  const sorted = Object.values(state.roles).sort((a, b) => a.name.localeCompare(b.name))
  for (const r of sorted) {
    if (r.parent_id && state.roles[r.parent_id]) (children[r.parent_id] ??= []).push(r.id)
    else roots.push(r.id)
  }
  return { roots, children }
}

/** Where a role may be dropped: anywhere except itself and the roles below it. */
export function canDrop(state: DesignState, roleId: string, targetId: string | null): boolean {
  if (targetId === null) return true
  return targetId !== roleId && !descendants(state.roles, roleId).has(targetId)
}

/** Undo/redo over a list of operations: a new edit drops the redo tail. */
export function pushOperation(ops: Operation[], position: number, op: Operation): { ops: Operation[]; position: number } {
  const next = [...ops.slice(0, position), op]
  return { ops: next, position: next.length }
}

/** "39 records", "at least 39 records", or "records not counted" (never a made-up 0). */
export function personRecords(p: { records: number; at_least: boolean }): string {
  if (p.at_least && p.records === 0) return 'records not counted'
  return `${p.at_least ? 'at least ' : ''}${p.records.toLocaleString('en-GB')} ${p.records === 1 ? 'record' : 'records'}`
}
