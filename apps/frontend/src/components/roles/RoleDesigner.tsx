'use client'

/**
 * Role design mode (roadmap 35b): edit a draft of the role hierarchy.
 * Drag a role onto another to move it under it (or onto "Top level"),
 * drag users between roles, create, rename and delete roles, undo and
 * redo. Every edit is checked as it happens (no cycles, no deleting a role
 * that still has users or roles below it). Used for an org's drafts and,
 * with an empty starting hierarchy, by the Implementation Advisor.
 * Nothing here talks to Salesforce.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CornerUpLeft, CornerUpRight, GripVertical, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import {
  type DesignBase,
  type DesignState,
  type Operation,
  DesignError,
  NEW_PREFIX,
  applyOperations,
  canDrop,
  descendants,
  diff,
  pushOperation,
  toApiName,
  treeOf,
} from '@/lib/roleDesign'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const INPUT =
  'w-full rounded-md border border-grove-border bg-grove-canvas px-2 py-1 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk'
const DRAG_ROLE = 'application/x-newton-role'
const DRAG_USER = 'application/x-newton-user'

export interface DesignerProps {
  base: DesignBase
  operations: Operation[]
  position: number
  users: { id: string; name: string }[]
  usersNote?: string | null
  onChange: (operations: Operation[], position: number) => void
  status?: React.ReactNode
}

// A new role keeps "New_Role" as its API name until it's renamed; then the
// API name follows the name (the consultant can still edit it).
const PLACEHOLDER_API = /^New_Role(_\d+)?$/

function uniqueApiName(state: DesignState, wanted: string, except?: string): string {
  const taken = (s: string) =>
    Object.values(state.roles).some((r) => r.id !== except && (r.developer_name ?? '').toLowerCase() === s.toLowerCase())
  let name = wanted || 'Role'
  for (let i = 2; taken(name); i++) name = `${wanted || 'Role'}_${i}`
  return name
}

function newId() {
  return `${NEW_PREFIX}${Math.random().toString(36).slice(2, 10)}`
}

export function RoleDesigner({ base, operations, position, users, usersNote, onChange, status }: DesignerProps) {
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string> | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined)
  // The role being dragged (drag data can't be read until the drop).
  const [dragging, setDragging] = useState<string | null>(null)
  const state: DesignState = useMemo(() => applyOperations(base, operations.slice(0, position)), [base, operations, position])
  const tree = useMemo(() => treeOf(state), [state])
  const changes = useMemo(() => diff(base, state), [base, state])
  const userName = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users])
  const usersIn = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [u, r] of Object.entries(state.users)) if (r) (m[r] ??= []).push(u)
    for (const k of Object.keys(m)) m[k].sort((a, b) => (userName[a] ?? a).localeCompare(userName[b] ?? b))
    return m
  }, [state.users, userName])

  // Open the top two levels the first time.
  useEffect(() => {
    if (open === null && Object.keys(state.roles).length) {
      const top = new Set<string>(tree.roots)
      for (const r of tree.roots) for (const c of tree.children[r] ?? []) top.add(c)
      setOpen(top)
    }
  }, [open, state.roles, tree])

  const apply = useCallback(
    (op: Operation) => {
      const next = pushOperation(operations, position, op)
      try {
        applyOperations(base, next.ops)
      } catch (e) {
        setError(e instanceof DesignError ? e.message : 'That change is not possible.')
        return false
      }
      setError(null)
      onChange(next.ops, next.position)
      return true
    },
    [base, operations, position, onChange],
  )
  const undo = useCallback(() => position > 0 && onChange(operations, position - 1), [operations, position, onChange])
  const redo = useCallback(() => position < operations.length && onChange(operations, position + 1), [operations, position, onChange])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [undo, redo])

  const toggle = (id: string) => {
    const next = new Set(open ?? [])
    next.has(id) ? next.delete(id) : next.add(id)
    setOpen(next)
  }

  const onDrop = (e: React.DragEvent, target: string | null) => {
    e.preventDefault()
    setDropTarget(undefined)
    const role = e.dataTransfer.getData(DRAG_ROLE)
    const user = e.dataTransfer.getData(DRAG_USER)
    if (role) {
      if (state.roles[role]?.parent_id === target) return
      apply({ op: 'move_role', role_id: role, parent_id: target })
    } else if (user && target) {
      if (state.users[user] !== target) apply({ op: 'move_user', user_id: user, role_id: target })
    }
  }

  const row = (id: string, depth: number): React.ReactNode => {
    const r = state.roles[id]
    const kids = tree.children[id] ?? []
    const isOpen = open?.has(id)
    const count = usersIn[id]?.length ?? 0
    const changed = r.isNew || changes.reparented.some((x) => x.id === id) || changes.renamed.some((x) => x.id === id)
    return (
      <li key={id} role="treeitem" aria-expanded={kids.length ? !!isOpen : undefined} aria-selected={selected === id}>
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.setData(DRAG_ROLE, id)
            e.dataTransfer.effectAllowed = 'move'
            setDragging(id)
          }}
          onDragEnd={() => {
            setDragging(null)
            setDropTarget(undefined)
          }}
          onDragOver={(e) => {
            // Only valid targets accept the drop: never a role's own branch.
            const user = e.dataTransfer.types.includes(DRAG_USER)
            if (user || (dragging && canDrop(state, dragging, id))) {
              e.preventDefault()
              setDropTarget(id)
            }
          }}
          onDragLeave={() => setDropTarget(undefined)}
          onDrop={(e) => onDrop(e, id)}
          className={`group flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm ${
            dropTarget === id
              ? 'bg-primary-100 ring-2 ring-primary-500 dark:bg-primary-900/40'
              : selected === id
                ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/25 dark:ring-primary-700'
                : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'
          }`}
          style={{ paddingLeft: `calc(${depth} * var(--role-indent) + 2px)` }}
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-grove-ink/30 dark:text-grove-ink-dk/30" aria-hidden />
          <button
            type="button"
            className={`flex h-5 w-5 items-center justify-center rounded ${kids.length ? '' : 'invisible'}`}
            onClick={() => toggle(id)}
            aria-label={isOpen ? `Collapse ${r.name}` : `Expand ${r.name}`}
            tabIndex={kids.length ? 0 : -1}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => setSelected(id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-left">
            <span className="break-words font-medium text-grove-ink dark:text-grove-ink-dk">{r.name}</span>
            {users.length > 0 && <span className={`v2-num text-xs ${MUTED}`}>{count} {count === 1 ? 'user' : 'users'}</span>}
            {r.isNew ? (
              <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">New</span>
            ) : changed ? (
              <span className="rounded bg-sky-100 px-1.5 text-[10px] font-semibold uppercase text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Changed</span>
            ) : null}
          </button>
        </div>
        {isOpen && kids.length > 0 && <ul role="group">{kids.map((c) => row(c, depth + 1))}</ul>}
      </li>
    )
  }

  const sel = selected ? state.roles[selected] : null
  const moveTargets = useMemo(() => {
    if (!sel) return []
    const below = descendants(state.roles, sel.id)
    return Object.values(state.roles)
      .filter((r) => r.id !== sel.id && !below.has(r.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [sel, state.roles])
  const allRoles = useMemo(() => Object.values(state.roles).sort((a, b) => a.name.localeCompare(b.name)), [state.roles])

  const createRole = (parent: string | null) => {
    const name = 'New role'
    const dev = uniqueApiName(state, 'New_Role')
    const id = newId()
    if (apply({ op: 'create_role', role_id: id, name, developer_name: dev, parent_id: parent })) {
      setSelected(id)
      if (parent) setOpen(new Set([...(open ?? []), parent]))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-grove-border bg-primary-50/40 p-2 dark:border-grove-border-dk dark:bg-primary-900/10">
        <Button variant="secondary" size="sm" onClick={undo} disabled={position === 0} title="Undo (Ctrl/Cmd+Z)">
          <CornerUpLeft className="mr-1.5 h-4 w-4" /> Undo
        </Button>
        <Button variant="secondary" size="sm" onClick={redo} disabled={position >= operations.length} title="Redo (Ctrl/Cmd+Shift+Z)">
          <CornerUpRight className="mr-1.5 h-4 w-4" /> Redo
        </Button>
        <Button variant="secondary" size="sm" onClick={() => createRole(selected)}>
          <Plus className="mr-1.5 h-4 w-4" /> {selected ? 'New role below the selected one' : 'New role'}
        </Button>
        <span className={`ml-auto text-xs ${MUTED}`}>
          {changes.count} {changes.count === 1 ? 'change' : 'changes'}
          {status && <> · {status}</>}
        </span>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card variant="bordered">
          <CardContent className="pt-4">
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_ROLE)) {
                  e.preventDefault()
                  setDropTarget(null)
                }
              }}
              onDragLeave={() => setDropTarget(undefined)}
              onDrop={(e) => onDrop(e, null)}
              className={`mb-2 rounded-md border border-dashed px-3 py-1.5 text-xs ${
                dropTarget === null ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' : `border-grove-border dark:border-grove-border-dk ${MUTED}`
              }`}
            >
              Top level: drop a role here to put it at the top of the hierarchy
            </div>
            {tree.roots.length === 0 ? (
              <p className={`py-6 text-center text-sm ${MUTED}`}>No roles yet. Start with &ldquo;New role&rdquo;.</p>
            ) : (
              <ul role="tree" className="space-y-0.5 [--role-indent:10px] sm:[--role-indent:18px]">{tree.roots.map((id) => row(id, 0))}</ul>
            )}
            <p className={`mt-3 text-[11px] ${MUTED}`}>
              Drag a role onto another to move it (with everything below it). Drag users from the panel onto a role.
              Keyboard: select a role and use &ldquo;Move under&rdquo;.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>{sel ? 'Selected role' : 'Select a role'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!sel ? (
                <p className={MUTED}>Select a role in the tree to rename, move or delete it, or to move its users.</p>
              ) : (
                <>
                  <label className="block text-xs font-semibold">
                    Name
                    <input
                      key={`n-${sel.id}-${position}`}
                      defaultValue={sel.name}
                      className={`mt-1 ${INPUT}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== sel.name &&
                        apply(sel.isNew && PLACEHOLDER_API.test(sel.developer_name ?? '')
                          ? { op: 'rename_role', role_id: sel.id, name: e.target.value, developer_name: uniqueApiName(state, toApiName(e.target.value), sel.id) }
                          : { op: 'rename_role', role_id: sel.id, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  </label>
                  <label className="block text-xs font-semibold">
                    API name
                    <input
                      key={`d-${sel.id}-${position}`}
                      defaultValue={sel.developer_name ?? ''}
                      disabled={!sel.isNew}
                      className={`mt-1 font-mono ${INPUT} disabled:opacity-60`}
                      onBlur={(e) => sel.isNew && e.target.value !== sel.developer_name &&
                        apply({ op: 'rename_role', role_id: sel.id, name: sel.name, developer_name: e.target.value.trim() })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                    <span className={`mt-1 block font-normal ${MUTED}`}>
                      {sel.isNew ? 'Used to name the role in the export.' : "An existing role's API name stays as it is: the export identifies roles by it."}
                    </span>
                  </label>
                  <label className="block text-xs font-semibold">
                    Move under
                    <select
                      className={`mt-1 ${INPUT}`}
                      value={sel.parent_id ?? ''}
                      onChange={(e) => apply({ op: 'move_role', role_id: sel.id, parent_id: e.target.value || null })}
                    >
                      <option value="">Top level</option>
                      {moveTargets.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => createRole(sel.id)}>
                      <Plus className="mr-1.5 h-4 w-4" /> New role below
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (apply({ op: 'delete_role', role_id: sel.id })) setSelected(sel.parent_id)
                      }}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete role
                    </Button>
                  </div>

                  <div className="border-t border-grove-border pt-3 dark:border-grove-border-dk">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
                      <Users className="h-3.5 w-3.5" aria-hidden /> Users in this role ({usersIn[sel.id]?.length ?? 0})
                    </p>
                    {usersNote ? (
                      <p className={MUTED}>{usersNote}</p>
                    ) : !(usersIn[sel.id]?.length) ? (
                      <p className={MUTED}>None.</p>
                    ) : (
                      <ul className="max-h-64 space-y-1 overflow-auto">
                        {usersIn[sel.id].map((u) => (
                          <li
                            key={u}
                            draggable
                            onDragStart={(e) => {
                              setDragging(null)
                              e.dataTransfer.setData(DRAG_USER, u)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            className="flex items-center gap-2 rounded border border-grove-border px-2 py-1 dark:border-grove-border-dk"
                          >
                            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-grove-ink/30" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{userName[u] ?? u}</span>
                            <select
                              aria-label={`Move ${userName[u] ?? u} to`}
                              className="max-w-[45%] rounded border border-grove-border bg-grove-canvas px-1 py-0.5 text-xs dark:border-grove-border-dk dark:bg-grove-surface-dk"
                              value=""
                              onChange={(e) => e.target.value && apply({ op: 'move_user', user_id: u, role_id: e.target.value === '__none__' ? null : e.target.value })}
                            >
                              <option value="">Move to…</option>
                              {allRoles.filter((r) => r.id !== sel.id).map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                              <option value="__none__">No role</option>
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <ChangesList base={base} state={state} changes={changes} userName={userName} />
        </div>
      </div>
    </div>
  )
}

function ChangesList({
  base,
  state,
  changes,
  userName,
}: {
  base: DesignBase
  state: DesignState
  changes: ReturnType<typeof diff>
  userName: Record<string, string>
}) {
  const before = Object.fromEntries(base.roles.map((r) => [r.id, r]))
  const nameOf = (id: string | null, after = true) =>
    id === null ? 'top level' : (after ? state.roles[id]?.name : before[id]?.name) ?? before[id]?.name ?? id
  const items: string[] = [
    ...changes.created.map((r) => `New role ${r.name} under ${nameOf(r.parent_id)}`),
    ...changes.reparented.map((x) => `${state.roles[x.id].name} moves from ${nameOf(x.from, false)} to ${nameOf(x.to)}`),
    ...changes.renamed.map((x) => `${x.from} renamed ${x.to}`),
    ...changes.deleted.map((r) => `${r.name} deleted`),
    ...changes.movedUsers.map((m) => `${userName[m.userId] ?? m.userId}: ${nameOf(m.from, false)} → ${nameOf(m.to)}`),
  ]
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Changes ({changes.count})</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className={`text-sm ${MUTED}`}>No changes yet: the draft matches the hierarchy it started from.</p>
        ) : (
          <ul className="max-h-56 list-disc space-y-1 overflow-auto pl-5 text-sm">
            {items.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
