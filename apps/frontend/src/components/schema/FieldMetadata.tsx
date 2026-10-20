'use client'

/**
 * Field metadata (roadmap item 8), from the synced describe: what a field
 * is, an object's fields, and its relationships. Shown only when synced;
 * nothing is guessed from names.
 */

import Link from 'next/link'
import { ArrowRight, GitBranch, Lock, ListTree } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { ListSearch } from '@/components/shared/ListSearch'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

export type Encryption = 'shield' | 'classic' | null | undefined

export interface FieldAttributes {
  apiName?: string
  label?: string
  type?: string
  typeLabel?: string
  length?: number
  precision?: number
  scale?: number
  required?: boolean
  formula?: boolean
  calculatedFormula?: string
  referenceTo?: string[]
  relationship?: 'lookup' | 'master_detail'
  relationshipName?: string
  externalId?: boolean
  unique?: boolean
  encryption?: Encryption
  picklistValues?: { value: string; label: string; active: boolean; default?: boolean }[]
  inlineHelpText?: string
  custom?: boolean
  isSensitive?: boolean
  // The describe left this field out (field-level security); FieldDefinition typed it.
  fromFieldDefinition?: boolean
}

export interface Relationships {
  parents: { field: string; label?: string; to: string[]; kind?: string; required: boolean }[]
  children: { object: string; field: string; relationshipName?: string; kind?: string; cascadeDelete: boolean }[]
}

const ENCRYPTION_LABEL = { shield: 'Shield encrypted', classic: 'Classic encrypted' } as const
const ENCRYPTION_HELP = {
  shield: 'Shield Platform Encryption: the describe returns encrypted = true.',
  classic: 'Classic encryption: an Encrypted Text field (type encryptedstring).',
} as const

export function EncryptionBadge({ encryption }: { encryption: Encryption }) {
  if (!encryption) return null
  return (
    <span title={ENCRYPTION_HELP[encryption]}>
      <Badge variant="success" size="sm">
        <Lock className="h-3 w-3 mr-1" aria-hidden />
        {ENCRYPTION_LABEL[encryption]}
      </Badge>
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 border-b border-grove-border/60 dark:border-grove-border-dk/60 last:border-0">
      <dt className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{label}</dt>
      <dd className="text-sm text-grove-ink dark:text-grove-ink-dk min-w-0 break-words">{children}</dd>
    </div>
  )
}

const yes = (v?: boolean) => (v ? 'Yes' : 'No')

/** The field page's "Field details" card. */
export function FieldDetailsCard({ orgId, attributes }: { orgId: string; attributes: FieldAttributes | null | undefined }) {
  if (!attributes) {
    return (
      <Card variant="bordered">
        <CardContent className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
          Field type, formula and encryption appear after the next sync reads this org&apos;s field metadata.
        </CardContent>
      </Card>
    )
  }
  const a = attributes
  const hidden = !!a.fromFieldDefinition
  const numeric = a.precision !== undefined
  const active = (a.picklistValues || []).filter((v) => v.active)
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTree className="h-5 w-5" />
          Field details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <Row label="Type">
            <span className="font-medium">{a.typeLabel}</span>
            {a.type && <span className="ml-2 font-mono text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{a.type}</span>}
          </Row>
          {a.length !== undefined && a.type !== 'reference' && a.type !== 'id' && <Row label="Length">{a.length}</Row>}
          {numeric && <Row label="Precision, scale">{a.precision}, {a.scale}</Row>}
          <Row label="Required">{hidden ? 'Not known' : yes(a.required)}</Row>
          {a.referenceTo && a.referenceTo.length > 0 && (
            <Row label={a.relationship === 'master_detail' ? 'Master-detail to' : 'Lookup to'}>
              {a.referenceTo.map((t, i) => (
                <span key={t}>
                  {i > 0 && ', '}
                  <Link href={`/orgs/${orgId}/objects/${t}`} className="font-mono text-primary-700 dark:text-primary-300 hover:underline">
                    {t}
                  </Link>
                </span>
              ))}
              {a.relationshipName && (
                <span className="ml-2 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">relationship {a.relationshipName}</span>
              )}
            </Row>
          )}
          {a.formula && (
            <Row label="Formula">
              {a.calculatedFormula ? (
                <pre className="whitespace-pre-wrap font-mono text-xs bg-grove-canvas dark:bg-grove-surface-dk rounded p-2 ring-1 ring-grove-border dark:ring-grove-border-dk">
                  {a.calculatedFormula}
                </pre>
              ) : (
                'Calculated; the formula text isn\'t known'
              )}
            </Row>
          )}
          <Row label="Encryption">
            {a.encryption ? <EncryptionBadge encryption={a.encryption} /> : hidden ? 'Not known' : 'None'}
          </Row>
          {(a.externalId || a.unique) && (
            <Row label="Keys">{[a.externalId && 'External ID', a.unique && 'Unique'].filter(Boolean).join(', ')}</Row>
          )}
          {a.picklistValues && a.picklistValues.length > 0 && (
            <Row label={`Picklist values (${active.length})`}>
              <div className="flex flex-wrap gap-1">
                {a.picklistValues.map((v) => (
                  <Badge key={v.value} variant={v.active ? 'default' : 'warning'} size="sm">
                    {v.label}
                    {v.default && ' (default)'}
                    {!v.active && ' (inactive)'}
                  </Badge>
                ))}
              </div>
            </Row>
          )}
          {a.inlineHelpText && <Row label="Help text">{a.inlineHelpText}</Row>}
        </dl>
        {hidden && (
          <p className="mt-3 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
            The integration user can&apos;t see this field (field-level security), so Salesforce&apos;s describe left it
            out. Its type comes from FieldDefinition, which doesn&apos;t give encryption, formula text, picklist values
            or whether it&apos;s required.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

const th = 'px-4 py-2 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase'
const td = 'px-4 py-2 text-sm text-grove-ink dark:text-grove-ink-dk'

type SortProps = { sort: string | null; dir: 'asc' | 'desc'; onSort: (c: string, d: 'asc' | 'desc') => void }

function Head({ label, column, sort }: { label: string; column?: string; sort?: SortProps }) {
  if (sort && column) return <SortHeader label={label} column={column} {...sort} />
  return <th className={th}>{label}</th>
}

/** Field rows, shared by the object page preview and the full list. */
export function FieldRowsTable({ orgId, objectName, fields, sort }: {
  orgId: string
  objectName: string
  fields: FieldAttributes[]
  sort?: SortProps
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
          <tr>
            <Head label="Label" column="label" sort={sort} />
            <Head label="API name" column="apiName" sort={sort} />
            <Head label="Type" column="type" sort={sort} />
            <Head label="Required" column="required" sort={sort} />
            <th className={th}>Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {fields.map((f) => (
            <tr key={f.apiName} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
              <td className={td}>
                <Link
                  href={`/orgs/${orgId}/fields/${encodeURIComponent(`${objectName}.${f.apiName}`)}`}
                  className="text-primary-700 dark:text-primary-300 hover:underline"
                >
                  {f.label}
                </Link>
              </td>
              <td className={`${td} font-mono text-xs`}>{f.apiName}</td>
              <td className={`${td} whitespace-nowrap`}>{f.typeLabel}</td>
              <td className={td}>
                {f.fromFieldDefinition ? (
                  <span className="text-grove-ink/55 dark:text-grove-ink-dk/55">Not known</span>
                ) : f.required ? (
                  'Yes'
                ) : (
                  ''
                )}
              </td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  <EncryptionBadge encryption={f.encryption} />
                  {f.isSensitive && <Badge variant="warning" size="sm">Sensitive</Badge>}
                  {f.externalId && <Badge variant="default" size="sm">External ID</Badge>}
                  {f.custom && <Badge variant="info" size="sm">Custom</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export interface SchemaSummary {
  fields: { count: number; preview: FieldAttributes[]; custom: number; formula: number; encrypted: number }
  parents: { count: number; preview: Relationships['parents'] }
  children: { count: number; preview: Relationships['children'] }
}

function hiddenNote(hiddenCount: number, describeFailed: boolean) {
  if (!describeFailed && hiddenCount === 0) return null
  return (
    <p className="mb-3 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
      {describeFailed
        ? 'Salesforce wouldn’t describe this object for the integration user, so every field here comes from FieldDefinition: '
        : `${hiddenCount} field${hiddenCount === 1 ? '' : 's'} can’t be seen by the integration user (field-level security), so they come from FieldDefinition: `}
      encryption, formula text, picklist values and whether a field is required aren&apos;t known for{' '}
      {describeFailed ? 'them' : 'those'}.
    </p>
  )
}

function ViewAll({ shown, count, href, noun }: { shown: number; count: number; href: string; noun: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">
      <span>
        Showing {Math.min(shown, count).toLocaleString('en-US')} of {count.toLocaleString('en-US')} {noun}
      </span>
      {count > shown && (
        <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary-700 dark:text-primary-300 hover:underline">
          View all {count.toLocaleString('en-US')} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** The object page's field preview: counts, the first 10 fields, and View all. */
export function ObjectFieldsCard({
  orgId,
  objectName,
  summary,
  hiddenCount = 0,
  describeFailed = false,
}: {
  orgId: string
  objectName: string
  summary: SchemaSummary['fields']
  hiddenCount?: number
  describeFailed?: boolean
}) {
  const base = `/orgs/${orgId}/objects/${encodeURIComponent(objectName)}/fields`
  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListTree className="h-5 w-5" />
            Fields ({summary.count.toLocaleString('en-US')})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {(['custom', 'formula', 'encrypted'] as const).map((k) => (
              <Link key={k} href={`${base}?kind=fields&filter=${k}`} className="text-primary-700 dark:text-primary-300 hover:underline">
                {summary[k].toLocaleString('en-US')} {k}
              </Link>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hiddenNote(hiddenCount, describeFailed)}
        <FieldRowsTable orgId={orgId} objectName={objectName} fields={summary.preview} />
        <ViewAll shown={summary.preview.length} count={summary.count} href={`${base}?kind=fields`} noun="fields" />
      </CardContent>
    </Card>
  )
}

const KIND = { master_detail: 'Master-detail', lookup: 'Lookup' } as Record<string, string>

function objLink(orgId: string, name: string) {
  return (
    <Link key={name} href={`/orgs/${orgId}/objects/${name}`} className="font-mono text-xs text-primary-700 dark:text-primary-300 hover:underline">
      {name}
    </Link>
  )
}

export function ParentRows({ orgId, rows }: { orgId: string; rows: Relationships['parents'] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((p) => (
        <li key={p.field} className="text-sm text-grove-ink dark:text-grove-ink-dk flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{p.field}</span>
          <span aria-hidden>→</span>
          <span>
            {p.to.map((t, i) => (
              <span key={t}>{i > 0 && ', '}{objLink(orgId, t)}</span>
            ))}
          </span>
          <Badge variant={p.kind === 'master_detail' ? 'info' : 'default'} size="sm">{KIND[p.kind || ''] || 'Reference'}</Badge>
          {p.required && p.kind !== 'master_detail' && <Badge variant="default" size="sm">Required</Badge>}
        </li>
      ))}
    </ul>
  )
}

export function ChildRows({ orgId, rows }: { orgId: string; rows: Relationships['children'] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((c) => (
        <li key={`${c.object}.${c.field}`} className="text-sm text-grove-ink dark:text-grove-ink-dk flex flex-wrap items-center gap-2">
          <span>
            {objLink(orgId, c.object)}
            <span className="font-mono text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">.{c.field}</span>
          </span>
          <Badge variant={c.kind === 'master_detail' ? 'info' : 'default'} size="sm">{KIND[c.kind || ''] || 'Reference'}</Badge>
          {c.cascadeDelete && <span className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">deleted with this record</span>}
        </li>
      ))}
    </ul>
  )
}

/** Parents and children: counts, the first 10 of each, and View all. */
export function RelationshipsCard({ orgId, objectName, summary }: { orgId: string; objectName: string; summary: SchemaSummary }) {
  const base = `/orgs/${orgId}/objects/${encodeURIComponent(objectName)}/fields`
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Relationships
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
              Looks up to ({summary.parents.count.toLocaleString('en-US')})
            </h4>
            {summary.parents.count === 0 ? (
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">No lookup or master-detail fields.</p>
            ) : (
              <>
                <ParentRows orgId={orgId} rows={summary.parents.preview} />
                <ViewAll shown={summary.parents.preview.length} count={summary.parents.count} href={`${base}?kind=parents`} noun="" />
              </>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
              Referenced by ({summary.children.count.toLocaleString('en-US')})
            </h4>
            {summary.children.count === 0 ? (
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">No synced object points here.</p>
            ) : (
              <>
                <ChildRows orgId={orgId} rows={summary.children.preview} />
                <ViewAll shown={summary.children.preview.length} count={summary.children.count} href={`${base}?kind=children`} noun="" />
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const SCHEMA_TABS = [
  { key: 'fields', label: 'Fields' },
  { key: 'parents', label: 'Looks up to' },
  { key: 'children', label: 'Referenced by' },
] as const

/** The full list of an object's fields or relationships: paged, searchable, sortable, in the URL. */
export function ObjectSchemaList({ orgId, objectName }: { orgId: string; objectName: string }) {
  const { state, update } = useListState('', { filters: ['kind', 'filter'] })
  const kind = (SCHEMA_TABS.some((t) => t.key === state.filters.kind) ? state.filters.kind : 'fields') as 'fields' | 'parents' | 'children'
  const filters: Record<string, string> = { kind }
  if (kind === 'fields' && state.filters.filter) filters.filter = state.filters.filter
  const { data, isLoading, error } = usePaged<any>(
    ['object-schema', orgId, objectName],
    `/orgs/${orgId}/objects/${encodeURIComponent(objectName)}/schema`,
    { ...state, filters },
  )
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const pill = (active: boolean) =>
    'rounded-full px-3 py-1 text-sm font-medium ring-1 ' +
    (active
      ? 'bg-primary-700 text-white ring-primary-700 dark:bg-primary-500 dark:text-grove-canvas-dk dark:ring-primary-500'
      : 'text-grove-ink dark:text-grove-ink-dk ring-grove-border dark:ring-grove-border-dk hover:bg-primary-50/50 dark:hover:bg-primary-900/20')
  return (
    <Card variant="bordered">
      <CardContent className="pt-6">
        <div role="tablist" className="flex flex-wrap gap-2 mb-3">
          {SCHEMA_TABS.map((t) => (
            <button key={t.key} role="tab" type="button" aria-selected={t.key === kind} className={pill(t.key === kind)}
              onClick={() => update({ filters: { kind: t.key, filter: '' }, sort: null })}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-3">
          <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={kind === 'fields' ? 'Search fields...' : 'Search relationships...'} />
          {kind === 'fields' && (
            <select
              aria-label="Show"
              value={state.filters.filter || ''}
              onChange={(e) => update({ filters: { filter: e.target.value } })}
              className="rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk"
            >
              <option value="">All fields</option>
              <option value="custom">Custom</option>
              <option value="formula">Formula</option>
              <option value="encrypted">Encrypted</option>
            </select>
          )}
        </div>
        {error ? (
          <p className="py-4 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">{(error as Error).message}</p>
        ) : isLoading || !data ? (
          <TableSkeleton rows={10} />
        ) : data.total === 0 ? (
          <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q ? `Nothing matches “${state.q}”.` : 'None.'}</p>
        ) : (
          <>
            {kind === 'fields' && <FieldRowsTable orgId={orgId} objectName={objectName} fields={data.items} sort={sort} />}
            {kind === 'parents' && <ParentRows orgId={orgId} rows={data.items} />}
            {kind === 'children' && <ChildRows orgId={orgId} rows={data.items} />}
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} label={kind}
              onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
