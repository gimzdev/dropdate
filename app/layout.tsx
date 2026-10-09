import '@fontsource-variable/mona-sans/standard.css'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Notice } from '@/components/account'
import { ACCOUNTS, SITE } from '@/lib/core'

const title = 'Dropdate | Game release and esports calendar'
const description = 'Every upcoming game release and esports tournament in one calendar, refreshed every hour. Search in plain English, save what you want to play and add it to your own calendar.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: title, template: '%s | Dropdate' },
  description,
  applicationName: 'Dropdate',
  keywords: ['game release calendar', 'game release dates', 'upcoming games', 'esports schedule', 'esports tournaments'],
  openGraph: { type: 'website', siteName: 'Dropdate', title, description: 'Every game release and esports tournament in one calendar, refreshed every hour.' },
  twitter: { card: 'summary_large_image' },
}

/** Before the first paint: a browser that signed in earlier is marked, so the header never flashes the wrong button. Storage can be blocked, hence the try. */
const SIGNED = "try{if(localStorage.getItem('dropdate:session')==='1')document.documentElement.setAttribute('data-signed','')}catch(e){}"

export const viewport: Viewport = { themeColor: '#000000', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://media.rawg.io" />
        <link rel="preconnect" href="https://shared.akamai.steamstatic.com" />
        {ACCOUNTS && <script dangerouslySetInnerHTML={{ __html: SIGNED }} />}
      </head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        {children}
        {ACCOUNTS && <Notice />}
      </body>
    </html>
  )
}
