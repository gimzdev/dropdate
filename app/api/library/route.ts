import { NextResponse } from 'next/server'
import { NO_STORE, fail, guard } from '@/lib/guard'
import { LibraryError, setFlag } from '@/lib/library'

// Wishlist or un-wishlist, mark or un-mark as played: { key: "rawg-123", list: "wishlist" | "played", on: true | false }
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await guard(req, { write: true, rate: ['library', 120, 60] })
  if (user instanceof Response) return user
  const body = (await req.json().catch(() => null)) as { key?: unknown; list?: unknown; on?: unknown } | null
  if (!body || typeof body.key !== 'string' || (body.list !== 'wishlist' && body.list !== 'played') || typeof body.on !== 'boolean') return fail(400, 'That request does not make sense.')
  try {
    return NextResponse.json(await setFlag(user.id, body.key, body.list, body.on), { headers: NO_STORE })
  } catch (e) {
    if (e instanceof LibraryError) return fail(e.status, e.message)
    console.error('[dropdate] could not change the library:', e instanceof Error ? e.message : e)
    return fail(500, 'Something went wrong. Try again.')
  }
}
