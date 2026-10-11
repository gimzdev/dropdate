import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'

// "/browse?" keeps crawlers off the thousands of filtered browse pages (the plain one stays open)
export default (): MetadataRoute.Robots => ({ rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/profile', '/signin', '/browse?'] }, sitemap: `${SITE}/sitemap.xml` })
