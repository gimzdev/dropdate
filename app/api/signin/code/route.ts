import { NextResponse } from 'next/server'
import { CODE_GAP, codeIsFresh, dropCode, newCode } from '@/lib/auth'
import { hasDb, hit } from '@/lib/db'
import { NO_STORE, clientIp, fail, refuseForeign } from '@/lib/guard'
import { mailbox } from '@/lib/limit'
import { canEmail, sendCode } from '@/lib/mail'

// Emails a six-digit sign-in code: { email }. The one place codes are made and sent, so a failure is reported instead of hidden.
export const dynamic = 'force-dynamic'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Sign-in emails for all addresses together in an hour: nobody can run up the bill or spoil the sending domain's reputation. */
const ALL_PER_HOUR = 100

export async function POST(req: Request) {
  if (!hasDb() || !canEmail()) return fail(404, 'Signing in with an email code is not available.')
  const refused = refuseForeign(req)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL.test(email)) return fail(400, 'That email address does not look right.', undefined, 'INVALID_EMAIL')
  try {
    // A code just sent still works: asking again would only replace it, and let anyone cancel someone else's code
    if (await codeIsFresh(email)) return fail(429, 'A code was sent to this address a moment ago. Use it, or wait a minute for a new one.', { 'Retry-After': String(CODE_GAP) }, 'CODE_FRESH')
    // Nobody can flood an inbox: a handful per network, five an hour per mailbox (+tags and Gmail dots count as one), however many networks ask
    const network = await hit(`code-net:${clientIp(req)}`, 12, 600)
    if (!network.allowed) return fail(429, 'Too many tries from this network. Wait a few minutes and try again.', { 'Retry-After': String(network.retryAfter) })
    const mine = await hit(`otp:${mailbox(email)}`, 5, 3600)
    if (!mine.allowed) return fail(429, 'Too many codes for this address. Try again in an hour.', { 'Retry-After': String(mine.retryAfter) })
    const all = await hit('code-all', ALL_PER_HOUR, 3600)
    if (!all.allowed) return fail(429, 'Sign-in emails are paused for a little while because of heavy use. Try again soon.', { 'Retry-After': String(all.retryAfter) })
    const code = await newCode(email)
    try { await sendCode(email, code) } catch (e) {
      console.error('[dropdate] could not send the sign-in email:', e instanceof Error ? e.message : e)
      await dropCode(email).catch(() => {})
      return fail(502, 'We could not send the email. Try again in a minute.')
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch (e) {
    console.error('[dropdate] could not make a sign-in code:', e instanceof Error ? e.message : e)
    return fail(503, 'Signing in is unavailable right now. Try again in a minute.')
  }
}
