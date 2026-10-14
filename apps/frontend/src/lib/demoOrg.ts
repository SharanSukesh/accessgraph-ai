/**
 * What a demo org (synthetic data, no Salesforce connection) can't show.
 * The sidebar greys these pages out and the user page greys out the
 * Record Access tab, all with the same message.
 */
export const DEMO_UNAVAILABLE_MESSAGE =
  'Needs a live Salesforce connection, so it is not available for a demo org.'

/** Org-scoped sidebar slugs that need live data or data the fixtures lack. */
export const DEMO_UNAVAILABLE_PAGES = new Set(['change-risk', 'sprawl', 'equity'])

/** User-page tabs unavailable for a demo org (the fixtures carry no sharing data). */
export const DEMO_UNAVAILABLE_USER_TABS = new Set(['records'])

export function unavailableForDemo(isDemo: boolean | undefined, slug: string): boolean {
  return !!isDemo && (DEMO_UNAVAILABLE_PAGES.has(slug) || DEMO_UNAVAILABLE_USER_TABS.has(slug))
}
