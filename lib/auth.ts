// Sign-in, server side only: Better Auth on your own Postgres. Passwordless: a six-digit code by email, and Google or Discord when
// their keys are set. Of what a provider could tell us, only the email is kept (and the provider's id for it, to recognise a return).
import 'server-only'
import { betterAuth } from 'better-auth'
import { nextCookies, toNextJsHandler } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { NextResponse } from 'next/server'
import { SITE } from './core'
import { canEmail, db, hasDb, hit, q, sameOrigin, secret } from './db'

const env = process.env

export function baseUrl() {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, '')
  return env.VERCEL_ENV === 'preview' && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : SITE
}

const googleOn = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), discordOn = () => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)
export const methods = () => ({ email: hasDb() && canEmail(), google: hasDb() && googleOn(), discord: hasDb() && discordOn() })

/** Nothing beyond the email is kept: no name, photo, tokens, IP address or device. */
const noTokens = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null }
const touch = async (userId?: string) => { if (userId) await q('update "user" set "updatedAt" = now() where "id" = $1', [userId]).catch(() => {}) }

function build() {
  const url = baseUrl()
  return betterAuth({
    appName: 'Dropdate', baseURL: url, secret: secret(), database: db(),
    // and the deploy's own Vercel addresses, so previews and the vercel.app address can sign in
    trustedOrigins: [url, ...[env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter((h): h is string => !!h).map((h) => `https://${h}`)],
    telemetry: { enabled: false }, logger: { level: 'warn' },
    // 30 days, renewed when used after a day, checked every time: signing out and deleting apply at once
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // the tables come from db/*.sql: no schema check (one that failed once would stay failed until a restart)
    advanced: { cookiePrefix: 'dropdate', useSecureCookies: url.startsWith('https://'), database: { validateSchema: false } },
    account: { updateAccountOnSignIn: false },
    onAPIError: { errorURL: '/signin' },
    socialProviders: { // Google is asked for the email only; Discord's smallest scopes are the identifier and the email
      ...(googleOn() && { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, disableDefaultScope: true, scope: ['openid', 'email'] } }),
      ...(discordOn() && { discord: { clientId: env.DISCORD_CLIENT_ID!, clientSecret: env.DISCORD_CLIENT_SECRET! } }),
    },
    // in the database (serverless instances share no memory), under hashed keys
    rateLimit: { enabled: true, customStorage: { consume: async (key, rule) => { const r = await hit(`auth:${key}`, rule.max, rule.window); return { allowed: r.allowed, retryAfter: r.allowed ? null : r.retryAfter } } } },
    databaseHooks: {
      // an address the provider has not verified makes no account (anyone could register someone else's)
      user: { create: { before: async (u) => (u.emailVerified ? { data: { ...u, name: '', image: null } } : false) }, update: { before: async (u) => ({ data: { ...u, name: '', image: null } }) } },
      // the last-used date moves with each sign-in and renewal: the clean-up deletes accounts unused for 24 months
      session: { create: { before: async (s) => ({ data: { ...s, ipAddress: null, userAgent: null } }), after: async (s) => touch(s?.userId) }, update: { after: async (s) => touch(s?.userId) } },
      account: { create: { before: async (a) => ({ data: { ...a, ...noTokens } }) }, update: { before: async (a) => ({ data: { ...a, ...noTokens } }) } },
    },
    plugins: [
      emailOTP({
        otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed', rateLimit: { window: 60, max: 10 },
        // codes are made and sent by /api/signin/code (newCode below): this route would hide a failed send
        async sendVerificationOTP() { throw new Error('Codes are sent by /api/signin/code.') },
      }),
      nextCookies(), // last: hands the renewed session cookie to Next
    ],
  })
}

let instance: ReturnType<typeof build> | undefined, handlers: ReturnType<typeof toNextJsHandler> | undefined
/** Built on first use: pages and builds without accounts never need the database or the secret. */
export const auth = () => (instance ??= build())
export const authHandlers = () => (handlers ??= toNextJsHandler(auth()))

/** Seconds between two codes for one address (the sign-in page waits as long). */
export const CODE_GAP = 45
const codeId = (email: string) => `sign-in-otp-${email}`
export const codeIsFresh = async (email: string) =>
  (await q('select 1 from "verification" where "identifier" = $1 and "createdAt" > now() - make_interval(secs => $2::int) limit 1', [codeId(email), CODE_GAP])).length > 0
/** A fresh code (the last one stops working; only its hash is kept). The caller sends it, and drops it if that fails. */
export async function newCode(email: string): Promise<string> {
  await dropCode(email)
  return auth().api.createVerificationOTP({ body: { email, type: 'sign-in' } })
}
export const dropCode = async (email: string) => { await q('delete from "verification" where "identifier" = $1', [codeId(email)]) }

export interface Me { id: string; email: string; since: string }
/** The signed-in person, or null. Route handlers renew a day-old session; a page render cannot set cookies, so it only looks (`render`). */
export async function me(headers: Headers, o: { render?: boolean } = {}): Promise<Me | null> {
  if (!hasDb()) return null
  const s = await auth().api.getSession({ headers, ...(o.render && { query: { disableRefresh: true } }) })
  return s ? { id: s.user.id, email: s.user.email, since: new Date(s.user.createdAt).toISOString() } : null
}

// ── What every account endpoint checks first: accounts are on, the request comes from this site, someone is signed in, at a human pace ──

export const NO_STORE = { 'Cache-Control': 'private, no-store' }
export const fail = (status: number, error: string, headers?: Record<string, string>, code?: string) =>
  NextResponse.json({ error, ...(code && { code }) }, { status, headers: { ...NO_STORE, ...headers } })
/** A change must come from this site, as JSON (a form elsewhere can send neither). Null when it does. */
export const refuseForeign = (req: Request) => (!sameOrigin(req, baseUrl()) || !req.headers.get('content-type')?.includes('application/json') ? fail(403, 'This request was refused.') : null)

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
  const r = o.rate && (await hit(`${o.rate[0]}:${user.id}`, o.rate[1], o.rate[2]).catch(() => null))
  return r && !r.allowed ? fail(429, 'Slow down a little and try again.', { 'Retry-After': String(r.retryAfter) }) : user
}
