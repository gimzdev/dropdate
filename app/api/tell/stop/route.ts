import { NextResponse } from 'next/server'
import { fail } from '@/lib/auth'
import { hasDb } from '@/lib/db'
import { stopAll, stopAllowed } from '@/lib/tell'

// Stops every "Tell me" email of one account, from the link in each email (?u=<account>&k=<key>): no sign-in needed.
// POST from the page at /tell/stop, or from a mail app's own unsubscribe button (RFC 8058). A GET only opens that page:
// mail scanners open links, and must never stop anything.
export const dynamic = 'force-dynamic'

const params = (req: Request) => { const u = new URL(req.url).searchParams; return { user: u.get('u') ?? '', key: u.get('k') ?? '' } }

export function GET(req: Request) {
  const { user, key } = params(req)
  return NextResponse.redirect(new URL(`/tell/stop?u=${encodeURIComponent(user)}&k=${encodeURIComponent(key)}`, req.url), 303)
}

export async function POST(req: Request) {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  const { user, key } = params(req)
  if (!stopAllowed(user, key)) return fail(403, 'This link does not work. Use the one in the latest email.')
  try { await stopAll(user) } catch (e) {
    console.error('[dropdate] could not stop the emails:', e instanceof Error ? e.message : e)
    return fail(503, 'That did not go through. Try again in a minute.')
  }
  // the page's own button gets the page back; a mail app only needs to hear it worked
  return req.headers.get('content-type')?.includes('application/x-www-form-urlencoded') && new URL(req.url).searchParams.get('from') === 'page'
    ? NextResponse.redirect(new URL('/tell/stop?done=1', req.url), 303)
    : NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
