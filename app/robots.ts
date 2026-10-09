import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'

export default function robots(): MetadataRoute.Robots {
  // "/browse?" keeps crawlers off the thousands of filtered browse pages (the plain one stays open)
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profile', '/signin', '/browse?'] }, sitemap: `${SITE}/sitemap.xml` }
}
