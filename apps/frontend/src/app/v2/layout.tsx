/**
 * v2 layout — parallel UI-rebuild tree.
 *
 * Everything under /v2 renders inside this layout: the v2.css
 * treatment layer and the V2Shell chrome. Typography matches v1
 * (Inter body from the root layout; Grove serif stack for display +
 * numerals via v2.css). AppLayout (v1 chrome) bypasses /v2 paths, and
 * the shell is translucent so the global AnimatedBackground node
 * canvas shows through.
 */

import { V2Shell } from '@/components/v2/Shell'
import './v2.css'

export const metadata = {
  title: 'Newton v2 — Access Intelligence',
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-root">
      <V2Shell>{children}</V2Shell>
    </div>
  )
}
