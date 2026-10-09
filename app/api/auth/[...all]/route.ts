import { authHandlers } from '@/lib/auth'
import { hasDb } from '@/lib/db'
import { fail, refuseForeign } from '@/lib/guard'

// Sign-in with a code or a provider, and sign-out: Better Auth answers these and nothing else. It has many more endpoints
// (passwords, changing the email, listing sessions); this site uses none of them, so none of them is reachable.
export const dynamic = 'force-dynamic'

const ALLOWED = /^\/api\/auth\/(?:sign-in\/(?:email-otp|social)|callback\/(?:google|discord)|sign-out)$/

function pass(method: 'GET' | 'POST') {
  return (req: Request) => {
    if (!hasDb()) return fail(404, 'Accounts are not turned on.')
    if (!ALLOWED.test(new URL(req.url).pathname)) return fail(404, 'Not found.')
    if (method === 'POST') { const refused = refuseForeign(req); if (refused) return refused } // from this site, as JSON: a form on another site can send neither
    return authHandlers()[method](req)
  }
}
export const GET = pass('GET')
export const POST = pass('POST')
