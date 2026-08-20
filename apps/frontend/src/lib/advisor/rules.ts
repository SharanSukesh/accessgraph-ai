/**
 * New Implementation Advisor — recommendation rule engine (v1.1).
 *
 * Pure functions: questionnaire answers in, recommendation out. Every
 * rule is a transparent, defensible if-this-then-that a consultant can
 * read aloud to a client — no scoring black box.
 *
 * v1.1 upgrades over v1:
 *  - Full tier ladder: Starter Suite → Pro Suite → Enterprise →
 *    Unlimited → Agentforce 1 (the "elite" AI tier), each with
 *    concrete discriminating triggers.
 *  - Explicit per-cloud verdicts (Sales, Service, Field Service,
 *    Marketing B2B/B2C, Commerce, Experience, Revenue/CPQ, Data
 *    Cloud, Analytics, industry clouds) with drivers.
 *
 * Prices are Salesforce LIST prices (USD, per user per month unless
 * noted); real contracts negotiate down — the results page says so.
 */

// ---------------------------------------------------------------- answers

export interface AdvisorAnswers {
  companySize: 'lt25' | '25-100' | '100-500' | '500-2000' | 'gt2000'
  industry:
    | 'tech' | 'finserv' | 'healthcare' | 'manufacturing'
    | 'retail' | 'services' | 'nonprofit' | 'other'
  audience: 'b2b' | 'b2c' | 'both'
  // Seats by persona
  salesSeats: number
  serviceSeats: number
  fieldTechs: number
  marketingSeats: number
  opsSeats: number
  readOnlySeats: number
  partnerUsers: 'none' | 'lt100' | '100-1000' | 'gt1000'
  customerPortal: boolean
  // Needs by domain
  salesNeeds: string[]
  serviceNeeds: string[]
  marketingNeeds: string[]
  commerceNeeds: string[]
  platformNeeds: string[]
  // Data & systems
  dataVolume: 'lt100k' | '100k-1m' | '1m-10m' | 'gt10m'
  integrations: string[]
  // Governance
  compliance: string[]
  backupRequirement: boolean
  fullSandbox: boolean
  supportLevel: 'standard' | 'premier'
  // Posture
  budget: 'lean' | 'balanced' | 'premium'
  growth: 'flat' | 'moderate' | 'aggressive'
}

export const DEFAULT_ANSWERS: AdvisorAnswers = {
  companySize: '25-100',
  industry: 'tech',
  audience: 'b2b',
  salesSeats: 10,
  serviceSeats: 5,
  fieldTechs: 0,
  marketingSeats: 2,
  opsSeats: 2,
  readOnlySeats: 5,
  partnerUsers: 'none',
  customerPortal: false,
  salesNeeds: [],
  serviceNeeds: [],
  marketingNeeds: [],
  commerceNeeds: [],
  platformNeeds: [],
  dataVolume: 'lt100k',
  integrations: [],
  compliance: [],
  backupRequirement: false,
  fullSandbox: false,
  supportLevel: 'standard',
  budget: 'balanced',
  growth: 'moderate',
}

// Question banks — each chip is a tier or cloud discriminator, noted
// in the comment beside it.

export const SALES_NEEDS = [
  { key: 'pipeline', label: 'Lead & opportunity management' }, // Sales Cloud baseline
  { key: 'forecasting', label: 'Collaborative forecasting' }, // Pro Suite+
  { key: 'territories', label: 'Territory management' }, // Enterprise+
  { key: 'quoting', label: 'Quotes & CPQ' }, // Revenue Cloud
  { key: 'billing', label: 'Billing & subscriptions' }, // Revenue Cloud
  { key: 'rev-intel', label: 'Revenue intelligence / pipeline AI' }, // Unlimited+/Agentforce
] as const

export const SERVICE_NEEDS = [
  { key: 'cases', label: 'Case management' }, // Service Cloud baseline
  { key: 'omni-phone', label: 'Phone / call center' },
  { key: 'omni-chat', label: 'Live chat & messaging' }, // omni-channel → Enterprise+
  { key: 'self-service', label: 'Customer self-service portal' }, // Experience Cloud
  { key: 'knowledge', label: 'Knowledge base' },
  { key: 'slas', label: 'SLAs & entitlements' }, // Enterprise+
  { key: 'field-service', label: 'On-site / field service' }, // Field Service
] as const

export const MARKETING_NEEDS = [
  { key: 'b2b-nurture', label: 'B2B lead nurture & scoring' }, // MC Account Engagement
  { key: 'b2c-journeys', label: 'B2C journeys at scale (email/SMS/push)' }, // MC Engagement
  { key: 'personalization', label: 'Web & ad personalization' }, // Data Cloud / MC Personalization
] as const

export const COMMERCE_NEEDS = [
  { key: 'b2c-store', label: 'B2C online store' },
  { key: 'b2b-store', label: 'B2B ordering / reorder portal' },
] as const

export const PLATFORM_NEEDS = [
  { key: 'custom-apps', label: 'Custom apps & objects' }, // Enterprise+
  { key: 'pro-code', label: 'Custom code (Apex / LWC) & CI/CD' }, // Enterprise+
  { key: 'ai-copilot', label: 'AI assistant / agents (Agentforce)' }, // Agentforce 1
  { key: 'predictive', label: 'Predictive scoring & Einstein AI' }, // Unlimited+/Agentforce
  { key: 'data-cloud', label: 'Unify customer data across systems (Data Cloud)' }, // Agentforce 1
  { key: 'slack', label: 'Deep Slack integration' }, // bundled in Agentforce 1
  { key: 'analytics', label: 'Advanced analytics (CRM Analytics / Tableau)' },
  { key: 'approvals', label: 'Approvals & complex automation' }, // Enterprise+
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

export type Tier =
  | 'Starter Suite'
  | 'Pro Suite'
  | 'Enterprise'
  | 'Unlimited'
  | 'Agentforce 1'

export interface LicenseLine {
  persona: string
  product: string
  seats: number
  unitMonthly: number // USD per user per month (0 = org-level / quoted line)
  annual: number
  note?: string
}

export interface CloudRec {
  cloud: string
  verdict: 'recommended' | 'consider' | 'not-needed'
  drivers: string[]
  pricing: string
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
  tier: Tier
  tierRationale: string[]
  tierLadder: { tier: Tier; verdict: string }[]
  perSeat: number
  clouds: CloudRec[]
  licenses: LicenseLine[]
  addOns: AddOn[]
  packages: PackageRec[]
  guardrails: string[]
  annualTotal: number
  totalSeats: number
  caveats: string[]
}

// List prices (USD / user / month) per core tier.
const TIER_PRICE: Record<Tier, number> = {
  'Starter Suite': 25,
  'Pro Suite': 100,
  Enterprise: 165,
  Unlimited: 330,
  'Agentforce 1': 500,
}

const PLATFORM_STARTER = 25
const FIELD_SERVICE_TECH = 165
const MCAE_GROWTH_MONTHLY = 1250 // MC Account Engagement (B2B), org-level
const MC_ENGAGEMENT_EST_MONTHLY = 1500 // MC Engagement (B2C), volume-quoted est.
const PARTNER_LOGIN_EST = 10

// ---------------------------------------------------------------- engine

export function recommend(a: AdvisorAnswers): Recommendation {
  const totalSeats =
    a.salesSeats + a.serviceSeats + a.fieldTechs + a.marketingSeats +
    a.opsSeats + a.readOnlySeats
  const sales = (k: string) => a.salesNeeds.includes(k)
  const service = (k: string) => a.serviceNeeds.includes(k)
  const marketing = (k: string) => a.marketingNeeds.includes(k)
  const commerce = (k: string) => a.commerceNeeds.includes(k)
  const platform = (k: string) => a.platformNeeds.includes(k)
  const integ = (k: string) => a.integrations.includes(k)
  const regulated = a.compliance.length > 0
  const bigData = a.dataVolume === '1m-10m' || a.dataVolume === 'gt10m'

  // ---- Tier ladder ---------------------------------------------------
  // Work bottom-up: what disqualifies each tier below the answer?

  const enterpriseTriggers: string[] = []
  if (integ('custom-api') || integ('erp') || integ('dwh'))
    enterpriseTriggers.push('API-based integrations (ERP, warehouse, custom apps) need Enterprise-level API access')
  if (platform('pro-code') || platform('custom-apps'))
    enterpriseTriggers.push('Custom code and custom apps need Enterprise sandboxes and limits')
  if (platform('approvals'))
    enterpriseTriggers.push('Complex approvals and flow automation outgrow Pro Suite')
  if (sales('territories'))
    enterpriseTriggers.push('Territory management is Enterprise-and-above')
  if (service('omni-chat') || service('slas'))
    enterpriseTriggers.push('Omni-channel routing and SLA entitlements need Enterprise Service Cloud')
  if (regulated)
    enterpriseTriggers.push('Compliance work needs the Enterprise audit + security surface (and usually Shield)')
  if (totalSeats > 50)
    enterpriseTriggers.push(`${totalSeats} seats is past the point where lighter editions stay manageable`)
  if (a.partnerUsers !== 'none' || a.customerPortal)
    enterpriseTriggers.push('External portals (Experience Cloud) pair with Enterprise')
  if (bigData)
    enterpriseTriggers.push('Data volumes in the millions need Enterprise storage & API headroom')

  const unlimitedTriggers: string[] = []
  if (a.supportLevel === 'premier')
    unlimitedTriggers.push('24/7 Premier support is bundled in Unlimited (bought separately it adds ~30% on lower tiers)')
  if (a.fullSandbox)
    unlimitedTriggers.push('A full-copy sandbox is included in Unlimited (a ~30% add-on below it)')
  if (platform('predictive') && !platform('ai-copilot'))
    unlimitedTriggers.push('Einstein predictive features are native at Unlimited')
  if (sales('rev-intel'))
    unlimitedTriggers.push('Revenue intelligence ships with the Unlimited/Agentforce tiers')
  if (totalSeats >= 250 && a.growth === 'aggressive')
    unlimitedTriggers.push('At this scale and growth rate, Unlimited\'s higher limits beat piecemeal add-ons')

  const eliteTriggers: string[] = []
  if (platform('ai-copilot'))
    eliteTriggers.push('AI assistant / Agentforce agents are the headline of the Agentforce 1 tier')
  if (platform('data-cloud'))
    eliteTriggers.push('Data Cloud is bundled in Agentforce 1 (consumption-priced separately below it)')
  if (platform('slack'))
    eliteTriggers.push('Slack is included in Agentforce 1')
  if (platform('predictive') && platform('data-cloud'))
    eliteTriggers.push('Predictive AI on unified data is exactly the Agentforce 1 bundle')

  let tier: Tier
  let tierRationale: string[]

  if (eliteTriggers.length >= 2 && a.budget !== 'lean') {
    tier = 'Agentforce 1'
    tierRationale = eliteTriggers.slice(0, 4)
  } else if (
    (unlimitedTriggers.length >= 2 && totalSeats >= 100) ||
    (unlimitedTriggers.length >= 1 && a.budget === 'premium' && totalSeats >= 100) ||
    totalSeats >= 1000
  ) {
    tier = 'Unlimited'
    tierRationale = [
      ...unlimitedTriggers.slice(0, 3),
      ...(totalSeats >= 1000 ? ['At 1,000+ seats the bundled support and limits pay for themselves'] : []),
    ]
  } else if (enterpriseTriggers.length > 0) {
    tier = 'Enterprise'
    tierRationale = enterpriseTriggers.slice(0, 4)
  } else if (
    totalSeats > 10 ||
    sales('forecasting') ||
    sales('quoting') ||
    integ('sso')
  ) {
    tier = 'Pro Suite'
    tierRationale = [
      'Past Starter\'s limits but no Enterprise trigger yet — Pro Suite adds forecasting, quoting basics, and API access at $100/seat',
      'Revisit at your first custom-code project or API-heavy integration',
    ]
  } else {
    tier = 'Starter Suite'
    tierRationale = [
      'Ten or fewer users with straightforward CRM needs — start light at $25/seat',
      'The upgrade path to Pro Suite / Enterprise preserves all your data',
    ]
  }

  // Why-not ladder — one line per tier so the client sees the whole map.
  const order: Tier[] = ['Starter Suite', 'Pro Suite', 'Enterprise', 'Unlimited', 'Agentforce 1']
  const chosenIdx = order.indexOf(tier)
  const tierLadder = order.map((t, i) => {
    if (i === chosenIdx) return { tier: t, verdict: 'Recommended — best fit for your answers' }
    if (i < chosenIdx) {
      const blocker =
        t === 'Starter Suite' ? (totalSeats > 10 ? 'Too small for your seat count' : enterpriseTriggers[0] ?? unlimitedTriggers[0] ?? 'Below your needs')
        : t === 'Pro Suite' ? (enterpriseTriggers[0] ?? unlimitedTriggers[0] ?? eliteTriggers[0] ?? 'Below your needs')
        : t === 'Enterprise' ? (unlimitedTriggers[0] ?? eliteTriggers[0] ?? 'Below your needs')
        : (eliteTriggers[0] ?? 'Below your needs')
      return { tier: t, verdict: `Undersized: ${blocker}` }
    }
    const skip =
      t === 'Pro Suite' ? 'Skipped — you need more than this tier offers'
      : t === 'Enterprise' ? 'Not needed yet — no Enterprise trigger in your answers'
      : t === 'Unlimited'
      ? unlimitedTriggers.length > 0
        ? `Worth pricing if: ${unlimitedTriggers[0]}`
        : 'Not needed — premier support / full sandbox / native Einstein didn\'t come up'
      : eliteTriggers.length > 0
      ? `Worth pricing if AI becomes a priority: ${eliteTriggers[0]}`
      : 'Not needed — no AI/Data Cloud/Slack requirements surfaced'
    return { tier: t, verdict: skip }
  })

  const perSeat = TIER_PRICE[tier]

  // ---- Cloud verdicts --------------------------------------------------
  const clouds: CloudRec[] = []

  const salesDrivers = SALES_NEEDS.filter((n) => sales(n.key)).map((n) => n.label)
  clouds.push({
    cloud: 'Sales Cloud',
    verdict: a.salesSeats > 0 || salesDrivers.length > 0 ? 'recommended' : 'not-needed',
    drivers: salesDrivers.length > 0 ? salesDrivers : a.salesSeats > 0 ? [`${a.salesSeats} sales seats`] : ['No sales team or pipeline needs'],
    pricing: `$${perSeat}/user/mo at ${tier}`,
  })

  const serviceDrivers = SERVICE_NEEDS.filter((n) => service(n.key) && n.key !== 'field-service').map((n) => n.label)
  clouds.push({
    cloud: 'Service Cloud',
    verdict: a.serviceSeats > 0 || serviceDrivers.length > 0 ? 'recommended' : 'not-needed',
    drivers: serviceDrivers.length > 0 ? serviceDrivers : a.serviceSeats > 0 ? [`${a.serviceSeats} service seats`] : ['No support team or case needs'],
    pricing: `$${perSeat}/user/mo at ${tier}`,
  })

  const wantsFieldService = a.fieldTechs > 0 || service('field-service')
  clouds.push({
    cloud: 'Field Service',
    verdict: wantsFieldService ? 'recommended' : 'not-needed',
    drivers: wantsFieldService
      ? [a.fieldTechs > 0 ? `${a.fieldTechs} field technicians` : 'On-site work selected', 'Scheduling, dispatch, mobile work orders']
      : ['No on-site/field work'],
    pricing: `~$${FIELD_SERVICE_TECH}/tech/mo + dispatcher seats`,
  })

  const b2bMkt = marketing('b2b-nurture')
  const b2cMkt = marketing('b2c-journeys')
  clouds.push({
    cloud: 'Marketing Cloud — Account Engagement (B2B)',
    verdict: b2bMkt ? 'recommended' : a.audience !== 'b2c' && a.marketingSeats > 0 ? 'consider' : 'not-needed',
    drivers: b2bMkt ? ['B2B nurture & lead scoring selected'] : ['Only if B2B nurture becomes a motion'],
    pricing: `From $${MCAE_GROWTH_MONTHLY.toLocaleString()}/mo (10K contacts, org-level)`,
  })
  clouds.push({
    cloud: 'Marketing Cloud — Engagement (B2C)',
    verdict: b2cMkt ? 'recommended' : a.audience !== 'b2b' && marketing('personalization') ? 'consider' : 'not-needed',
    drivers: b2cMkt ? ['High-volume B2C journeys (email/SMS/push) selected'] : ['Only for consumer-scale journey volume'],
    pricing: `From ~$${MC_ENGAGEMENT_EST_MONTHLY.toLocaleString()}/mo, volume-quoted`,
  })

  const wantsCommerce = a.commerceNeeds.length > 0
  clouds.push({
    cloud: 'Commerce Cloud',
    verdict: wantsCommerce ? 'recommended' : 'not-needed',
    drivers: wantsCommerce
      ? COMMERCE_NEEDS.filter((n) => commerce(n.key)).map((n) => n.label)
      : ['No online selling'],
    pricing: 'Percentage-of-GMV pricing — quoted',
  })

  const wantsExperience = a.customerPortal || a.partnerUsers !== 'none' || service('self-service')
  clouds.push({
    cloud: 'Experience Cloud (portals)',
    verdict: wantsExperience ? 'recommended' : 'not-needed',
    drivers: [
      ...(a.customerPortal || service('self-service') ? ['Customer self-service portal'] : []),
      ...(a.partnerUsers !== 'none' ? ['Partner access'] : []),
    ].length > 0
      ? [
          ...(a.customerPortal || service('self-service') ? ['Customer self-service portal'] : []),
          ...(a.partnerUsers !== 'none' ? ['Partner access'] : []),
        ]
      : ['No external users'],
    pricing: 'Login- or member-based; ~$2/login (customer), ~$10/login (partner)',
  })

  const wantsRevenue = sales('quoting') || sales('billing')
  clouds.push({
    cloud: 'Revenue Cloud (CPQ & Billing)',
    verdict: wantsRevenue ? 'recommended' : 'not-needed',
    drivers: wantsRevenue
      ? SALES_NEEDS.filter((n) => sales(n.key) && ['quoting', 'billing'].includes(n.key)).map((n) => n.label)
      : ['Formula-field pricing is fine for now'],
    pricing: '+$75/user/mo on quoting seats',
  })

  const wantsDataCloud = platform('data-cloud')
  clouds.push({
    cloud: 'Data Cloud',
    verdict: wantsDataCloud ? (tier === 'Agentforce 1' ? 'recommended' : 'consider') : platform('predictive') && bigData ? 'consider' : 'not-needed',
    drivers: wantsDataCloud
      ? ['Unifying customer data across systems', ...(tier === 'Agentforce 1' ? ['Bundled in Agentforce 1'] : ['Consumption-priced below Agentforce 1 — scope carefully'])]
      : ['Not needed until cross-system identity resolution matters'],
    pricing: tier === 'Agentforce 1' ? 'Included (usage credits) in Agentforce 1' : 'Consumption-based — scope in discovery',
  })

  clouds.push({
    cloud: 'CRM Analytics / Tableau',
    verdict: platform('analytics') ? 'consider' : 'not-needed',
    drivers: platform('analytics')
      ? ['Advanced analytics selected — buy for analyst seats only, not org-wide']
      : ['Standard dashboards cover most teams'],
    pricing: 'CRM Analytics $140/user/mo · Tableau Creator $75/user/mo',
  })

  // Industry clouds — flag as consider, never auto-recommend (they
  // replace core clouds, big decision).
  const industryCloud =
    a.industry === 'healthcare' ? 'Health Cloud'
    : a.industry === 'finserv' ? 'Financial Services Cloud'
    : a.industry === 'nonprofit' ? 'Nonprofit Cloud'
    : null
  if (industryCloud)
    clouds.push({
      cloud: industryCloud,
      verdict: 'consider',
      drivers: [
        `Purpose-built objects and workflows for ${a.industry === 'finserv' ? 'financial services' : a.industry}`,
        'Compare against building the same on core clouds before committing',
        ...(a.industry === 'nonprofit' ? ['Power of Us program: first 10 seats donated'] : []),
      ],
      pricing: 'Industry-cloud pricing — quoted (typically $225–350/user/mo)',
    })

  // ---- License mix -----------------------------------------------------
  const licenses: LicenseLine[] = []
  if (a.salesSeats > 0)
    licenses.push({
      persona: 'Sales team',
      product: `Sales Cloud ${tier}`,
      seats: a.salesSeats,
      unitMonthly: perSeat,
      annual: a.salesSeats * perSeat * 12,
    })
  if (a.serviceSeats > 0)
    licenses.push({
      persona: 'Service / support team',
      product: `Service Cloud ${tier}`,
      seats: a.serviceSeats,
      unitMonthly: perSeat,
      annual: a.serviceSeats * perSeat * 12,
    })
  if (wantsFieldService && a.fieldTechs > 0)
    licenses.push({
      persona: 'Field technicians',
      product: 'Field Service',
      seats: a.fieldTechs,
      unitMonthly: FIELD_SERVICE_TECH,
      annual: a.fieldTechs * FIELD_SERVICE_TECH * 12,
      note: 'Dispatchers need a Service Cloud + dispatcher license — size in discovery',
    })
  if (a.marketingSeats > 0)
    licenses.push({
      persona: 'Marketing team',
      product: `Sales Cloud ${tier}`,
      seats: a.marketingSeats,
      unitMonthly: perSeat,
      annual: a.marketingSeats * perSeat * 12,
      note: 'Core seats; campaign platform below if selected',
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
      note: 'Dashboards without full-seat prices — the #1 overspend Newton finds in existing orgs',
    })
  if (b2bMkt)
    licenses.push({
      persona: 'Marketing automation (B2B)',
      product: 'MC Account Engagement (Growth)',
      seats: 1,
      unitMonthly: 0,
      annual: MCAE_GROWTH_MONTHLY * 12,
      note: 'Org-level, up to 10K contacts',
    })
  if (b2cMkt)
    licenses.push({
      persona: 'Marketing journeys (B2C)',
      product: 'MC Engagement',
      seats: 1,
      unitMonthly: 0,
      annual: MC_ENGAGEMENT_EST_MONTHLY * 12,
      note: 'Volume-quoted estimate — contact/message volume decides real price',
    })
  if (a.partnerUsers !== 'none') {
    const logins = a.partnerUsers === 'lt100' ? 100 : a.partnerUsers === '100-1000' ? 500 : 1500
    licenses.push({
      persona: 'Partners / external',
      product: 'Experience Cloud (partner logins)',
      seats: logins,
      unitMonthly: PARTNER_LOGIN_EST,
      annual: logins * PARTNER_LOGIN_EST * 12,
      note: 'Login-based estimate — member-based pricing may fit better',
    })
  }

  // ---- Add-ons -------------------------------------------------------
  const addOns: AddOn[] = []
  if (a.compliance.some((c) => ['hipaa', 'pci', 'sox'].includes(c)))
    addOns.push({
      name: 'Salesforce Shield',
      why: `${a.compliance.filter((c) => ['hipaa', 'pci', 'sox'].includes(c)).join(', ').toUpperCase()} work needs platform encryption, field audit trail, and event monitoring`,
      estimate: '~30% of net license spend',
    })
  if (wantsRevenue)
    addOns.push({
      name: 'Revenue Cloud / CPQ',
      why: 'Structured quoting with approval rules beats formula-field pricing from day one',
      estimate: '+$75/user/mo on quoting seats',
    })
  if (platform('analytics'))
    addOns.push({
      name: 'CRM Analytics (or Tableau)',
      why: 'For the analytics-heavy roles only — most users live in standard dashboards',
      estimate: '$140/user/mo (CRMA) or $75 (Tableau Creator)',
    })
  if (a.backupRequirement)
    addOns.push({
      name: 'Salesforce Backup & Recover',
      why: 'A formal backup/DR requirement is cheaper to meet natively than to retrofit',
      estimate: 'Quoted by org size',
    })
  if (a.supportLevel === 'premier' && tier !== 'Unlimited' && tier !== 'Agentforce 1')
    addOns.push({
      name: 'Premier Success Plan',
      why: '24/7 support + faster response SLAs (bundled free at Unlimited and above)',
      estimate: '~30% of net license spend',
    })
  if (a.fullSandbox && tier !== 'Unlimited' && tier !== 'Agentforce 1')
    addOns.push({
      name: 'Full sandbox',
      why: 'Full-copy UAT environment (bundled free at Unlimited and above)',
      estimate: '~30% of net license spend',
    })
  if (platform('ai-copilot') && tier !== 'Agentforce 1')
    addOns.push({
      name: 'Agentforce / Einstein AI (à la carte)',
      why: 'You want AI features below the Agentforce 1 tier — priced per conversation/user instead',
      estimate: '$2/conversation or ~$50–75/user/mo by SKU',
    })

  // ---- AppExchange packages -------------------------------------------
  const packages: PackageRec[] = []
  if (integ('esign'))
    packages.push({ name: 'DocuSign eSignature (or Adobe Sign)', category: 'E-signature', why: 'Native quote/contract signing from the record' })
  if (integ('telephony') || service('omni-phone'))
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
    'Add-on and org-level estimates are directional; they are quoted against your negotiated (net) spend or usage volume.',
    'Seat counts assume named users; revisit personas quarterly — right-sizing is cheaper before renewal than after.',
    'Tier names follow Salesforce\'s current lineup (Starter/Pro Suite for SMB; Enterprise/Unlimited/Agentforce 1 for the full platform).',
  ]

  return {
    tier,
    tierRationale,
    tierLadder,
    perSeat,
    clouds,
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

// ---------------------------------------------------------------- roadmap

export interface RoadmapPhase {
  name: string
  timeframe: string
  goal: string
  items: string[]
}

/**
 * Phased go-live plan derived from the answers. Timeframes are
 * consulting-band estimates, not commitments — the workspace says so.
 */
export function buildRoadmap(a: AdvisorAnswers, rec: Recommendation): RoadmapPhase[] {
  const sales = (k: string) => a.salesNeeds.includes(k)
  const service = (k: string) => a.serviceNeeds.includes(k)
  const platform = (k: string) => a.platformNeeds.includes(k)
  const phases: RoadmapPhase[] = []

  phases.push({
    name: 'Phase 0 — Foundations',
    timeframe: 'Weeks 1–2',
    goal: 'The guardrails that are 10× harder to retrofit later.',
    items: [
      'Org setup: naming conventions, permission-set model, role skeleton',
      ...(a.integrations.includes('sso') ? ['SSO wired (Okta / Entra ID) before the first real login'] : []),
      'Sandbox strategy + deployment path (change sets or CI/CD)',
      'Setup Audit Trail review + login IP ranges',
      ...(a.compliance.length > 0 ? [`Compliance baseline for ${a.compliance.join(', ').toUpperCase()}: Shield scoping, field-audit plan`] : []),
      'Duplicate rules on Account / Contact / Lead before any data import',
    ],
  })

  const coreItems: string[] = []
  if (a.salesSeats > 0) coreItems.push('Sales Cloud: pipeline stages, lead routing, core reports' + (sales('forecasting') ? ', forecasting' : ''))
  if (a.serviceSeats > 0) coreItems.push('Service Cloud: case lifecycle, queues' + (service('knowledge') ? ', knowledge base' : '') + (service('slas') ? ', SLA entitlements' : ''))
  coreItems.push('Data migration: legacy CRM extract → dedupe → import with owner mapping')
  coreItems.push('Reports & dashboards for each team lead')
  coreItems.push('Team training + go-live cutover')
  phases.push({
    name: 'Phase 1 — Core CRM go-live',
    timeframe: rec.totalSeats <= 25 ? 'Weeks 3–6' : rec.totalSeats <= 100 ? 'Weeks 3–8' : 'Weeks 3–12',
    goal: 'Sales and service teams working fully in Salesforce.',
    items: coreItems,
  })

  const expansionItems: string[] = []
  if (a.marketingNeeds.length > 0) expansionItems.push('Marketing: ' + (a.marketingNeeds.includes('b2b-nurture') ? 'Account Engagement nurture + scoring' : 'Engagement journeys') + ', connected to lead flow')
  if (a.fieldTechs > 0 || service('field-service')) expansionItems.push('Field Service: territories, scheduling policies, mobile app rollout')
  if (a.customerPortal || service('self-service')) expansionItems.push('Experience Cloud: customer self-service portal (cases + knowledge)')
  if (a.partnerUsers !== 'none') expansionItems.push('Experience Cloud: partner portal with scoped sharing')
  if (a.commerceNeeds.length > 0) expansionItems.push('Commerce Cloud storefront build')
  if (sales('quoting') || sales('billing')) expansionItems.push('Revenue Cloud: CPQ rules, approval matrix' + (sales('billing') ? ', billing' : ''))
  if (a.integrations.includes('erp')) expansionItems.push('ERP integration live (two-way orders / invoices)')
  if (a.integrations.includes('dwh')) expansionItems.push('Warehouse sync feeding BI')
  if (expansionItems.length > 0)
    phases.push({
      name: 'Phase 2 — Expansion clouds',
      timeframe: 'Months 2–4',
      goal: 'The clouds beyond core CRM, sequenced by dependency.',
      items: expansionItems,
    })

  const maturityItems: string[] = []
  if (platform('ai-copilot')) maturityItems.push('Agentforce: first agent on the highest-volume workflow (usually case deflection)')
  if (platform('predictive')) maturityItems.push('Einstein scoring on leads/opportunities once 3+ months of data exists')
  if (platform('data-cloud')) maturityItems.push('Data Cloud identity resolution across systems')
  if (platform('analytics')) maturityItems.push('CRM Analytics / Tableau for the analyst group')
  maturityItems.push('Quarterly org-health review (Optimizer + Newton) — licenses, sprawl, access hygiene')
  phases.push({
    name: 'Phase 3 — Intelligence & upkeep',
    timeframe: 'Months 4+',
    goal: 'AI and analytics once real data exists; hygiene forever.',
    items: maturityItems,
  })

  return phases
}

/** Total implementation-duration band for the header. */
export function estimateTimeline(a: AdvisorAnswers, rec: Recommendation): string {
  let weeks = rec.totalSeats <= 25 ? 6 : rec.totalSeats <= 100 ? 8 : rec.totalSeats <= 500 ? 14 : 20
  const extraClouds =
    (a.marketingNeeds.length > 0 ? 1 : 0) +
    (a.commerceNeeds.length > 0 ? 1 : 0) +
    (a.customerPortal || a.partnerUsers !== 'none' ? 1 : 0) +
    (a.fieldTechs > 0 ? 1 : 0)
  weeks += extraClouds * 3
  if (a.compliance.length > 0) weeks += 2
  const lo = weeks
  const hi = Math.round(weeks * 1.5)
  return `${lo}–${hi} weeks`
}

// ---------------------------------------------------------------- benefits

export interface Benefit {
  title: string
  detail: string
}

/** "Why Salesforce" story, personalized from the answers. */
export function buildBenefits(a: AdvisorAnswers, rec: Recommendation): Benefit[] {
  const out: Benefit[] = [
    {
      title: 'One customer record, every team',
      detail:
        'Sales, service, and marketing work the same Account/Contact spine — the hand-off gaps between teams (and the spreadsheets that fill them) disappear.',
    },
    {
      title: 'No infrastructure to run',
      detail:
        'Three platform releases a year, uptime SLAs, and security patching are Salesforce\'s problem, not your IT team\'s.',
    },
    {
      title: 'The AppExchange escape hatch',
      detail:
        'Thousands of vetted add-ons mean "we need X" is usually an install, not a build — your integration list here maps to mature connectors.',
    },
  ]
  if (a.growth !== 'flat')
    out.push({
      title: 'Scales without re-platforming',
      detail: `Your ${a.growth} growth plan means seat counts and data volumes will move — the ${rec.tier} tier absorbs that with license adds, not migrations.`,
    })
  if (a.compliance.length > 0)
    out.push({
      title: 'Compliance posture out of the box',
      detail: `${a.compliance.join(', ').toUpperCase()} programs lean on platform certifications (SOC 1/2, ISO 27001) plus Shield's encryption and field-history — evidence your auditors already know how to read.`,
    })
  if (a.platformNeeds.includes('ai-copilot') || a.platformNeeds.includes('predictive'))
    out.push({
      title: 'AI on your data, not beside it',
      detail:
        'Einstein and Agentforce run inside the trust boundary against your CRM data — no export pipelines to an external AI tool.',
    })
  out.push({
    title: 'Hiring is easy',
    detail:
      'The admin/developer talent pool is the largest of any CRM — you will never be hostage to one consultancy (including ours).',
    })
  return out
}
