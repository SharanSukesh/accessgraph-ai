'use client'

/**
 * "Why?" panel for one object on a user's Object Access tab: every path
 * that grants (or, through a muting set, removes) access, from
 * GET /orgs/{org}/users/{user}/explain/object/{object}.
 */

import { Loader2, MinusCircle } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { useObjectAccessExplanation, type AccessPath } from '@/lib/api/hooks/useUsers'

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profile',
  permission_set: 'Permission set',
  permission_set_group: 'Permission set group',
}

const FLAG_ORDER = ['read', 'create', 'edit', 'delete'] as const

/** "PSG: Sales Manager Bundle" -> "Sales Manager Bundle" */
function sourceName(path: AccessPath): string {
  const i = path.source_name.indexOf(': ')
  return i >= 0 ? path.source_name.slice(i + 2) : path.source_name
}

export function ExplainAccessPanel({
  orgId,
  userId,
  objectName,
}: {
  orgId: string
  userId: string
  objectName: string
}) {
  const { data, isLoading, error } = useObjectAccessExplanation(orgId, userId, objectName)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Tracing access to {objectName}…
      </div>
    )
  }
  if (error || !data) {
    return <p className="text-sm text-red-700 dark:text-red-400">Could not load the access path for {objectName}.</p>
  }

  const effective = FLAG_ORDER.filter((f) => data.access?.[f]).map((f) => f[0].toUpperCase() + f.slice(1))

  return (
    <div className="space-y-3">
      <p className="text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
        <span className="font-medium">Effective access to {objectName}:</span>{' '}
        {effective.length ? effective.join(', ') : 'none'}. Salesforce grants the union of every path below.
      </p>
      {data.paths.length === 0 ? (
        <p className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
          No profile, permission set or group grants access to this object.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.paths.map((path, i) => (
            <li
              key={`${path.source_name}-${i}`}
              className="rounded-lg border border-grove-border bg-grove-surface px-3 py-2 dark:border-grove-border-dk dark:bg-grove-surface-dk"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                  {SOURCE_LABELS[path.source_type] ?? path.source_type}
                </span>
                <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">{sourceName(path)}</span>
                {path.permissions.length ? (
                  path.permissions.map((p) => (
                    <Badge key={p} variant="success" size="sm">
                      {p}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="default" size="sm">
                    Nothing after muting
                  </Badge>
                )}
              </div>
              {path.source_type === 'permission_set_group' &&
                path.granted_via.length > 0 &&
                path.granted_via.join() !== sourceName(path) && (
                <p className="mt-1 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                  Granted by {path.granted_via.join(', ')} in this group
                </p>
              )}
              {path.muted.map((m) => (
                <p
                  key={`${m.permission}-${m.muted_by}`}
                  className="mt-1 flex items-center gap-1 text-xs text-red-700 dark:text-red-400"
                >
                  <MinusCircle className="h-3.5 w-3.5" />
                  {m.permission} muted by {m.muted_by}
                </p>
              ))}
              <p className="mt-1 text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{path.steps.join(' → ')}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
