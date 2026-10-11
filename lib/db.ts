// Server only: the database (Neon Postgres), rate limits and budgets, and the sign-in email.
import 'server-only'
import { createHmac } from 'node:crypto'
import { isIPv4, isIPv6 } from 'node:net'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { SITE } from './core'
import { pgConfig } from './pgconfig.mjs'

const env = process.env, g = globalThis as typeof globalThis & { __dd_pool?: Pool }

export const hasDb = () => !!env.DATABASE_URL

/** A small pool per server instance that lets idle clients go (Neon scales to zero). No startup options: Neon's pooler refuses them. */
export function db() {
  if (!g.__dd_pool) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    const p = new Pool(pgConfig(env.DATABASE_URL, { max: 8, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000, query_timeout: 10_000, keepAlive: true }))
    p.on('error', (e) => console.warn('[dropdate] an idle database connection was closed:', e.message))
    g.__dd_pool = p
  }
  return g.__dd_pool
}

const dead = (e: unknown) => /Connection terminated|ECONNRESET|EPIPE|ETIMEDOUT|server closed the connection|terminating connection/i.test(e instanceof Error ? e.message : String(e))

/** One statement; a dead connection gets a second try on a fresh one (every statement here is safe to repeat). */
export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  try { return (await db().query<T>(text, params)).rows } catch (e) {
    if (!dead(e)) throw e
    return (await db().query<T>(text, params)).rows
  }
}

/** A transaction. A connection dead at the start is replaced once; one that dies inside is thrown away. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  let c: PoolClient
  for (let attempt = 0; ; attempt++) {
    c = await db().connect()
    try { await c.query('begin'); break } catch (e) {
      c.release(e instanceof Error ? e : true)
      if (attempt || !dead(e)) throw e
    }
  }
  let broken: Error | undefined
  try {
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) {
    if (e instanceof Error && dead(e)) broken = e
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release(broken)
  }
}

export function secret() {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET
  if (env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build') throw new Error('BETTER_AUTH_SECRET is not set')
  return 'dropdate-development-secret-do-not-use-in-production'
}

/** Rate-limit keys are hashed: the table never holds an IP address or an email in readable form. */
export const hashKey = (key: string) => createHmac('sha256', secret()).update(key).digest('base64url')

/** Counts a hit against `key` in a fixed window, in one statement (simultaneous requests cannot all slip under). */
export async function hit(key: string, max: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const [row] = await q<{ hits: number; retry: number }>(
    `insert into dd_throttle as t (key, hits, started_at) values ($1, 1, now())
     on conflict (key) do update set
       hits = case when t.started_at <= now() - make_interval(secs => $2::int) then 1 else t.hits + 1 end,
       started_at = case when t.started_at <= now() - make_interval(secs => $2::int) then now() else t.started_at end
     returning hits, greatest(1, ceil(extract(epoch from (started_at + make_interval(secs => $2::int) - now()))))::int as retry`,
    [hashKey(key), windowSec],
  )
  return { allowed: row.hits <= max, retryAfter: row.retry }
}

/** Same-origin check for changes: browsers always send Origin or Sec-Fetch-Site cross-site. */
export function sameOrigin(req: Request, base: string) {
  const site = req.headers.get('sec-fetch-site'), origin = req.headers.get('origin')
  if (site && site !== 'same-origin' && site !== 'none') return false
  return !origin || origin === new URL(req.url).origin || origin === new URL(base).origin
}

// ── Budgets for what costs quota or money: counted in the database when there is one ──

/** The network a request comes from; IPv6 is cut to its /64 (one household or server owns a whole /64). */
export function network(ip: string) {
  let a = ip.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const mapped = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i) // IPv4 in IPv6 clothes
  if (mapped) a = mapped[1]
  if (isIPv4(a) || !isIPv6(a)) return a
  const [head, tail = ''] = a.split('::'), side = (s: string) => (s ? s.split(':') : [])
  const groups = a.includes('::') ? [...side(head), ...Array(Math.max(0, 8 - side(head).length - side(tail).length)).fill('0'), ...side(tail)] : side(a)
  return `${groups.slice(0, 4).map((x) => (parseInt(x, 16) || 0).toString(16)).join(':')}::/64`
}
export const clientIp = (req: { headers: { get(name: string): string | null } }) =>
  network(req.headers.get('x-vercel-forwarded-for')?.split(',')[0] || req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'local')

export function mailbox(email: string) {
  const [local = '', domain = ''] = email.toLowerCase().split('@'), gmail = domain === 'gmail.com' || domain === 'googlemail.com', base = local.split('+')[0] || local
  return `${gmail ? base.replace(/\./g, '') || base : base}@${gmail ? 'gmail.com' : domain}`
}

const memory = new Map<string, { n: number; until: number }>()
/** Counts a use of `name` against `max` per `windowSec`. Never throws: without the database, this instance counts alone. */
export async function allow(name: string, max: number, windowSec: number): Promise<boolean> {
  if (hasDb()) try { return (await hit(name, max, windowSec)).allowed } catch { /* count here instead */ }
  const now = Date.now(), m = memory.get(name)
  if (m && m.until > now) return ++m.n <= max
  if (memory.size > 4000) { for (const [k, v] of memory) if (v.until <= now) memory.delete(k); if (memory.size > 4000) memory.clear() }
  memory.set(name, { n: 1, until: now + windowSec * 1000 })
  return true
}

// ── The sign-in email, through Resend's HTTP API: no SDK, no tracking, no links, only the code ──

export const devCodes = () => env.DD_DEV_CODES === '1' && !env.VERCEL
export const canEmail = () => !!env.RESEND_API_KEY || devCodes()

export async function sendCode(to: string, code: string) {
  const key = env.RESEND_API_KEY
  if (!key) {
    if (!devCodes()) throw new Error('Email is not configured: set RESEND_API_KEY')
    return console.info(`\n  [dropdate] sign-in code for ${to}: ${code}\n`)
  }
  const note = 'It works once and expires in 10 minutes. If you did not ask for it, you can ignore this email.'
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fff;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700">Dropdate</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">Your sign-in code:</p>
<p style="margin:0 0 20px;font-size:36px;font-weight:800;letter-spacing:8px;background:#ffd23f;border-radius:12px;padding:14px 0;text-align:center">${code}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#555">${note}</p>
</td></tr></table></td></tr></table></body></html>`
  const res = await fetch(`${(env.RESEND_BASE || 'https://api.resend.com').replace(/\/$/, '')}/emails`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ from: env.EMAIL_FROM || `Dropdate <login@${new URL(SITE).hostname}>`, to: [to], subject: `${code} is your Dropdate sign-in code`, text: `Your Dropdate sign-in code is ${code}\n\n${note}`, html }),
  })
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
}
