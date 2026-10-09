import { authHandlers } from '@/lib/auth'
import { hasDb } from '@/lib/db'
import { fail, refuseForeign } from '@/lib/guard'

// Sign-in with a code or a provider, and sign-out: of Better Auth's many endpoints (passwords, email changes, sessions...) only these are reachable
export const dynamic = 'force-dynamic'

const ALLOWED = /^\/api\/auth\/(?:sign-in\/(?:email-otp|social)|callback\/(?:google|discord)|sign-out)$/

const pass = (method: 'GET' | 'POST') => (req: Request) => {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  if (!ALLOWED.test(new URL(req.url).pathname)) return fail(404, 'Not found.')
  const refused = method === 'POST' && refuseForeign(req) // from this site, as JSON: a form on another site can send neither
  return refused || authHandlers()[method](req)
}
export const GET = pass('GET')
export const POST = pass('POST')
