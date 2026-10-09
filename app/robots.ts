import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profile', '/signin'] }, sitemap: `${SITE}/sitemap.xml` }
}
