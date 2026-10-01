import { type NextRequest, NextResponse } from 'next/server'
import { getGame } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  try {
    const game = await getGame(slug)
    if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ data: game }, { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=3600' } })
  } catch {
    return NextResponse.json({ error: 'upstream unavailable' }, { status: 502 })
  }
}
