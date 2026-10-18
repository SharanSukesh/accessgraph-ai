'use client'

/**
 * Org Chart > Design (roadmap 35b): an org's role hierarchy drafts. Each
 * draft starts from the last sync and saves as you edit; the impact
 * preview shows who gains or loses access to Account and Opportunity
 * records; the export is a ZIP the client applies. Nothing is sent to
 * Salesforce.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, FilePlus2, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { API_BASE_URL } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import {
  type Draft,
  type Impact,
  type ObjectImpact,
  useCreateRoleDesign,
  useDeleteRoleDesign,
  useRoleDesign,
  useRoleDesignImpact,
  useRoleDesigns,
  useSaveRoleDesign,
} from '@/lib/api/hooks/useRoleDesign'
import { type Operation, personRecords } from '@/lib/roleDesign'
import { RoleDesigner } from './RoleDesigner'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const EFFECT_LABEL: Record<ObjectImpact['effect'], string> = {
  view_and_edit: 'View and edit access change',
  edit_only: 'Only edit access changes',
  none: 'No change through the hierarchy',
}

export async function downloadPost(url: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = data?.detail
    const err = new Error(typeof detail === 'string' ? detail : detail?.message ?? `Download failed (${res.status}).`) as Error & {
      status?: number
      stale?: string[]
    }
    err.status = res.status
    err.stale = detail?.stale
    throw err
  }
  const href = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = href
  a.download = fallbackName
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'role-design'
}

function People({ title, people }: { title: string; people: ObjectImpact['gaining'] }) {
  if (!people.length) return null
  return (
    <div>
      <p className={`text-xs font-semibold ${MUTED}`}>{title}</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {people.map((p) => (
          <li key={p.user_id} className="flex justify-between gap-2">
            <span className="truncate">{p.name}</span>
            <span className="v2-num shrink-0">{personRecords(p)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImpactPanel({ impact, loading, pending }: { impact?: Impact; loading: boolean; pending: boolean }) {
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Impact preview {(loading || pending) && <Loader2 className="h-4 w-4 animate-spin" aria-label="Updating" />}
        </CardTitle>
        <p className={`mt-1 text-xs ${MUTED}`}>
          Account and Opportunity, counts only. Case, Contact, Lead and custom objects follow in a later release.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!impact ? (
          <TableSkeleton rows={3} />
        ) : impact.changes === 0 ? (
          <p className={MUTED}>No changes yet.</p>
        ) : (
          <>
            {!impact.users_allowed && <p className={MUTED}>{impact.users_hidden_reason}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(impact.objects).map(([obj, o]) => (
                <div key={obj} className="rounded-lg border border-grove-border p-3 dark:border-grove-border-dk">
                  <p className="font-semibold">{obj}</p>
                  <p className="text-xs font-medium">{EFFECT_LABEL[o.effect]}</p>
                  <p className={`mt-0.5 text-[11px] ${MUTED}`}>{o.explanation}</p>
                  {o.effect !== 'none' && (
                    <dl className="v2-num mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className={MUTED}>Users gaining access</dt><dd className="text-right">{o.users_gaining}</dd>
                      <dt className={MUTED}>Users losing access</dt><dd className="text-right">{o.users_losing}</dd>
                      <dt className={MUTED}>Records owned below the moved roles</dt><dd className="text-right">
                        {o.records_owned == null
                          ? o.records_owned_counted
                            ? `at least ${o.records_owned_counted.toLocaleString('en-GB')}`
                            : 'Unknown'
                          : o.records_owned.toLocaleString('en-GB')}
                      </dd>
                      <dt className={MUTED}>Records shared to those users</dt><dd className="text-right">{o.records_shared.toLocaleString('en-GB')}</dd>
                    </dl>
                  )}
                  {o.some_counts_unknown && (
                    <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                      The sync didn&apos;t count some owners&apos; {obj} records, so the record total isn&apos;t known.
                      Users above them are still counted.
                    </p>
                  )}
                  <div className="mt-2 space-y-2">
                    <People title="Gain access (most records first)" people={o.gaining} />
                    <People title="Lose access" people={o.losing} />
                  </div>
                </div>
              ))}
            </div>
            <p className={`text-[11px] ${MUTED}`}>
              {impact.upper_bound_note}
              {impact.coverage_label && ` ${impact.coverage_label}.`}
            </p>
            {(impact.references.public_groups.length > 0 || impact.references.role_sharing_rules.length > 0
              || impact.references.named_rules.length > 0 || impact.references.rule_shares_note) && (
              <div className="space-y-1.5">
                {impact.references.named_rules.length > 0 && (
                  <div className="text-xs">
                    <strong>Sharing rules that reach a changed role:</strong>
                    <ul className="ml-4 list-disc">{impact.references.named_rules.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                )}
                {impact.references.rule_shares_note && (
                  <p className="text-xs">
                    <strong>Records reaching the changed roles through sharing rules:</strong>{' '}
                    {Object.entries(impact.references.rule_shares).map(([o, n]) => `${o} ${n.toLocaleString('en-GB')}`).join(', ')}.{' '}
                    <span className={MUTED}>{impact.references.rule_shares_note}</span>
                  </p>
                )}
                {impact.references.public_groups.length > 0 && (
                  <p className="text-xs">
                    <strong>Public groups that include a changed role:</strong> {impact.references.public_groups.join(', ')}
                  </p>
                )}
                {impact.references.role_sharing_rules.length > 0 && (
                  <p className="text-xs">
                    <strong>Sharing rules shared to roles, target not read:</strong> {impact.references.role_sharing_rules.join(', ')}.{' '}
                    <span className={MUTED}>{impact.references.sharing_rules_note}</span>
                  </p>
                )}
              </div>
            )}
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {impact.recalculation_warning}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function DraftEditor({ orgId, draft, isDemo }: { orgId: string; draft: Draft; isDemo: boolean }) {
  const [ops, setOps] = useState<Operation[]>(draft.operations)
  const [position, setPosition] = useState(draft.position)
  const [name, setName] = useState(draft.name)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [stale, setStale] = useState<string[]>(draft.stale)
  const [ack, setAck] = useState(false)
  const save = useSaveRoleDesign(orgId, draft.id)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dirty, setDirty] = useState(false)
  const impact = useRoleDesignImpact(orgId, draft.id, !save.isPending && !dirty)

  const persist = useCallback(
    (nextOps: Operation[], nextPos: number, nextName?: string) => {
      setDirty(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        save.mutate(
          { operations: nextOps, position: nextPos, name: nextName },
          {
            onSuccess: () => {
              setDirty(false)
              setSaveError(null)
            },
            onError: (e) => {
              setDirty(false)
              setSaveError(e instanceof Error ? e.message : 'Not saved.')
            },
          },
        )
      }, 500)
    },
    [save],
  )
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onChange = (nextOps: Operation[], nextPos: number) => {
    setOps(nextOps)
    setPosition(nextPos)
    persist(nextOps, nextPos)
  }

  async function exportZip() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadPost(`${API_BASE_URL}${endpoints.roleDesignExport(orgId, draft.id)}`, { acknowledge_stale: ack },
        `${isDemo ? 'demo-' : ''}role-design-${slug(name)}.zip`)
    } catch (e) {
      const err = e as Error & { status?: number; stale?: string[] }
      if (err.status === 409 && err.stale) setStale(err.stale)
      setExportError(err.message)
    } finally {
      setExporting(false)
    }
  }

  const status = save.isPending || dirty ? 'Saving…' : saveError ? <span className="text-rose-700 dark:text-rose-300">Not saved: {saveError}</span> : 'Saved'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-xs font-semibold">
          Draft name
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== draft.name && persist(ops, position, name.trim())}
            className="mt-1 w-full rounded-md border border-grove-border bg-grove-canvas px-2 py-1.5 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
          />
        </label>
        <p className={`text-xs ${MUTED}`}>
          Started from the sync of {draft.started_from ? new Date(draft.started_from).toLocaleString('en-GB') : 'an unknown date'}
          {draft.created_by && ` by ${draft.created_by}`}
        </p>
        <Button variant="primary" size="md" onClick={exportZip} disabled={exporting || (stale.length > 0 && !ack)}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Export ZIP
        </Button>
      </div>

      {stale.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
          <p className="font-semibold">Salesforce has changed since this draft started</p>
          <ul className="mt-1 list-disc pl-5 text-xs">{stale.map((s) => <li key={s}>{s}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" className="accent-primary-700" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I&apos;ve reviewed these changes; export anyway (the readme lists them).
          </label>
        </div>
      )}
      {exportError && <p className="text-sm text-rose-700 dark:text-rose-300">{exportError}</p>}

      <RoleDesigner
        base={draft.base}
        operations={ops}
        position={position}
        users={draft.users}
        usersNote={draft.users_allowed ? null : draft.users_hidden_reason}
        onChange={onChange}
        status={status}
      />
      <ImpactPanel impact={impact.data} loading={impact.isFetching} pending={save.isPending || dirty} />
      <p className={`text-[11px] ${MUTED}`}>
        The export holds Role metadata and package.xml, a Data Loader CSV of user-to-role changes, the starting hierarchy
        in the same forms as a manual way back, and a readme. Newton never deploys anything.
        {isDemo && ' Demo org: the export is marked as demo data.'}
      </p>
    </div>
  )
}

export function OrgRoleDesign({ orgId, isDemo }: { orgId: string; isDemo: boolean }) {
  const list = useRoleDesigns(orgId)
  const create = useCreateRoleDesign(orgId)
  const remove = useDeleteRoleDesign(orgId)
  const [current, setCurrent] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const draft = useRoleDesign(orgId, current)

  useEffect(() => {
    if (!current && list.data?.length) setCurrent(list.data[0].id)
  }, [current, list.data])

  if (list.isLoading) return <TableSkeleton rows={6} />
  if (list.error) return <ErrorState message="Failed to load drafts." onRetry={() => list.refetch()} />

  return (
    <div className="space-y-4">
      <Card variant="bordered">
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          {list.data && list.data.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              Draft
              <select
                value={current ?? ''}
                onChange={(e) => setCurrent(e.target.value)}
                className="rounded-md border border-grove-border bg-grove-canvas px-2 py-1.5 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
              >
                {list.data.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.changes} {d.changes === 1 ? 'change' : 'changes'})</option>
                ))}
              </select>
            </label>
          )}
          {current && (
            confirmDelete === current ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this draft?
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(current, { onSuccess: () => { setCurrent(null); setConfirmDelete(null) } })}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Keep</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(current)}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete draft
              </Button>
            )
          )}
          <form
            className="ml-auto flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const n = newName.trim()
              if (n) create.mutate(n, { onSuccess: (d) => { setCurrent(d.id); setNewName('') } })
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New draft name"
              aria-label="New draft name"
              maxLength={120}
              className="rounded-md border border-grove-border bg-grove-canvas px-2 py-1.5 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!newName.trim() || create.isPending}>
              <FilePlus2 className="mr-1.5 h-4 w-4" /> Start a draft from the last sync
            </Button>
          </form>
          {create.error && <p className="w-full text-sm text-rose-700 dark:text-rose-300">{(create.error as Error).message}</p>}
        </CardContent>
      </Card>

      {!current ? (
        <p className={`text-sm ${MUTED}`}>
          No drafts yet. Name one and start it from the last sync: drafts stay in Newton and are never sent to Salesforce.
        </p>
      ) : draft.isLoading || !draft.data ? (
        <TableSkeleton rows={8} />
      ) : (
        <DraftEditor key={draft.data.id} orgId={orgId} draft={draft.data} isDemo={isDemo} />
      )}
    </div>
  )
}
