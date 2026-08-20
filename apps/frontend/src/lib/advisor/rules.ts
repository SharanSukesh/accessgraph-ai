/**
 * New Implementation Advisor — recommendation rule engine.
 *
 * Pure functions: questionnaire answers in, recommendation out. Every
 * rule is a transparent, defensible if-this-then-that a consultant can
 * read aloud to a client — no scoring black box. Prices are Salesforce
 * LIST prices (USD, per user per month unless noted); real contracts
 * negotiate down, which the results page says out loud.
 *
 * v1 is deliberately frontend-only: nothing here talks to the backend.
 */

// ---------------------------------------------------------------- answers

export interface AdvisorAnswers {
  companySize: 'lt25' | '25-100' | '100-500' | '500-2000' | 'gt2000'
  industry:
    | 'tech' | 'finserv' | 'healthcare' | 'manufacturing'
    | 'retail' | 'services' | 'nonprofit' | 'other'
  salesSeats: number
  serviceSeats: number
  marketingSeats: number
  opsSeats: number
  readOnlySeats: number
  partnerUsers: 'none' | 'lt100' | '100-1000' | 'gt1000'
  useCases: string[]
  dataVolume: 'lt100k' | '100k-1m' | '1m-10m' | 'gt10m'
  integrations: string[]
  compliance: string[]
  backupRequirement: boolean
  budget: 'lean' | 'balanced' | 'premium'
  growth: 'flat' | 'moderate' | 'aggressive'
}

export const DEFAULT_ANSWERS: AdvisorAnswers = {
  companySize: '25-100',
  industry: 'tech',
  salesSeats: 10,
  serviceSeats: 5,
  marketingSeats: 2,
  opsSeats: 2,
  readOnlySeats: 5,
  partnerUsers: 'none',
  useCases: [],
  dataVolume: 'lt100k',
  integrations: [],
  compliance: [],
  backupRequirement: false,
  budget: 'balanced',
  growth: 'moderate',
}

export const USE_CASES = [
  { key: 'pipeline', label: 'Lead & opportunity management' },
  { key: 'forecasting', label: 'Forecasting & territories' },
  { key: 'quoting', label: 'Quoting / CPQ' },
  { key: 'cases', label: 'Case management & support' },
  { key: 'knowledge', label: 'Knowledge base' },
  { key: 'field-service', label: 'Field service / on-site work' },
  { key: 'email-marketing', label: 'Email marketing & journeys' },
  { key: 'custom-apps', label: 'Custom apps & objects' },
  { key: 'analytics', label: 'Advanced analytics & dashboards' },
  { key: 'approvals', label: 'Approvals & complex automation' },
] as const

export const INTEGRATIONS = [
  { key: 'erp', label: 'ERP / accounting (NetSuite, SAP, QuickBooks…)' },
  { key: 'dwh', label: 'Data warehouse (Snowflake, BigQuery…)' },
  { key: 'esign', label: 'E-signature' },
  { key: 'telephony', label: 'Telephony / call center' },
  { key: 'marketing-tools', label: 'Existing marketing tools' },
  { key: 'sso', label: 'Single sign-on (Okta, Entra ID…)' },
  { key: 'custom-api', label: 'Custom apps calling the API' },
] as const

export const COMPLIANCE_OPTIONS = [
  { key: 'hipaa', label: 'HIPAA' },
  { key: 'sox', label: 'SOX' },
  { key: 'gdpr', label: 'GDPR' },
  { key: 'pci', label: 'PCI DSS' },
  { key: 'soc2', label: 'SOC 2 (we are audited)' },
] as const

// ---------------------------------------------------------------- output

export interface LicenseLine {
  persona: string
  product: string
  seats: number
  unitMonthly: number // USD per user per month (0 = org-level line)
  annual: number // USD per year for the line
  note?: string
}

export interface AddOn {
  name: string
  why: string
  estimate: string
}

export interface PackageRec {
  name: string
  category: string
  why: string
}

export interface Recommendation {
  edition: 'Starter Suite' | 'Professional' | 'Enterprise' | 'Unlimited'
  editionRationale: string[]
  perSeat: number
  licenses: LicenseLine[]
  addOns: AddOn[]
  packages: PackageRec[]
  guardrails: string[]
  annualTotal: number
  totalSeats: number
  caveats: string[]
}

// List prices (USD / user / month) per core edition.
const EDITION_SEAT_PRICE: Record<Recommendation['edition'], number> = {
  'Starter Suite': 25,
  Professional: 80,
  Enterprise: 165,
  Unlimited: 330,
}

const PLATFORM_STARTER = 25 // light license for ops / read-only personas
const MCAE_GROWTH_MONTHLY = 1250 // Marketing Cloud Account Engagement, org-level
const PARTNER_LOGIN_EST = 10 // Experience Cloud, per login est.

// ---------------------------------------------------------------- engine

export function recommend(a: AdvisorAnswers): Recommendation {
  const totalSeats =
    a.salesSeats + a.serviceSeats + a.marketingSeats + a.opsSeats + a.readOnlySeats
  const has = (k: string) => a.useCases.includes(k)
  const integ = (k: string) => a.integrations.includes(k)
  const regulated = a.compliance.length > 0
  const bigData = a.dataVolume === '1m-10m' || a.dataVolume === 'gt10m'

  // ---- Edition -----------------------------------------------------
  // Each trigger is a concrete reason Professional won't be enough.
  const enterpriseTriggers: string[] = []
  if (integ('custom-api') || integ('erp') || integ('dwh'))
    enterpriseTriggers.push('API-based integrations need Enterprise-level API access')
  if (has('approvals') || has('custom-apps'))
    enterpriseTriggers.push('Complex automation and custom apps outgrow Professional limits')
  if (has('forecasting'))
    enterpriseTriggers.push('Territory management and advanced forecasting are Enterprise features')
  if (regulated)
    enterpriseTriggers.push('Compliance work needs Enterprise audit + security surface')
  if (totalSeats > 50)
    enterpriseTriggers.push(`${totalSeats} seats is past the point where Professional stays manageable`)
  if (a.partnerUsers !== 'none')
    enterpriseTriggers.push('Partner access (Experience Cloud) pairs with Enterprise')
  if (bigData)
    enterpriseTriggers.push('Data volumes in the millions need Enterprise storage & API headroom')

  let edition: Recommendation['edition']
  let editionRationale: string[]

  if (totalSeats <= 10 && enterpriseTriggers.length === 0) {
    edition = 'Starter Suite'
    editionRationale = [
      'Ten or fewer users with straightforward CRM needs — start light',
      'Upgrade path to Professional/Enterprise preserves your data',
    ]
  } else if (
    totalSeats >= 1000 ||
    (a.budget === 'premium' && totalSeats >= 500) ||
    (a.growth === 'aggressive' && totalSeats >= 500)
  ) {
    edition = 'Unlimited'
    editionRationale = [
      'At this scale Unlimited\'s bundled support, full sandbox, and higher limits beat buying them piecemeal',
      ...enterpriseTriggers.slice(0, 2),
    ]
  } else if (enterpriseTriggers.length <= 1 && totalSeats <= 50 && a.budget === 'lean') {
    edition = 'Professional'
    editionRationale = [
      'Under 50 seats with modest integration needs — Professional covers it',
      'Half the per-seat cost of Enterprise; revisit at your first API-heavy integration',
    ]
  } else {
    edition = 'Enterprise'
    editionRationale =
      enterpriseTriggers.length > 0
        ? enterpriseTriggers.slice(0, 4)
        : ['The consulting default: room to grow without Unlimited pricing']
  }

  const perSeat = EDITION_SEAT_PRICE[edition]

  // ---- License mix ---------------------------------------------------
  const licenses: LicenseLine[] = []
  if (a.salesSeats > 0)
    licenses.push({
      persona: 'Sales team',
      product: `Sales Cloud ${edition}`,
      seats: a.salesSeats,
      unitMonthly: perSeat,
      annual: a.salesSeats * perSeat * 12,
    })
  if (a.serviceSeats > 0)
    licenses.push({
      persona: 'Service / support team',
      product: `Service Cloud ${edition}`,
      seats: a.serviceSeats,
      unitMonthly: perSeat,
      annual: a.serviceSeats * perSeat * 12,
    })
  if (a.marketingSeats > 0)
    licenses.push({
      persona: 'Marketing team',
      product: `Sales Cloud ${edition}`,
      seats: a.marketingSeats,
      unitMonthly: perSeat,
      annual: a.marketingSeats * perSeat * 12,
      note: 'Core seats; campaign tooling below if selected',
    })
  if (a.opsSeats > 0)
    licenses.push({
      persona: 'Ops / internal apps',
      product: 'Platform Starter',
      seats: a.opsSeats,
      unitMonthly: PLATFORM_STARTER,
      annual: a.opsSeats * PLATFORM_STARTER * 12,
      note: 'Custom objects + standard app access at a fraction of a full seat',
    })
  if (a.readOnlySeats > 0)
    licenses.push({
      persona: 'Execs / read-mostly',
      product: 'Platform Starter',
      seats: a.readOnlySeats,
      unitMonthly: PLATFORM_STARTER,
      annual: a.readOnlySeats * PLATFORM_STARTER * 12,
      note: 'Dashboards + records without paying full-seat prices — the #1 overspend Newton finds in existing orgs',
    })
  if (has('email-marketing'))
    licenses.push({
      persona: 'Marketing automation',
      product: 'Marketing Cloud Account Engagement (Growth)',
      seats: 1,
      unitMonthly: 0,
      annual: MCAE_GROWTH_MONTHLY * 12,
      note: 'Org-level subscription, up to 10K contacts',
    })
  if (a.partnerUsers !== 'none') {
    const logins = a.partnerUsers === 'lt100' ? 100 : a.partnerUsers === '100-1000' ? 500 : 1500
    licenses.push({
      persona: 'Partners / external',
      product: 'Experience Cloud (partner logins)',
      seats: logins,
      unitMonthly: PARTNER_LOGIN_EST,
      annual: logins * PARTNER_LOGIN_EST * 12,
      note: 'Login-based estimate — member-based pricing may fit better; size in discovery',
    })
  }

  // ---- Add-ons -------------------------------------------------------
  const addOns: AddOn[] = []
  if (a.compliance.some((c) => ['hipaa', 'pci', 'sox'].includes(c)))
    addOns.push({
      name: 'Salesforce Shield',
      why: `${a.compliance.join(', ').toUpperCase()} work needs platform encryption, field audit trail, and event monitoring`,
      estimate: '~30% of net license spend',
    })
  if (has('quoting'))
    addOns.push({
      name: 'Revenue Cloud / CPQ',
      why: 'Structured quoting with approval rules beats formula-field pricing from day one',
      estimate: '+$75/user/mo on quoting seats',
    })
  if (has('field-service'))
    addOns.push({
      name: 'Field Service',
      why: 'Scheduling, dispatch, and mobile work orders for on-site teams',
      estimate: '+$50–165/user/mo by tier',
    })
  if (has('analytics'))
    addOns.push({
      name: 'CRM Analytics',
      why: 'Past-dashboard analytics (AI insights, datasets) for the analytics-heavy roles only',
      estimate: '+$140/user/mo on analyst seats',
    })
  if (a.backupRequirement)
    addOns.push({
      name: 'Salesforce Backup & Recover',
      why: 'A formal backup/DR requirement is cheaper to meet natively than to retrofit',
      estimate: 'Quoted by org size',
    })
  if (edition === 'Enterprise')
    addOns.push({
      name: 'Full sandbox',
      why: 'One full-copy sandbox for UAT before go-live pays for itself at the first bad deploy avoided',
      estimate: '~30% of net license spend (partial sandbox included free)',
    })

  // ---- AppExchange packages -------------------------------------------
  const packages: PackageRec[] = []
  if (integ('esign'))
    packages.push({ name: 'DocuSign eSignature (or Adobe Sign)', category: 'E-signature', why: 'Native quote/contract signing from the record' })
  if (integ('telephony'))
    packages.push({ name: 'CTI connector (Amazon Connect / Genesys / Aircall)', category: 'Telephony', why: 'Click-to-dial + call logging on Contact/Case' })
  if (integ('erp'))
    packages.push({ name: 'ERP connector (Breadwinner / Workato / MuleSoft)', category: 'ERP sync', why: 'Two-way invoice & order visibility without swivel-chairing' })
  if (integ('dwh'))
    packages.push({ name: 'Warehouse sync (Fivetran / CData)', category: 'Data', why: 'Feed Salesforce data to your warehouse without hand-built ETL' })
  if (bigData)
    packages.push({ name: 'Cloudingo (or DemandTools)', category: 'Data quality', why: 'Dedupe at million-row scale before bad data compounds' })
  packages.push({
    name: 'Salesforce Optimizer (free)',
    category: 'Hygiene',
    why: 'Run quarterly from day one — the habit that prevents the sprawl Newton finds in mature orgs',
  })

  // ---- Org-design guardrails ------------------------------------------
  const guardrails = [
    'Permission-set-led access from day one — profiles stay minimal; every grant is a named, revocable permission set',
    'Keep the role hierarchy under ~7 levels; model teams, not the org chart',
    'One dedicated integration user per connected system, scoped to exactly the objects it touches',
    'Naming conventions before object #1: prefix custom objects/fields by team, describe automations by trigger + outcome',
    a.salesSeats > 10
      ? 'Start Opportunity org-wide default at Private and open up with sharing rules — the reverse migration is painful'
      : 'Keep org-wide defaults simple until you have multiple teams',
    'Turn on Setup Audit Trail review + login IP ranges in week one' +
      (regulated ? ' — your auditors will ask' : ''),
    'Stand up duplicate rules on Account/Contact/Lead before the first data import',
  ]

  // ---- Totals ---------------------------------------------------------
  const annualTotal = licenses.reduce((s, l) => s + l.annual, 0)

  const caveats = [
    'All figures are Salesforce LIST prices — enterprise agreements typically land 15–30% below list. Never sign at list.',
    'Add-on estimates are directional; they are quoted against your negotiated (net) spend, not list.',
    'Seat counts assume named users; revisit personas quarterly — right-sizing is cheaper before renewal than after.',
  ]

  return {
    edition,
    editionRationale,
    perSeat,
    licenses,
    addOns,
    packages,
    guardrails,
    annualTotal,
    totalSeats,
    caveats,
  }
}

export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
