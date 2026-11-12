import type { MetadataRoute } from 'next'
import { PLATFORMS, SITE, esportsPath, monthPath, platformPath } from '@/lib/core'
import { esportsGames, getEvents, releaseMonths } from '@/lib/data'

export const dynamic = 'force-dynamic' // made on request from the cached data, never at build time

type Often = 'hourly' | 'daily' | 'weekly'

// lastModified is the data's own date: when the calendar was last read from its sources (a month before the calendar has none)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ events, updated, error }, months, sports] = await Promise.all([getEvents(), releaseMonths().catch(() => []), esportsGames().catch(() => null)])
  const at = error ? undefined : updated, games = sports ? [...sports.games.values()] : []
  const page = (path: string, changeFrequency: Often, priority: number, dated = true) => ({ url: `${SITE}${path}`, changeFrequency, priority, ...(dated && at && { lastModified: at }) })
  return [
    page('', 'hourly', 1),
    page('/browse', 'weekly', 0.5, false),
    page('/releases', 'daily', 0.6),
    ...PLATFORMS.map((p) => page(platformPath(p), 'daily', 0.6)),
    ...months.filter((m) => m.count === undefined || m.count >= 5).map((m) => (m.count === undefined ? page(monthPath(m.month), 'weekly', 0.5, false) : page(monthPath(m.month), 'daily', 0.6))),
    ...(games.length ? [page('/esports', 'daily', 0.5)] : []),
    ...games.filter((g) => g.ahead.length).map((g) => page(esportsPath(g.name), 'daily', 0.5)),
    ...events.filter((e) => e.slug).map((e) => page(`/game/${e.slug}`, 'daily', 0.7, false)),
  ]
}
