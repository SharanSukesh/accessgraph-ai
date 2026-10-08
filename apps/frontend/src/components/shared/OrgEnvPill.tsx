import { Pill } from '@/components/v2/primitives'

/** Sandbox / Production badge for a client org. Renders nothing when unknown (no connection yet). */
export function OrgEnvPill({ isSandbox }: { isSandbox: boolean | null | undefined }) {
  if (isSandbox == null) return null
  return isSandbox ? <Pill tone="copper">Sandbox</Pill> : <Pill tone="mint">Production</Pill>
}
