// Sign-in, server side only: Better Auth on your own Postgres. Passwordless: a six-digit code by email, plus Google and Discord when
// their keys are set. Of what a provider could tell us only the email address is kept (and its id for it, to recognise a return).
import 'server-only'
import { betterAuth } from 'better-auth'
import { nextCookies, toNextJsHandler } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { SITE } from './core'
import { db, hasDb, hit, q, secret } from './db'
import { canEmail } from './mail'

const env = process.env

/** The site's address as the browser sees it: production, localhost, or a preview's own. */
export function baseUrl() {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, '')
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return SITE
}

const googleOn = () => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
const discordOn = () => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)

/** The ways to sign in here: the sign-in page shows only what works. */
export const methods = () => ({ email: hasDb() && canEmail(), google: hasDb() && googleOn(), discord: hasDb() && discordOn() })

/** Nothing beyond the email is kept: no name, photo, tokens, IP address or device. */
const noTokens = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, scope: null }

const touch = (userId?: string) => (userId ? q('update "user" set "updatedAt" = now() where "id" = $1', [userId]).then(() => undefined, () => undefined) : Promise.resolve())

function build() {
  const url = baseUrl()
  return betterAuth({
    appName: 'Dropdate',
    baseURL: url,
    secret: secret(),
    database: db(),
    // and the deploy's own Vercel addresses, so previews and the vercel.app address can sign in
    trustedOrigins: [url, ...[env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter((h): h is string => !!h).map((h) => `https://${h}`)],
    telemetry: { enabled: false },
    logger: { level: 'warn' },
    // 30 days, renewed when used after a day (row and cookie, see nextCookies), checked every time: sign-out and deletion apply at once
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // the tables come from db/*.sql (run at every build): no schema check, which would stay failed until a restart if it failed once
    advanced: { cookiePrefix: 'dropdate', useSecureCookies: url.startsWith('https://'), database: { validateSchema: false } },
    account: { updateAccountOnSignIn: false },
    onAPIError: { errorURL: '/signin' }, // a provider sign-in that fails early ends on the sign-in page
    socialProviders: {
      // Google is asked for the email only; Discord's smallest scopes are the identifier and the email
      ...(googleOn() ? { google: { clientId: env.GOOGLE_CLIENT_ID as string, clientSecret: env.GOOGLE_CLIENT_SECRET as string, disableDefaultScope: true, scope: ['openid', 'email'] } } : {}),
      ...(discordOn() ? { discord: { clientId: env.DISCORD_CLIENT_ID as string, clientSecret: env.DISCORD_CLIENT_SECRET as string } } : {}),
    },
    // rate limits live in the database (serverless instances share no memory), under hashed keys
    rateLimit: {
      enabled: true,
      customStorage: { consume: async (key, rule) => { const r = await hit(`auth:${key}`, rule.max, rule.window); return { allowed: r.allowed, retryAfter: r.allowed ? null : r.retryAfter } } },
    },
    databaseHooks: {
      user: {
        // an address the provider has not verified makes no account (anyone could register someone else's)
        create: { before: async (u) => (u.emailVerified ? { data: { ...u, name: '', image: null } } : false) },
        update: { before: async (u) => ({ data: { ...u, name: '', image: null } }) },
      },
      // the last-used date moves with each sign-in and renewal: the clean-up deletes accounts unused for 24 months
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
        // codes are sent by /api/signin/code (newCode below): the plugin's route would hide a failed send
        async sendVerificationOTP() { throw new Error('Codes are sent by /api/signin/code.') },
      }),
      nextCookies(), // last: hands the renewed session cookie to Next
    ],
  })
}

/** Seconds between two codes for one address (the sign-in page waits the same). */
export const CODE_GAP = 45

/** Whether a code for this address was made a moment ago (probably still on its way). */
export async function codeIsFresh(email: string) {
  const rows = await q('select 1 from "verification" where "identifier" = $1 and "createdAt" > now() - make_interval(secs => $2::int) limit 1', [`sign-in-otp-${email}`, CODE_GAP])
  return rows.length > 0
}

/** A fresh code for this address (the last one stops working; only its hash is kept). The caller sends it, and drops it if that fails. */
export async function newCode(email: string): Promise<string> {
  await dropCode(email)
  return auth().api.createVerificationOTP({ body: { email, type: 'sign-in' } })
}
export const dropCode = (email: string) => q('delete from "verification" where "identifier" = $1', [`sign-in-otp-${email}`]).then(() => undefined)

let instance: ReturnType<typeof build> | undefined
/** Built on first use: builds and pages without accounts never need the database or the secret. */
export const auth = () => (instance ??= build())

let handlers: ReturnType<typeof toNextJsHandler> | undefined
export const authHandlers = () => (handlers ??= toNextJsHandler(auth()))

export interface Me { id: string; email: string; since: string }
/** The signed-in user, or null. Route handlers renew a day-old session; a page render cannot set cookies, so it only looks (`render`). */
export async function me(headers: Headers, o: { render?: boolean } = {}): Promise<Me | null> {
  if (!hasDb()) return null
  const s = await auth().api.getSession({ headers, ...(o.render && { query: { disableRefresh: true } }) })
  return s ? { id: s.user.id, email: s.user.email, since: new Date(s.user.createdAt).toISOString() } : null
}
