// The database (Neon Postgres), server side only: one small pool per server instance, plus the rate limiter.
import 'server-only'
import { createHmac } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { pgConfig } from './pgconfig.mjs'

const g = globalThis as typeof globalThis & { __dd_pool?: Pool }

/** Accounts exist only when a database is configured. */
export const hasDb = () => !!process.env.DATABASE_URL

/** A small pool that lets idle clients go (Neon scales to zero). No startup options: Neon's pooler (PgBouncer) refuses them. */
export function db() {
  if (!g.__dd_pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    const p = new Pool(pgConfig(url, { max: 8, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000, query_timeout: 10_000, keepAlive: true }))
    p.on('error', (e) => console.warn('[dropdate] an idle database connection was closed:', e.message))
    g.__dd_pool = p
  }
  return g.__dd_pool
}

/** A connection that died idle (a sleeping instance, a database scaled to zero). */
const dead = (e: unknown) => /Connection terminated|ECONNRESET|EPIPE|ETIMEDOUT|server closed the connection|terminating connection/i.test(e instanceof Error ? e.message : String(e))

/** One statement; a dead connection gets a second try on a fresh one (statements here are safe to repeat). */
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

/** The signing secret: required in production, a fixed development value elsewhere. */
export function secret() {
  const s = process.env.BETTER_AUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error('BETTER_AUTH_SECRET is not set')
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
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin || origin === new URL(base).origin
}
