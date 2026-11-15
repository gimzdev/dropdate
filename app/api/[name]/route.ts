import { type NextRequest, NextResponse } from 'next/server'
import { PLATFORMS, genreName, ics } from '@/lib/core'
import { getEvents, searchGames } from '@/lib/data'
import { allow, clientIp } from '@/lib/db'
import { search } from '@/lib/search'

// What the site's own pages call: /api/search (the search boxes), /api/shots (the home page's cards) and /api/calendar.ics (the calendar
// feeds people subscribe to). There is no public API: no CORS headers, and robots.txt keeps crawlers out.
export const dynamic = 'force-dynamic'

const json = (body: unknown, cache = 'public, s-maxage=3600') => NextResponse.json(body, { headers: { 'Cache-Control': cache } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const sp = req.nextUrl.searchParams, name = (await params).name
  // Title search across every game the sources know; their allowance is shared, so one network may make this many a minute
  if (name === 'search') {
    if (!(await allow(`search:${clientIp(req)}`, 40, 60))) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })
    return json({ data: await searchGames(sp.get('q') ?? '').catch(() => []) })
  }
  if (name !== 'calendar.ics' && name !== 'shots') return NextResponse.json({ error: 'not found' }, { status: 404 })
  const data = await getEvents()
  // Every calendar game's screenshots by id: the home page leaves them out and its cards fetch them once, on the first hover
  if (name === 'shots') return json(Object.fromEntries(data.events.flatMap((e) => (e.shots?.length ? [[e.id, e.shots]] : []))), 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  if (data.error) return new NextResponse('Calendar temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } })
  const ids = sp.get('ids')?.split(',').filter(Boolean), type = sp.get('type'), q = sp.get('q') ?? '', asked = sp.get('genre') ?? undefined
  const genre = asked && genreName(asked) // a feed subscribed with Steam's word for a genre ("Simulation") keeps its games
  const platform = PLATFORMS.find((p) => p.toLowerCase() === sp.get('platform')?.toLowerCase())
  const list = ids ? data.events.filter((e) => ids.includes(e.id)) : search(data.events, q, data.today, {
    kind: type === 'release' || type === 'tournament' ? type : 'all', platform, genre, past: sp.get('past') === 'true',
  }).list
  // The feeds the pages offer are named after what they hold, so several can be told apart in a calendar app: one game (its page),
  // one platform's releases (app/releases), one esports game's tournaments (app/esports). Any other feed is "Dropdate".
  const called = ids ? (ids.length === 1 && list.length === 1 ? `Dropdate: ${list[0].title}` : undefined)
    : q ? undefined : type === 'tournament' && genre ? `Dropdate: ${genre.replace(/\s+/g, ' ').trim().slice(0, 60)} esports` : type === 'release' && platform && !genre ? `Dropdate: ${platform} releases` : undefined
  return new NextResponse(ics(list.slice(0, 500), data.updated, called), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="dropdate.ics"', 'Cache-Control': 'public, s-maxage=3600' } })
}
