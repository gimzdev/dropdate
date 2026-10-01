import { type NextRequest, NextResponse } from 'next/server'
import { PLATFORMS, ics, search } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const { events, today, error } = await getEvents()
  if (error) return new NextResponse('Calendar temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } })
  const ids = sp.get('ids')?.split(',').filter(Boolean)
  const type = sp.get('type')
  const list = ids
    ? events.filter((e) => ids.includes(e.id))
    : search(events, sp.get('q') ?? '', today, {
        kind: type === 'release' || type === 'tournament' ? type : 'all',
        platform: PLATFORMS.find((p) => p.toLowerCase() === sp.get('platform')?.toLowerCase()),
        genre: sp.get('genre') ?? undefined,
        past: sp.get('past') === 'true',
      }).list
  return new NextResponse(ics(list.slice(0, 500)), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="dropdate.ics"', 'Cache-Control': 'public, s-maxage=3600' },
  })
}
