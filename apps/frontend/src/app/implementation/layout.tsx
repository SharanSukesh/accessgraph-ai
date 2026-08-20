/**
 * New Implementation workspace layout — its own slim shell (AppLayout
 * bypasses /implementation). Only planning surfaces live here; the
 * org-scoped chrome never renders in this tree.
 */

import { ImplementationShell } from '@/components/advisor/ImplementationShell'

export const metadata = {
  title: 'Newton — New Implementation',
}

export default function ImplementationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ImplementationShell>{children}</ImplementationShell>
}
