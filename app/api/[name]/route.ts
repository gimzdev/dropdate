import { type NextRequest, NextResponse } from 'next/server'
import { PLATFORMS, ics } from '@/lib/core'
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
  const ids = sp.get('ids')?.split(',').filter(Boolean), type = sp.get('type')
  const list = ids ? data.events.filter((e) => ids.includes(e.id)) : search(data.events, sp.get('q') ?? '', data.today, {
    kind: type === 'release' || type === 'tournament' ? type : 'all', platform: PLATFORMS.find((p) => p.toLowerCase() === sp.get('platform')?.toLowerCase()),
    genre: sp.get('genre') ?? undefined, past: sp.get('past') === 'true',
  }).list
  return new NextResponse(ics(list.slice(0, 500)), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="dropdate.ics"', 'Cache-Control': 'public, s-maxage=3600' } })
}
