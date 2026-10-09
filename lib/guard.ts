// What every account endpoint checks first: accounts are on, the request is from this site, someone is signed in, at a human pace.
import 'server-only'
import { NextResponse } from 'next/server'
import { type Me, baseUrl, me } from './auth'
import { hasDb, hit, sameOrigin } from './db'

export { clientIp } from './limit'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
/** An error answer: a sentence a person can read, and optionally a code the page can act on. */
export const fail = (status: number, error: string, headers?: Record<string, string>, code?: string) => NextResponse.json({ error, ...(code && { code }) }, { status, headers: { ...NO_STORE, ...headers } })

/** A change must come from this site as JSON (a form elsewhere can send neither). Null when it does. */
export const refuseForeign = (req: Request) => (!sameOrigin(req, baseUrl()) || !req.headers.get('content-type')?.includes('application/json') ? fail(403, 'This request was refused.') : null)

/** The signed-in person, or the response to send instead. `write` also demands a request from this site, as JSON. */
export async function guard(req: Request, o: { write?: boolean; rate?: [name: string, max: number, windowSec: number] } = {}): Promise<Me | NextResponse> {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  const refused = o.write && refuseForeign(req)
  if (refused) return refused
  let user: Me | null
  try { user = await me(req.headers) } catch (e) {
    console.error('[dropdate] could not check the session:', e instanceof Error ? e.message : e)
    return fail(503, 'Accounts are unavailable right now. Try again in a minute.') // never a 401: the browser would think the session ended
  }
  if (!user) return fail(401, 'Not signed in.')
  if (o.rate) {
    const r = await hit(`${o.rate[0]}:${user.id}`, o.rate[1], o.rate[2]).catch(() => null)
    if (r && !r.allowed) return fail(429, 'Slow down a little and try again.', { 'Retry-After': String(r.retryAfter) })
  }
  return user
}
