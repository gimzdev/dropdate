import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { SITE } from '@/lib/core'

const title = 'Dropdate | Gaming Calendar'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: title, template: '%s | Dropdate' },
  description: 'Every upcoming game release and esports tournament in one calendar. Live data, refreshed hourly. Search in plain English, subscribe in your calendar app.',
  keywords: ['gaming calendar', 'game releases', 'upcoming games', 'esports schedule', 'release dates'],
  openGraph: { type: 'website', siteName: 'Dropdate', title, description: 'Every upcoming game release and tournament, refreshed hourly.' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = { themeColor: '#0a0a0a' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://media.rawg.io" />
        <link rel="preconnect" href="https://shared.akamai.steamstatic.com" />
      </head>
      <body>{children}</body>
    </html>
  )
}
