/**
 * v2 layout — parallel UI-rebuild tree.
 *
 * Everything under /v2 renders inside this layout: the Fraunces /
 * IBM Plex font stack (scoped via CSS variables on the wrapper, so v1
 * keeps Inter), the v2.css treatment layer, and the V2Shell chrome.
 * AppLayout (v1 chrome) explicitly bypasses /v2 paths.
 */

import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import { V2Shell } from '@/components/v2/Shell'
import './v2.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['opsz'],
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

export const metadata = {
  title: 'Newton v2 — Access Intelligence',
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`v2-root ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <V2Shell>{children}</V2Shell>
    </div>
  )
}
