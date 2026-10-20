'use client'

/**
 * Custom metadata records, opt-in per type (roadmap item 11 part c2). Every
 * sync lists the org's custom metadata types; records are read only for the
 * types an admin turns on here, from the next sync, and appear in the Org
 * documentation workbook. Turning a type off removes its stored records.
 * The card shows the first 10 types (turned-on first) and View all opens
 * the full paged list.
 */

import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/shared/Badge'
import { apiClient } from '@/lib/api/client'
import type { Paged } from '@/lib/list/listState'
import { useAuth } from '@/lib/auth/AuthContext'

export interface CmdtType {
  name: string
  label: string | null
  enabled: boolean
  records: number | null
  missing?: boolean
}

export interface CmdtSummary {
  types: number
  enabled: number
  enabledTypes: string[]
  listed: boolean
  changed_by?: string
  changed_at?: string
}

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
export const CMDT_PREVIEW = 10

/** Turn one type on or off; the server keeps the full list. */
export function useToggleType(orgId: string, summary: CmdtSummary | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, on }: { name: string; on: boolean }) => {
      const current = new Set(summary?.enabledTypes ?? [])
      if (on) current.add(name)
      else current.delete(name)
      return apiClient.put(`/orgs/${orgId}/custom-metadata`, { types: [...current] })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-metadata', orgId] }),
  })
}

export function CustomMetadataTable({ orgId, rows, summary }: { orgId: string; rows: CmdtType[]; summary?: CmdtSummary }) {
  const { isAdmin } = useAuth()
  const toggle = useToggleType(orgId, summary)
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
        <thead>
          <tr className={`text-left text-xs uppercase ${MUTED}`}>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">Records</th>
            <th className="px-3 py-2 text-right font-medium">Read records</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
          {rows.map((t) => (
            <tr key={t.name}>
              <td className="px-3 py-2 font-mono text-xs">{t.name}</td>
              <td className={`px-3 py-2 ${MUTED}`}>{t.label ?? (t.missing ? 'Not in the last sync' : '—')}</td>
              <td className={`v2-num px-3 py-2 ${MUTED}`}>
                {!t.enabled ? 'Not read' : t.records == null ? 'From the next sync' : t.records.toLocaleString('en-US')}
              </td>
              <td className="px-3 py-2 text-right">
                {isAdmin ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" className="accent-primary-700" checked={t.enabled} disabled={toggle.isPending}
                      aria-label={`Read records of ${t.name}`}
                      onChange={(e) => toggle.mutate({ name: t.name, on: e.target.checked })} />
                    {t.enabled ? 'On' : 'Off'}
                  </label>
                ) : (
                  <Badge variant={t.enabled ? 'warning' : 'default'} size="sm">{t.enabled ? 'On' : 'Off'}</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{(toggle.error as Error).message}</p>}
    </div>
  )
}

export function CustomMetadataCard({ orgId }: { orgId: string }) {
  const { data } = useQuery({
    queryKey: ['custom-metadata', orgId, 'preview'],
    queryFn: () => apiClient.get<Paged<CmdtType, { summary: CmdtSummary }>>(
      `/orgs/${orgId}/custom-metadata?page=1&page_size=25`),
  })
  const s = data?.summary
  return (
    <div className="space-y-3">
      <p className={`text-sm ${MUTED}`}>
        Custom metadata values can hold configuration a client treats as confidential, such as endpoints and which
        credential each integration uses. Newton lists the types at every sync but reads a type&apos;s records only
        when an admin turns it on here, from the next sync; they then appear in the Org documentation workbook.
        Turning a type off removes its records from Newton.
      </p>
      {!data ? null : !s?.listed ? (
        <p className={`text-sm ${MUTED}`}>Sync the org to list its custom metadata types.</p>
      ) : s.types === 0 ? (
        <p className={`text-sm ${MUTED}`}>This org has no custom metadata types.</p>
      ) : (
        <>
          <p className="text-sm">
            <strong className="v2-num">{s.enabled}</strong> of <strong className="v2-num">{s.types}</strong> types turned on
            {s.changed_by && <span className={MUTED}> · last changed by {s.changed_by}
              {s.changed_at ? ` on ${new Date(s.changed_at).toLocaleString()}` : ''}</span>}
          </p>
          <CustomMetadataTable orgId={orgId} rows={data.items.slice(0, CMDT_PREVIEW)} summary={s} />
          {data.total > CMDT_PREVIEW && (
            <Link href={`/orgs/${orgId}/privacy/custom-metadata`}
              className="inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
              View all {data.total} types
            </Link>
          )}
        </>
      )}
    </div>
  )
}
