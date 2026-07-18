'use client'

/**
 * v2 Schema — objects and fields metadata explorer.
 *
 * Structure: PageTitle → Segmented tabs (Objects / Fields), each with
 * its own KPI strip and table. Object rows carry a mini data-quality
 * bar; the Fields tab adds an A–Z letter filter row (visual mock).
 */

import { useMemo, useState } from 'react'
import { Boxes, Wrench, ShieldAlert, Gauge, Rows3, Lock, KeyRound } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SectionHeading, Segmented, Pill,
  V2Table, V2Row, Td,
} from '@/components/v2/primitives'
import { SCHEMA_OBJECTS, DATA_QUALITY, fmtCompact } from '@/lib/v2/mock-data'

type Tab = 'objects' | 'fields'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const FIELDS: {
  label: string
  object: string
  api: string
  type: string
  sensitive: boolean
  encrypted: boolean
  custom: boolean
}[] = [
  { label: 'Annual Revenue', object: 'Account', api: 'AnnualRevenue', type: 'Currency', sensitive: true, encrypted: false, custom: false },
  { label: 'Bank Account Number', object: 'Invoice__c', api: 'Bank_Account_Number__c', type: 'Text (encrypted)', sensitive: true, encrypted: true, custom: true },
  { label: 'Close Date', object: 'Opportunity', api: 'CloseDate', type: 'Date', sensitive: false, encrypted: false, custom: false },
  { label: 'Email', object: 'Contact', api: 'Email', type: 'Email', sensitive: true, encrypted: false, custom: false },
  { label: 'Margin Percent', object: 'Project__c', api: 'Margin_Percent__c', type: 'Percent', sensitive: true, encrypted: false, custom: true },
  { label: 'Priority', object: 'Case', api: 'Priority', type: 'Picklist', sensitive: false, encrypted: false, custom: false },
  { label: 'SSN', object: 'Contact', api: 'SSN__c', type: 'Text (encrypted)', sensitive: true, encrypted: true, custom: true },
  { label: 'Stage', object: 'Opportunity', api: 'StageName', type: 'Picklist', sensitive: false, encrypted: false, custom: false },
]

function qualityColor(q: number): string {
  if (q >= 75) return 'bg-primary-600 dark:bg-primary-400'
  if (q >= 60) return 'bg-amber-600 dark:bg-amber-400'
  return 'bg-red-600 dark:bg-red-400'
}

export default function SchemaPage() {
  const [tab, setTab] = useState<Tab>('objects')
  const [letter, setLetter] = useState<string | null>(null)

  const activeLetters = useMemo(() => new Set(FIELDS.map((f) => f.label[0].toUpperCase())), [])
  const visibleFields = useMemo(
    () => (letter ? FIELDS.filter((f) => f.label[0].toUpperCase() === letter) : FIELDS),
    [letter],
  )

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Explore · metadata"
          title="Schema"
          subtitle="Objects and fields, with per-object data quality."
        />
      </Reveal>

      <Reveal delay={0.05}>
        <Segmented
          options={[
            { key: 'objects', label: 'Objects', count: 438 },
            { key: 'fields', label: 'Fields', count: 9840 },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </Reveal>

      {tab === 'objects' && (
        <div className="space-y-8">
          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StaggerItem>
              <StatCard label="Total objects" value={438} icon={Boxes} delta="standard + custom" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Custom" value={112} icon={Wrench} delta="26% of the org" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Sensitive" value={24} icon={ShieldAlert} delta="hold PII / financial data" deltaTone="bad" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Avg data quality" value={DATA_QUALITY.avg} suffix="/100" icon={Gauge} delta="aggregate SOQL scan" />
            </StaggerItem>
          </Stagger>

          <Reveal>
            <V2Card className="p-6">
              <SectionHeading
                title="Objects"
                hint="Record volume, field count, and data quality per object"
              />
              <V2Table head={['Object', 'Type', 'Records', 'Fields', 'Data quality']}>
                {SCHEMA_OBJECTS.map((o) => (
                  <V2Row key={o.name} onClick={() => {}}>
                    <Td>
                      <p className="font-semibold text-grove-ink dark:text-grove-ink-dk">{o.label}</p>
                      <p className="font-mono text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{o.name}</p>
                    </Td>
                    <Td>
                      <Pill tone={o.custom ? 'copper' : 'neutral'}>{o.custom ? 'Custom' : 'Standard'}</Pill>
                    </Td>
                    <Td className="v2-num whitespace-nowrap">{fmtCompact(o.records)}</Td>
                    <Td className="v2-num">{o.fields}</Td>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-grove-canvas dark:bg-grove-canvas-dk">
                          <span
                            className={`block h-full rounded-full ${qualityColor(o.quality)}`}
                            style={{ width: `${o.quality}%` }}
                          />
                        </span>
                        <span className="v2-num text-xs font-semibold text-grove-ink dark:text-grove-ink-dk">
                          {o.quality}
                        </span>
                      </span>
                    </Td>
                  </V2Row>
                ))}
              </V2Table>
            </V2Card>
          </Reveal>
        </div>
      )}

      {tab === 'fields' && (
        <div className="space-y-8">
          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StaggerItem>
              <StatCard label="Total fields" value={9840} icon={Rows3} delta="across 438 objects" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Sensitive" value={186} icon={ShieldAlert} delta="PII, financial, health" deltaTone="bad" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Encrypted" value={42} icon={Lock} delta="Shield platform encryption" deltaTone="good" />
            </StaggerItem>
          </Stagger>

          <Reveal>
            <V2Card className="p-6">
              <SectionHeading
                title="Fields"
                hint={`${visibleFields.length} shown · filter by first letter`}
              />

              <div className="mb-5 flex flex-wrap gap-1">
                {LETTERS.map((l) => {
                  const active = letter === l
                  const hasFields = activeLetters.has(l)
                  return (
                    <button
                      key={l}
                      onClick={() => setLetter(active ? null : l)}
                      className={`v2-num h-7 w-7 rounded-lg text-xs font-semibold transition-all duration-150 ${
                        active
                          ? 'bg-primary-700 text-white shadow-sm dark:bg-primary-400 dark:text-grove-canvas-dk'
                          : hasFields
                          ? 'text-grove-ink/70 hover:bg-grove-canvas hover:text-grove-ink dark:text-grove-ink-dk/70 dark:hover:bg-grove-canvas-dk dark:hover:text-grove-ink-dk'
                          : 'text-grove-ink/25 dark:text-grove-ink-dk/25'
                      }`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>

              <V2Table head={['Field', 'Object', 'API name', 'Type', 'Properties']}>
                {visibleFields.map((f) => (
                  <V2Row key={f.api} onClick={() => {}}>
                    <Td className="font-semibold text-grove-ink dark:text-grove-ink-dk">{f.label}</Td>
                    <Td>{f.object}</Td>
                    <Td className="font-mono text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">{f.api}</Td>
                    <Td className="text-grove-ink/70 dark:text-grove-ink-dk/70">{f.type}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1.5">
                        {f.sensitive && <Pill tone="copper">Sensitive</Pill>}
                        {f.encrypted && (
                          <Pill tone="mint">
                            <KeyRound className="h-3 w-3" /> Encrypted
                          </Pill>
                        )}
                        {f.custom && <Pill tone="neutral">Custom</Pill>}
                        {!f.sensitive && !f.encrypted && !f.custom && (
                          <span className="text-grove-ink/30 dark:text-grove-ink-dk/30">—</span>
                        )}
                      </span>
                    </Td>
                  </V2Row>
                ))}
              </V2Table>

              {visibleFields.length === 0 && (
                <p className="py-10 text-center text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
                  No fields start with “{letter}” in this mock — pick another letter.
                </p>
              )}
            </V2Card>
          </Reveal>
        </div>
      )}
    </div>
  )
}
