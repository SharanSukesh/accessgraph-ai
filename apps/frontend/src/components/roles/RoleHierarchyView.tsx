'use client'

/**
 * Org Chart > Roles (roadmap 35a): the role hierarchy, read-only. A
 * collapsible tree of roles with their users and flags, and a detail panel
 * for the selected role: its users, and the Account and Opportunity records
 * owned in the role and below it (what rolls up to its ancestors). Portal
 * and community roles sit in their own section, hidden by default.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react'
import { Badge, RiskBadge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useRoleHierarchy, useRoleUsers } from '@/lib/api/hooks/useRoleHierarchy'
import {
  type RoleFlag,
  type RoleHierarchy,
  type RoleNode,
  type RoleUser,
  ancestry,
  countLabel,
  visibleFor,
} from '@/lib/roleHierarchy'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const FLAG_VARIANT: Record<RoleFlag['code'], 'warning' | 'info' | 'default'> = {
  empty: 'warning',
  single_user: 'info',
  deep: 'default',
  wide: 'default',
}
const FLAG_LABEL: Record<RoleFlag['code'], string> = {
  empty: 'Empty',
  single_user: 'One user',
  deep: 'Deep',
  wide: 'Wide',
}

function FlagChips({ flags }: { flags: RoleFlag[] }) {
  return (
    <>
      {flags.map((f) => (
        <Badge key={f.code} variant={FLAG_VARIANT[f.code]} size="sm" title={f.reason}>
          {f.label}
        </Badge>
      ))}
    </>
  )
}

function TreeRow({
  h,
  id,
  open,
  toggle,
  selected,
  select,
  visible,
}: {
  h: RoleHierarchy
  id: string
  open: Set<string>
  toggle: (id: string) => void
  selected: string | null
  select: (id: string) => void
  visible: Set<string> | null
}) {
  const r = h.roles[id]
  if (!r || (visible && !visible.has(id))) return null
  const kids = r.children.filter((c) => !visible || visible.has(c))
  const isOpen = open.has(id) || (!!visible && kids.length > 0)
  return (
    <li role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={selected === id}>
      <div
        className={`group flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm ${
          selected === id ? 'bg-primary-50 ring-1 ring-primary-300 dark:bg-primary-900/25 dark:ring-primary-700' : 'hover:bg-primary-50/40 dark:hover:bg-primary-900/10'
        }`}
        style={{ paddingLeft: `calc(${r.depth - 1} * var(--role-indent) + 4px)` }}
      >
        <button
          type="button"
          className={`flex h-5 w-5 items-center justify-center rounded ${kids.length ? 'hover:bg-grove-border/60 dark:hover:bg-grove-border-dk' : 'invisible'}`}
          onClick={() => toggle(id)}
          aria-label={isOpen ? `Collapse ${r.name}` : `Expand ${r.name}`}
          tabIndex={kids.length ? 0 : -1}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={() => select(id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-left">
          <span className="break-words font-medium text-grove-ink dark:text-grove-ink-dk">{r.name}</span>
          {r.user_count != null && (
            <span className={`v2-num text-xs ${MUTED}`}>
              {r.user_count} {r.user_count === 1 ? 'user' : 'users'}
              {r.subtree_user_count != null && r.subtree_user_count > r.user_count && ` · ${r.subtree_user_count - r.user_count} below`}
            </span>
          )}
          <span className="ml-auto flex shrink-0 gap-1">
            <FlagChips flags={r.flags} />
          </span>
        </button>
      </div>
      {isOpen && kids.length > 0 && (
        <ul role="group">
          {kids.map((c) => (
            <TreeRow key={c} h={h} id={c} open={open} toggle={toggle} selected={selected} select={select} visible={visible} />
          ))}
        </ul>
      )}
    </li>
  )
}

const PREVIEW = 10

/** The role panel's first users; View all opens the paged list. */
function RoleUsersTable({ users }: { users: RoleUser[] }) {
  return (
    <table className="w-full text-sm">
      <thead className={`sticky top-0 bg-grove-surface text-xs dark:bg-grove-surface-dk ${MUTED}`}>
        <tr>
          <th className="py-1 text-left font-medium">Name</th>
          <th className="py-1 text-left font-medium">Profile</th>
          <th className="py-1 text-left font-medium">Risk</th>
          <th className="py-1 text-right font-medium">Last login</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className={`border-t border-grove-border dark:border-grove-border-dk ${u.is_active ? '' : 'opacity-60'}`}>
            <td className="py-1">{u.name}{!u.is_active && <span className={`ml-1 text-xs ${MUTED}`}>(inactive)</span>}</td>
            <td className={`py-1 ${MUTED}`}>{u.profile ?? '—'}</td>
            <td className="py-1">
              {u.risk_level ? <RiskBadge level={u.risk_level as 'low' | 'medium' | 'high' | 'critical'} size="sm" prefix={`${u.risk_score ?? ''} `} /> : <span className={MUTED}>Not scored</span>}
            </td>
            <td className={`v2-num py-1 text-right ${MUTED}`}>
              {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Detail({ orgId, h, id }: { orgId: string; h: RoleHierarchy; id: string }) {
  const r = h.roles[id]
  const users = useRoleUsers(orgId, id, h.users_allowed)
  if (!r) return null
  const path = ancestry(h, id)
  const parent = r.parent_id ? h.roles[r.parent_id] : null
  return (
    <div className="space-y-5">
      <div>
        <p className={`text-xs ${MUTED}`}>{path.slice(0, -1).join(' › ') || 'Top of the hierarchy'}</p>
        <h3 className="mt-1 text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">{r.name}</h3>
        <p className={`text-xs ${MUTED}`}>
          {r.developer_name && <>API name <code className="font-mono">{r.developer_name}</code> · </>}
          Level {r.depth}
          {r.portal_type && ` · ${r.portal_type} portal role`}
          {` · ${r.children.length} ${r.children.length === 1 ? 'role' : 'roles'} directly below`}
        </p>
        {r.rollup_description && <p className={`mt-1 text-xs ${MUTED}`}>Reports to its parent as &ldquo;{r.rollup_description}&rdquo;</p>}
      </div>

      {r.flags.length > 0 && (
        <ul className="space-y-1.5">
          {r.flags.map((f) => (
            <li key={f.code} className="flex items-start gap-2 text-sm">
              <Badge variant={FLAG_VARIANT[f.code]} size="sm">{f.label}</Badge>
              <span className="text-grove-ink/80 dark:text-grove-ink-dk/80">{f.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {h.users_allowed && r.owned && r.subtree_owned && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
            Records owned, rolling up to {parent ? parent.name : 'no one (top of the hierarchy)'}
          </p>
          <table className="w-full text-sm">
            <thead className={`text-xs ${MUTED}`}>
              <tr>
                <th className="py-1 text-left font-medium">Object</th>
                <th className="py-1 text-right font-medium">In this role</th>
                <th className="py-1 text-right font-medium">This role and below</th>
              </tr>
            </thead>
            <tbody className="v2-num">
              {h.owned_objects.map((o) => (
                <tr key={o} className="border-t border-grove-border dark:border-grove-border-dk">
                  <td className="py-1">{o}</td>
                  <td className="py-1 text-right">{countLabel(r.owned?.[o])}</td>
                  <td className="py-1 text-right">{countLabel(r.subtree_owned?.[o])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`mt-1 text-[11px] ${MUTED}`}>
            Users above this role can see and edit what users in it own.
            {h.partial_label && ` ${h.partial_label}.`} &ldquo;Unknown&rdquo; means the sync didn&apos;t count it, not zero.
          </p>
        </div>
      )}

      {Object.keys(r.account_owner_access).length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">Access for the account owner</p>
          <p className="text-sm">
            {Object.entries(r.account_owner_access).map(([o, v]) => `${o}: ${v}`).join(' · ')}
          </p>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
          Users{r.user_count != null && ` (${r.user_count} active${r.inactive_user_count ? `, ${r.inactive_user_count} inactive` : ''})`}
        </p>
        {!h.users_allowed ? (
          <p className={`text-sm ${MUTED}`}>{h.users_hidden_reason}</p>
        ) : users.isLoading ? (
          <TableSkeleton rows={3} />
        ) : !users.data?.total ? (
          <p className={`text-sm ${MUTED}`}>No users in this role.</p>
        ) : (
          <>
            <RoleUsersTable users={users.data.items.slice(0, PREVIEW)} />
            {users.data.total > PREVIEW && (
              <Link href={`/orgs/${orgId}/reporting-graph/roles/${encodeURIComponent(id)}/users`}
                className="mt-2 inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
                View all {users.data.total} users
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function RoleHierarchyView({ orgId }: { orgId: string }) {
  const [deepAfter, setDeepAfter] = useState<number | null>(null)
  const [wideAfter, setWideAfter] = useState<number | null>(null)
  const { data: h, isLoading, error, refetch } = useRoleHierarchy(orgId, deepAfter ?? 5, wideAfter ?? 6)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [showPortal, setShowPortal] = useState(false)

  // Open the top two levels and select the top role the first time.
  useEffect(() => {
    if (!h || open.size || selected) return
    setOpen(new Set(Object.values(h.roles).filter((r) => r.depth <= 2 && !r.portal_type).map((r) => r.id)))
    setSelected(h.roots[0] ?? null)
  }, [h, open.size, selected])

  const visible = useMemo(() => (h ? visibleFor(h, query, flaggedOnly) : null), [h, query, flaggedOnly])
  if (isLoading && !h) return <TableSkeleton rows={8} />
  if (error || !h) return <ErrorState message="Failed to load the role hierarchy." onRetry={() => refetch()} />
  if (!h.roots.length && !h.portal_roots.length) {
    return (
      <Card variant="bordered">
        <CardContent className="p-6 text-sm">No roles in the last sync. Sync the org to load its role hierarchy.</CardContent>
      </Card>
    )
  }

  const toggle = (id: string) => {
    const next = new Set(open)
    next.has(id) ? next.delete(id) : next.add(id)
    setOpen(next)
  }
  const s = h.summary
  const tree = (ids: string[]) => (
    <ul role="tree" className="space-y-0.5 [--role-indent:10px] sm:[--role-indent:18px]">
      {ids.map((id) => (
        <TreeRow key={id} h={h} id={id} open={open} toggle={toggle} selected={selected} select={setSelected} visible={visible} />
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span><strong className="v2-num">{s.roles}</strong> roles</span>
        <span>deepest branch <strong className="v2-num">{s.max_depth}</strong> levels</span>
        {(['empty', 'single_user', 'deep', 'wide'] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <Badge variant={FLAG_VARIANT[c]} size="sm">{FLAG_LABEL[c]}</Badge>
            <span className="v2-num">{s.flags[c] ?? 0}</span>
          </span>
        ))}
        {s.users_without_role != null && s.users_without_role > 0 && (
          <span className={MUTED}>{s.users_without_role} active users have no role</span>
        )}
      </div>

      {!h.users_allowed && (
        <p className="flex items-start gap-2 rounded-lg border border-grove-border px-3 py-2 text-sm dark:border-grove-border-dk">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {h.users_hidden_reason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card variant="bordered">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-grove-ink/40" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a role"
                  aria-label="Find a role"
                  className="w-full rounded-md border border-grove-border bg-grove-canvas py-1.5 pl-8 pr-2 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="accent-primary-700" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
                Flagged only
              </label>
              <button
                type="button"
                className="text-xs underline underline-offset-2"
                onClick={() => setOpen(open.size ? new Set() : new Set(Object.keys(h.roles)))}
              >
                {open.size ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${MUTED}`}>
              <label className="flex items-center gap-1.5">
                Deep: more than
                <input
                  type="number" min={1} max={50} value={deepAfter ?? h.thresholds.deep_after}
                  onChange={(e) => setDeepAfter(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 rounded border border-grove-border bg-grove-canvas px-1.5 py-0.5 dark:border-grove-border-dk dark:bg-grove-surface-dk"
                />
                levels
              </label>
              <label className="flex items-center gap-1.5">
                Wide: more than
                <input
                  type="number" min={1} max={500} value={wideAfter ?? h.thresholds.wide_after}
                  onChange={(e) => setWideAfter(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 rounded border border-grove-border bg-grove-canvas px-1.5 py-0.5 dark:border-grove-border-dk dark:bg-grove-surface-dk"
                />
                roles directly below
              </label>
              <span>Defaults ({h.thresholds.defaults.deep_after} and {h.thresholds.defaults.wide_after}); Salesforce sets no depth limit.</span>
            </div>
          </CardHeader>
          <CardContent>
            {visible && visible.size === 0 ? (
              <p className={`text-sm ${MUTED}`}>No roles match.</p>
            ) : (
              tree(h.roots)
            )}
            {h.portal_roots.length > 0 && (
              <div className="mt-4 border-t border-grove-border pt-3 dark:border-grove-border-dk">
                <button type="button" onClick={() => setShowPortal((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium">
                  {showPortal ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Portal and community roles ({s.portal_roles})
                </button>
                {showPortal && <div className="mt-2">{tree(h.portal_roots)}</div>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="bordered" className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle>Role details</CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? <Detail orgId={orgId} h={h} id={selected} /> : <p className={`text-sm ${MUTED}`}>Select a role.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
