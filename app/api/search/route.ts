import { type NextRequest, NextResponse } from 'next/server'
import { searchGames } from '@/lib/data'

export const dynamic = 'force-dynamic'

// Title search across every game RAWG knows (the calendar itself only holds what is released or coming soon)
export async function GET(req: NextRequest) {
  const results = await searchGames(req.nextUrl.searchParams.get('q') ?? '').catch(() => [])
  return NextResponse.json({ data: results }, { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, s-maxage=3600' } })
}
