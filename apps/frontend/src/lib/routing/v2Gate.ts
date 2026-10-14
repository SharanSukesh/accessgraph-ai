/**
 * The /v2 tree is a static visual prototype (it reads src/lib/v2/mock-data.ts
 * and never calls the API), so it stays out of client demos. It is off
 * unless NEXT_PUBLIC_ENABLE_V2=true; when off, src/middleware.ts sends each
 * /v2 path to its v1 equivalent.
 */

export function v2Enabled(flag: string | undefined = process.env.NEXT_PUBLIC_ENABLE_V2): boolean {
  return flag === 'true'
}

// v2 org pages whose v1 page lives at the same slug.
const SAME_SLUG = new Set([
  'dashboard', 'users', 'schema', 'graph', 'recommendations', 'anomalies', 'change-risk',
  'org-analyzer', 'equity', 'restructure', 'sprawl', 'license-fit', 'compliance',
  'reporting-graph', 'privacy',
])

/** The v1 path for a /v2 path. */
export function v1PathFor(pathname: string): string {
  const rest = pathname.replace(/^\/v2(?=\/|$)/, '')
  if (rest === '/login') return '/login'
  const org = rest.match(/^\/orgs\/([^/]+)(?:\/(.*))?$/)
  if (!org) return '/orgs'
  const [, orgId, tail = ''] = org
  const [slug] = tail.split('/')
  if (slug === 'admin-users') return '/admin/users'
  if (slug === 'users' && tail !== 'users') return `/orgs/${orgId}/${tail}`
  if (SAME_SLUG.has(slug)) return `/orgs/${orgId}/${slug}`
  return `/orgs/${orgId}/dashboard`
}
