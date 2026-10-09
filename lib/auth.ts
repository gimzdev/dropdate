// Sign-in, server side only. Better Auth keeps users and sessions in your own Postgres.
// Passwordless: a six-digit code by email, plus Google and Discord when their keys are set.
// Privacy by construction: of everything a provider could tell us, only the email address is kept (and the provider's id for it,
// which is how a returning person is recognised).
import 'server-only'
import { betterAuth } from 'better-auth'
import { nextCookies, toNextJsHandler } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { SITE } from './core'
import { db, hasDb, hit, q, secret } from './db'
import { canEmail } from './mail'

/** Where the site is, as the browser sees it: the real address in production, localhost in local runs, the deploy's own address in previews. */
export function baseUrl() {
  const set = process.env.BETTER_AUTH_URL
  if (set) return set.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return SITE
}

const env = process.env
/** Addresses this deployment answers on, besides the main one: the deploy's own Vercel addresses, so previews and the project's vercel.app address can sign in too. */
const alsoTrusted = () => [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter((h): h is string => !!h).map((h) => `https://${h}`)
const googleOn = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const discordOn = () => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)

/** The ways to sign in on this server, so the sign-in page shows only what works. */
export const methods = () => ({ email: hasDb() && canEmail(), google: hasDb() && googleOn(), discord: hasDb() && discordOn() })

/** Nothing a provider adds beyond the email is kept: no name, photo, tokens, IP address or device. */
const noTokens = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null }

const touch = (userId?: string) => (userId ? q('update "user" set "updatedAt" = now() where "id" = $1', [userId]).then(() => undefined, () => undefined) : Promise.resolve())

function build() {
  const url = baseUrl()
  return betterAuth({
    appName: 'Dropdate',
    baseURL: url,
    secret: secret(),
    database: db(),
    trustedOrigins: [url, ...alsoTrusted()],
    telemetry: { enabled: false },
    logger: { level: 'warn' },
    // 30 days. A session that is used again after a day is renewed for another 30 (the database row and the cookie, see nextCookies below),
    // so people who keep coming back stay signed in. It is checked in the database every time: signing out or deleting an account takes effect at once.
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // The tables are made by this project's own migrations (db/*.sql), run at every build: Better Auth does not need to inspect them on
    // the first request of every server, and a check that fails once (tables missing for a moment) must not stay failed until the server restarts
    advanced: { cookiePrefix: 'dropdate', useSecureCookies: url.startsWith('https://'), database: { validateSchema: false } },
    account: { updateAccountOnSignIn: false },
    // A provider sign-in that fails before it starts (the page was open too long, access was denied) ends on the sign-in page, not on a raw error
    onAPIError: { errorURL: '/signin' },
    socialProviders: {
      // Google is asked for the email address only (no profile, name or photo); Discord's smallest scopes are the identifier and the email
      ...(googleOn() ? { google: { clientId: env.GOOGLE_CLIENT_ID as string, clientSecret: env.GOOGLE_CLIENT_SECRET as string, disableDefaultScope: true, scope: ['openid', 'email'] } } : {}),
      ...(discordOn() ? { discord: { clientId: env.DISCORD_CLIENT_ID as string, clientSecret: env.DISCORD_CLIENT_SECRET as string } } : {}),
    },
    // Rate limits live in the database (an instance's memory is not shared on serverless), under hashed keys
    rateLimit: {
      enabled: true,
      customStorage: { consume: async (key, rule) => { const r = await hit(`auth:${key}`, rule.max, rule.window); return { allowed: r.allowed, retryAfter: r.allowed ? null : r.retryAfter } } },
    },
    databaseHooks: {
      user: {
        // An address a provider has not verified does not make an account: anyone could register someone else's address with it
        create: { before: async (u) => (u.emailVerified ? { data: { ...u, name: '', image: null } } : false) },
        update: { before: async (u) => ({ data: { ...u, name: '', image: null } }) },
      },
      // The account's last-used date moves with every sign-in and daily renewal: the clean-up deletes accounts nobody has used for 24 months
      session: {
        create: { before: async (s) => ({ data: { ...s, ipAddress: null, userAgent: null } }), after: async (s) => touch(s?.userId) },
        update: { after: async (s) => touch(s?.userId) },
      },
      account: { create: { before: async (a) => ({ data: { ...a, ...noTokens } }) }, update: { before: async (a) => ({ data: { ...a, ...noTokens } }) } },
    },
    plugins: [
      emailOTP({
        otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: 'hashed',
        rateLimit: { window: 60, max: 10 }, // wrong guesses per network; each code also dies after five of them
        // Codes are sent by /api/signin/code (see newCode below): the plugin's own route cannot report a failed send, it hides it
        async sendVerificationOTP() { throw new Error('Codes are sent by /api/signin/code.') },
      }),
      nextCookies(), // must come last: it hands the renewed session cookie to Next when a route handler asks who is signed in
    ],
  })
}

/** Codes are asked for no more than once in this many seconds per address (the sign-in page waits the same). */
export const CODE_GAP = 45

/** Whether a code for this address was made a moment ago, and is probably still on its way. */
export async function codeIsFresh(email: string) {
  const rows = await q('select 1 from "verification" where "identifier" = $1 and "createdAt" > now() - make_interval(secs => $2::int) limit 1', [`sign-in-otp-${email}`, CODE_GAP])
  return rows.length > 0
}

/**
 * A fresh six-digit code for this address. The one before stops working. Only its hash is stored, and it dies after ten minutes
 * or five wrong guesses. The caller sends it, and calls dropCode if sending fails.
 */
export async function newCode(email: string): Promise<string> {
  await dropCode(email)
  return auth().api.createVerificationOTP({ body: { email, type: 'sign-in' } })
}
export const dropCode = (email: string) => q('delete from "verification" where "identifier" = $1', [`sign-in-otp-${email}`]).then(() => undefined)

let instance: ReturnType<typeof build> | undefined
/** Built on first use, so a build or a page without accounts never needs the database or the secret. */
export const auth = () => (instance ??= build())

let handlers: ReturnType<typeof toNextJsHandler> | undefined
export const authHandlers = () => (handlers ??= toNextJsHandler(auth()))

export interface Me { id: string; email: string; since: string }
/**
 * Who is asking: the signed-in user, or null. Route handlers renew a session that is a day old (and its cookie, through nextCookies).
 * A page being rendered cannot set cookies, so it only looks (`render`): renewing the database row without the cookie would let the two drift apart.
 */
export async function me(headers: Headers, o: { render?: boolean } = {}): Promise<Me | null> {
  if (!hasDb()) return null
  const s = await auth().api.getSession({ headers, ...(o.render && { query: { disableRefresh: true } }) })
  return s ? { id: s.user.id, email: s.user.email, since: new Date(s.user.createdAt).toISOString() } : null
}
