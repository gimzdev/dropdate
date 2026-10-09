import { type NextRequest, NextResponse } from 'next/server'
import { PLATFORMS, ics } from '@/lib/core'
import { search } from '@/lib/search'
import { getEvents, getGame, searchGames } from '@/lib/data'
import { allow, clientIp } from '@/lib/limit'

// The public API: /api/events, /api/tournaments, /api/games, /api/search and /api/calendar.ics, plus /api/shots for the home page's cards
export const dynamic = 'force-dynamic'

const CORS = { 'Access-Control-Allow-Origin': '*' }
const json = (body: unknown, cache = 'public, s-maxage=3600', status = 200) => NextResponse.json(body, { status, headers: { ...CORS, 'Cache-Control': cache } })
const error = (status: number, message: string) => NextResponse.json({ error: message }, { status })
/** Lookups by name or slug go to RAWG, whose request allowance is shared by every visitor: one network may make this many a minute. */
const tooMany = () => NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { ...CORS, 'Cache-Control': 'no-store', 'Retry-After': '60' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const sp = req.nextUrl.searchParams, name = (await params).name
  if (name === 'games') {
    const slug = sp.get('slug')
    if (!slug) return error(400, 'slug is required')
    if (!(await allow(`game:${clientIp(req)}`, 30, 60))) return tooMany()
    try {
      const game = await getGame(slug)
      return game ? json({ data: game }) : error(404, 'not found')
    } catch {
      return error(502, 'upstream unavailable')
    }
  }
  // Title search across every game RAWG knows (the calendar itself only holds what is released or coming soon)
  if (name === 'search') {
    if (!(await allow(`search:${clientIp(req)}`, 40, 60))) return tooMany()
    return json({ data: await searchGames(sp.get('q') ?? '').catch(() => []) })
  }
  if (name !== 'events' && name !== 'tournaments' && name !== 'calendar.ics' && name !== 'shots') return error(404, 'not found')

  const data = await getEvents(), type = name === 'tournaments' ? 'tournament' : sp.get('type')
  // Every calendar game's screenshots by id: the home page leaves them out and its cards fetch them once, on the first hover
  if (name === 'shots') return json(Object.fromEntries(data.events.flatMap((e) => (e.shots.length ? [[e.id, e.shots]] : []))), 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  const find = () => search(data.events, sp.get('q') ?? '', data.today, {
    kind: type === 'release' || type === 'tournament' ? type : 'all',
    platform: PLATFORMS.find((p) => p.toLowerCase() === sp.get('platform')?.toLowerCase()),
    genre: sp.get('genre') ?? undefined,
    past: sp.get('past') === 'true',
  })
  if (name === 'calendar.ics') {
    if (data.error) return new NextResponse('Calendar temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } })
    const ids = sp.get('ids')?.split(',').filter(Boolean), list = ids ? data.events.filter((e) => ids.includes(e.id)) : find().list
    return new NextResponse(ics(list.slice(0, 500)), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="dropdate.ics"', 'Cache-Control': 'public, s-maxage=3600' } })
  }
  if (data.error) return json({ error: data.error }, 'no-store', 503)
  const { list, parsed } = find(), { updated, stale, sources } = data
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 50)), offset = Math.max(0, Number(sp.get('offset')) || 0)
  return json({ data: list.slice(offset, offset + limit), meta: { total: list.length, limit, offset, updated, stale, sources, understood: parsed.chips.map((c) => c.label) } }, 'public, s-maxage=3600, stale-while-revalidate=86400')
}
