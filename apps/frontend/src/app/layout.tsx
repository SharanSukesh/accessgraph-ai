import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
// Grove Refined treatment layer (cards, rails, scrollbars, motion
// keyframes) — originated in the /v2 prototype, now applied app-wide.
// Class-based and namespaced (v2-*), so importing globally is safe.
import './v2/v2.css'
import { Providers } from './providers'
import { AppLayout } from '@/components/layout/AppLayout'
import { AnimatedBackground } from '@/components/shared/AnimatedBackground'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Newton - Enterprise Access Intelligence',
  description: 'Visualize, analyze, and secure your enterprise access landscape',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <AnimatedBackground />
          <AppLayout>
            {children}
          </AppLayout>
        </Providers>
      </body>
    </html>
  )
}
