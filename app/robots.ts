import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'

// Crawlers that read every page again and again for their own indexes (SEO backlink tools, Exa's AI search) and that do honour
// robots.txt: kept out entirely, search engines unaffected (Ahrefs and SE Ranking alone made 6,000 requests in one day of November
// 2026). What ignores this file meets the Vercel firewall instead (AI bots, Chinese cloud networks, bot protection, a check for China).
const KEPT_OUT = ['SERankingBacklinksBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'DataForSeoBot', 'BLEXBot', 'Barkrowler', 'ExaBot', 'ExaSearchBot']

// "/browse?" keeps crawlers off the thousands of filtered browse pages (the plain one stays open)
export default (): MetadataRoute.Robots => ({
  rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/profile', '/signin', '/tell/', '/browse?'] }, { userAgent: KEPT_OUT, disallow: '/' }],
  sitemap: `${SITE}/sitemap.xml`,
})
