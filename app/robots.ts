import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'

export default function robots(): MetadataRoute.Robots {
  // "/browse?" keeps crawlers off the filtered pages of the browse page (the plain one stays open): thousands of variations nobody needs indexed
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profile', '/signin', '/browse?'] }, sitemap: `${SITE}/sitemap.xml` }
}
