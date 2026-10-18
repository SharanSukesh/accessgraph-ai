'use client'

/**
 * Role design for a new implementation (roadmap 35b): design a role
 * hierarchy from scratch and export it as Role metadata with a readme.
 * There's no org yet, so no users and no impact preview; the draft stays
 * in this browser, like the rest of the advisor's answers.
 */

import { useEffect, useState } from 'react'
import { Download, Loader2, RotateCcw } from 'lucide-react'
import { Reveal } from '@/components/v2/motion'
import { Button } from '@/components/shared/Button'
import { RoleDesigner } from '@/components/roles/RoleDesigner'
import { downloadPost } from '@/components/roles/OrgRoleDesign'
import { API_BASE_URL } from '@/lib/api/client'
import { endpoints } from '@/lib/api/endpoints'
import type { DesignBase, Operation } from '@/lib/roleDesign'

const KEY = 'newton.implementation.roleDesign'
const BLANK: DesignBase = { roles: [], users: {}, synced_at: null }

interface Saved {
  name: string
  operations: Operation[]
  position: number
}

export default function ImplementationRoleDesignPage() {
  const [saved, setSaved] = useState<Saved | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY)
      setSaved(raw ? (JSON.parse(raw) as Saved) : { name: 'New role hierarchy', operations: [], position: 0 })
    } catch {
      setSaved({ name: 'New role hierarchy', operations: [], position: 0 })
    }
  }, [])
  useEffect(() => {
    if (!saved) return
    try {
      window.localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      /* storage unavailable: the design lasts for this visit */
    }
  }, [saved])

  if (!saved) return null
  const slug = saved.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role-design'

  async function exportZip() {
    if (!saved) return
    setBusy(true)
    setError(null)
    try {
      await downloadPost(`${API_BASE_URL}${endpoints.roleDesignBlankExport()}`,
        { name: saved.name, operations: saved.operations.slice(0, saved.position) }, `role-design-${slug}.zip`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · design</p>
            <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">Role design</h1>
            <p className="mt-1.5 max-w-xl text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
              Design the client&apos;s role hierarchy from scratch and export it as Role metadata with a readme. The
              design stays in this browser.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {confirmReset ? (
              <span className="flex items-center gap-2 text-sm">
                Start again?
                <Button variant="ghost" size="sm" onClick={() => { setSaved({ ...saved, operations: [], position: 0 }); setConfirmReset(false) }}>
                  Clear the design
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Keep it</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={!saved.operations.length}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> Start again
              </Button>
            )}
            <Button variant="primary" size="md" onClick={exportZip} disabled={busy || saved.position === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export ZIP
            </Button>
          </div>
        </div>
      </Reveal>
      <label className="block max-w-md text-xs font-semibold">
        Design name
        <input
          value={saved.name}
          maxLength={120}
          onChange={(e) => setSaved({ ...saved, name: e.target.value })}
          className="mt-1 w-full rounded-md border border-grove-border bg-grove-canvas px-2 py-1.5 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
        />
      </label>
      {error && <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      <RoleDesigner
        base={BLANK}
        operations={saved.operations}
        position={saved.position}
        users={[]}
        usersNote="No users yet: this hierarchy is designed before the org exists."
        onChange={(operations, position) => setSaved({ ...saved, operations, position })}
      />
    </div>
  )
}
