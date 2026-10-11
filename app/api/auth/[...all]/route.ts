import { authHandlers, fail, refuseForeign } from '@/lib/auth'
import { hasDb } from '@/lib/db'

// Sign-in with a code or a provider, and sign-out: of Better Auth's many endpoints (passwords, email changes, sessions...) only these are reachable
export const dynamic = 'force-dynamic'

const ALLOWED = /^\/api\/auth\/(?:sign-in\/(?:email-otp|social)|callback\/(?:google|discord)|sign-out)$/
const pass = (method: 'GET' | 'POST') => (req: Request) => {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  if (!ALLOWED.test(new URL(req.url).pathname)) return fail(404, 'Not found.')
  return (method === 'POST' && refuseForeign(req)) || authHandlers()[method](req) // from this site, as JSON: a form elsewhere can send neither
}
export const GET = pass('GET'), POST = pass('POST')
