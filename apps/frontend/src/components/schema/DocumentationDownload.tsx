/**
 * Download link for the org documentation workbook (roadmap item 11):
 * objects, fields, picklists, access matrices, assignments, record types,
 * layouts, record pages, flows and Apex, with who can reach each.
 */

import { FileSpreadsheet } from 'lucide-react'
import { endpoints } from '@/lib/api/endpoints'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function DocumentationDownload({ orgId }: { orgId: string }) {
  return (
    <a
      href={`${API_BASE}${endpoints.documentationXlsx(orgId)}`}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-grove-border dark:border-grove-border-dk text-grove-ink dark:text-grove-ink-dk hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
      title="Objects, fields, picklists, validation rules, access matrices, tabs, assignments, login restrictions, record types, layouts and the fields on them, record pages, apps, flows with their elements and fields, approval processes and steps, Apex, Visualforce, components, custom permissions and external data sources, with who can reach each, as an Excel workbook"
    >
      <FileSpreadsheet className="h-4 w-4" aria-hidden />
      Org documentation
    </a>
  )
}
