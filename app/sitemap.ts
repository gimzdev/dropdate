import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const dynamic = 'force-dynamic' // built on request from the cached data, never at build time

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { events } = await getEvents()
  return [
    { url: SITE, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE}/docs`, changeFrequency: 'monthly', priority: 0.4 },
    ...events.filter((e) => e.slug).map((e) => ({ url: `${SITE}/game/${e.slug}`, changeFrequency: 'daily' as const, priority: 0.7 })),
  ]
}
