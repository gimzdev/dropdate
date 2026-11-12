import { NextResponse } from 'next/server'
import { NO_STORE, fail, guard } from '@/lib/auth'
import { GAME_KEY, LISTS } from '@/lib/core'
import { canEmail } from '@/lib/db'
import { LibraryError, libraryKeys, merge, setFlag } from '@/lib/library'
import { setTell } from '@/lib/tell'

// POST /api/library { key: "igdb-123", list: "wishlist" | "played" | "completed", on: true | false }: mark or un-mark a game.
// POST /api/library/merge { keys: [...] }: hearts left in the browser before signing in become wishlist entries; `done` says which
// of them the browser can forget, the others are tried again later.
// POST /api/library/tell { key, on }: "Tell me" for a game on the wishlist: an email on its release day and when its date moves.
export const dynamic = 'force-dynamic'
const oops = (what: string, e: unknown) => { console.error(`[dropdate] could not ${what}:`, e instanceof Error ? e.message : e); return fail(500, 'Something went wrong. Try again.') }

export async function POST(req: Request, { params }: { params: Promise<{ sub?: string[] }> }) {
  const sub = (await params).sub?.join('/')
  if (sub && sub !== 'merge' && sub !== 'tell') return fail(404, 'Not found.')
  const user = await guard(req, { write: true, rate: sub === 'merge' ? ['merge', 10, 600] : sub === 'tell' ? ['tell', 60, 600] : ['library', 120, 60] })
  if (user instanceof Response) return user
  const body = (await req.json().catch(() => null)) as { key?: unknown; list?: unknown; on?: unknown; keys?: unknown } | null
  if (sub === 'tell') {
    if (!canEmail()) return fail(404, 'Emails are not turned on.')
    if (!body || typeof body.key !== 'string' || !GAME_KEY.test(body.key) || typeof body.on !== 'boolean') return fail(400, 'That request does not make sense.')
    try {
      return NextResponse.json({ on: await setTell(user.id, body.key, body.on) }, { headers: NO_STORE })
    } catch (e) { return e instanceof LibraryError ? fail(e.status, e.message) : oops('change the emails', e) }
  }
  if (sub) {
    try {
      const { added, done } = await merge(user.id, body?.keys)
      return NextResponse.json({ added, done, ...(await libraryKeys(user.id)) }, { headers: NO_STORE })
    } catch (e) { return oops('merge the saved list', e) }
  }
  const list = LISTS.find((l) => l === body?.list)
  if (!body || typeof body.key !== 'string' || !list || typeof body.on !== 'boolean') return fail(400, 'That request does not make sense.')
  try {
    return NextResponse.json(await setFlag(user.id, body.key, list, body.on), { headers: NO_STORE })
  } catch (e) { return e instanceof LibraryError ? fail(e.status, e.message) : oops('change the library', e) }
}
