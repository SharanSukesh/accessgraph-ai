/**
 * Field metadata (roadmap item 8), from the synced describe: what a field
 * is, an object's fields, and its relationships. Shown only when synced;
 * nothing is guessed from names.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { GitBranch, Lock, ListTree } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'

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

/** The object page's field list, every field the describe returned. */
export function ObjectFieldsCard({
  orgId,
  objectName,
  fields,
  hiddenCount = 0,
  describeFailed = false,
}: {
  orgId: string
  objectName: string
  fields: FieldAttributes[]
  hiddenCount?: number
  describeFailed?: boolean
}) {
  const [filter, setFilter] = useState('')
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? fields.filter((f) => `${f.apiName} ${f.label} ${f.typeLabel}`.toLowerCase().includes(q)) : fields
  }, [fields, filter])
  const counts = {
    custom: fields.filter((f) => f.custom).length,
    formula: fields.filter((f) => f.formula).length,
    encrypted: fields.filter((f) => f.encryption).length,
  }
  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ListTree className="h-5 w-5" />
            Fields ({fields.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
            <span>{counts.custom} custom</span>·<span>{counts.formula} formula</span>·<span>{counts.encrypted} encrypted</span>
            <input
              aria-label="Filter fields"
              placeholder="Filter fields"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="ml-2 rounded-md px-2 py-1 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {(describeFailed || hiddenCount > 0) && (
          <p className="mb-3 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
            {describeFailed
              ? 'Salesforce wouldn’t describe this object for the integration user, so every field here comes from FieldDefinition: '
              : `${hiddenCount} field${hiddenCount === 1 ? '' : 's'} can’t be seen by the integration user (field-level security), so they come from FieldDefinition: `}
            encryption, formula text, picklist values and whether a field is required aren&apos;t known for{' '}
            {describeFailed ? 'them' : 'those'}.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
              <tr>
                <th className={th}>Label</th>
                <th className={th}>API name</th>
                <th className={th}>Type</th>
                <th className={th}>Required</th>
                <th className={th}>Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {shown.map((f) => (
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
          {shown.length === 0 && (
            <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">No field matches “{filter}”.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const KIND = { master_detail: 'Master-detail', lookup: 'Lookup' } as Record<string, string>

/** Parents (this object's lookup and master-detail fields) and children (synced objects pointing here). */
export function RelationshipsCard({ orgId, relationships }: { orgId: string; relationships: Relationships }) {
  const { parents, children } = relationships
  const objLink = (name: string) => (
    <Link key={name} href={`/orgs/${orgId}/objects/${name}`} className="font-mono text-xs text-primary-700 dark:text-primary-300 hover:underline">
      {name}
    </Link>
  )
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
            <h4 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">Looks up to ({parents.length})</h4>
            {parents.length === 0 ? (
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">No lookup or master-detail fields.</p>
            ) : (
              <ul className="space-y-1.5">
                {parents.map((p) => (
                  <li key={p.field} className="text-sm text-grove-ink dark:text-grove-ink-dk flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{p.field}</span>
                    <span aria-hidden>→</span>
                    <span>
                      {p.to.map((t, i) => (
                        <span key={t}>{i > 0 && ', '}{objLink(t)}</span>
                      ))}
                    </span>
                    <Badge variant={p.kind === 'master_detail' ? 'info' : 'default'} size="sm">{KIND[p.kind || ''] || 'Reference'}</Badge>
                    {p.required && p.kind !== 'master_detail' && <Badge variant="default" size="sm">Required</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">Referenced by ({children.length})</h4>
            {children.length === 0 ? (
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">No synced object points here.</p>
            ) : (
              <ul className="space-y-1.5">
                {children.map((c) => (
                  <li key={`${c.object}.${c.field}`} className="text-sm text-grove-ink dark:text-grove-ink-dk flex flex-wrap items-center gap-2">
                    <span>
                      {objLink(c.object)}
                      <span className="font-mono text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">.{c.field}</span>
                    </span>
                    <Badge variant={c.kind === 'master_detail' ? 'info' : 'default'} size="sm">{KIND[c.kind || ''] || 'Reference'}</Badge>
                    {c.cascadeDelete && (
                      <span className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">deleted with this record</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
