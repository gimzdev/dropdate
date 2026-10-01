import { NextRequest } from 'next/server'
import { GET as events } from '../events/route'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const url = new URL(req.url)
  url.searchParams.set('type', 'tournament')
  return events(new NextRequest(url, req))
}
