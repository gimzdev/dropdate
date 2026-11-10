'use client'
import { Analytics } from '@vercel/analytics/next'

// Page views from automated browsers stay out of the numbers: headless Chrome driven by Puppeteer, Playwright or Selenium sets
// navigator.webdriver (or names itself in its user agent), which no person's browser does. Most bots meet the firewall first.
const NAMED = /HeadlessChrome|PhantomJS|Lightpanda/i
const automated = () => typeof navigator !== 'undefined' && (navigator.webdriver === true || NAMED.test(navigator.userAgent))

export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => (automated() ? null : event)} />
}
