/**
 * Rows for the user-compare object matrix: one per object any selected user
 * can reach, with each user's CRUD and whether the users differ.
 */
export interface ObjectPerms {
  canRead?: boolean
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
}

export interface CompareInput {
  userId: string
  objectAccess: { objectName: string; permissions?: ObjectPerms }[]
}

export interface CompareRow {
  objectName: string
  perms: (ObjectPerms | null)[] // per user, in userIds order; null = no access
  differs: boolean
}

const FLAGS = ['canRead', 'canCreate', 'canEdit', 'canDelete'] as const

export function compareObjects(
  data: CompareInput[],
  userIds: string[],
  { search = '', differencesOnly = false }: { search?: string; differencesOnly?: boolean } = {},
): CompareRow[] {
  const byUser = new Map(
    data.map((d) => [d.userId, new Map(d.objectAccess.map((o) => [o.objectName, o.permissions ?? {}]))]),
  )
  const names = new Set<string>()
  byUser.forEach((objects) => objects.forEach((_, name) => names.add(name)))
  const needle = search.trim().toLowerCase()

  const rows: CompareRow[] = []
  for (const objectName of Array.from(names).sort((a, b) => a.localeCompare(b))) {
    if (needle && !objectName.toLowerCase().includes(needle)) continue
    const perms = userIds.map((id) => byUser.get(id)?.get(objectName) ?? null)
    const differs = FLAGS.some((f) => new Set(perms.map((p) => !!p?.[f])).size > 1)
    if (differencesOnly && !differs) continue
    rows.push({ objectName, perms, differs })
  }
  return rows
}
