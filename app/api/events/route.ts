import { type NextRequest, NextResponse } from 'next/server'
import { PLATFORMS, search } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const { events, today, updated, stale, sources, error } = await getEvents()
  if (error) return NextResponse.json({ error }, { status: 503, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } })
  const type = sp.get('type')
  const { list, parsed } = search(events, sp.get('q') ?? '', today, {
    kind: type === 'release' || type === 'tournament' ? type : 'all',
    platform: PLATFORMS.find((p) => p.toLowerCase() === sp.get('platform')?.toLowerCase()),
    genre: sp.get('genre') ?? undefined,
    past: sp.get('past') === 'true',
  })
  const limit = Math.min(200, Math.max(1, Number(sp.get('limit')) || 50))
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  return NextResponse.json(
    { data: list.slice(offset, offset + limit), meta: { total: list.length, limit, offset, updated, stale, sources, understood: parsed.chips.map((c) => c.label) } },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}
