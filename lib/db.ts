// The database (Neon Postgres), server side only: one small pool per server instance, plus the rate limiter.
import 'server-only'
import { createHmac } from 'node:crypto'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'
import { pgConfig } from './pgconfig.mjs'

const g = globalThis as typeof globalThis & { __dd_pool?: Pool }

/** Accounts exist only when a database is configured; without one the site works as before, with the list kept in the browser. */
export const hasDb = () => !!process.env.DATABASE_URL

function pool() {
  if (!g.__dd_pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    // Neon closes idle connections and scales to zero: keep the pool small, let idle clients go, and survive their errors.
    // No server-side options (statement_timeout and friends): Neon's pooled address is a PgBouncer that refuses unknown startup parameters.
    const p = new Pool(pgConfig(url, { max: 8, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000, query_timeout: 10_000, keepAlive: true }))
    p.on('error', (e) => console.warn('[dropdate] an idle database connection was closed:', e.message))
    g.__dd_pool = p
  }
  return g.__dd_pool
}
export const db = pool

/** A connection that died while nobody was using it (a serverless instance that slept, a database that scaled to zero). */
const dead = (e: unknown) => /Connection terminated|ECONNRESET|EPIPE|ETIMEDOUT|server closed the connection|terminating connection/i.test(e instanceof Error ? e.message : String(e))

/** One statement. If it meets a dead connection, the pool has dropped it, so a second try goes out on a fresh one. Statements here are safe to repeat. */
export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  try { return (await pool().query<T>(text, params)).rows } catch (e) {
    if (!dead(e)) throw e
    return (await pool().query<T>(text, params)).rows
  }
}

/** A connection with a transaction open. A dead one is thrown away and replaced once. */
async function begin(): Promise<PoolClient> {
  for (let attempt = 0; ; attempt++) {
    const c = await pool().connect()
    try { await c.query('begin'); return c } catch (e) {
      c.release(e instanceof Error ? e : true)
      if (attempt || !dead(e)) throw e
    }
  }
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await begin()
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
    c.release(broken) // a connection that died is thrown away, not handed to the next request
  }
}

/** The signing secret. Production refuses to run without one; builds and local runs fall back to a fixed development value. */
export function secret() {
  const s = process.env.BETTER_AUTH_SECRET
  if (s) return s
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error('BETTER_AUTH_SECRET is not set')
  return 'dropdate-development-secret-do-not-use-in-production'
}

/**
 * Counts one hit against `key` in a fixed window and says whether it is still allowed. A single statement, so
 * simultaneous requests cannot all slip under the limit. The key is hashed with the secret first: the table never
 * holds an IP address or an email in readable form.
 */
export const hashKey = (key: string) => createHmac('sha256', secret()).update(key).digest('base64url')

export async function hit(key: string, max: number, windowSec: number): Promise<{ allowed: boolean; retryAfter: number }> {
  const hashed = hashKey(key)
  const [row] = await q<{ hits: number; retry: number }>(
    `insert into dd_throttle as t (key, hits, started_at) values ($1, 1, now())
     on conflict (key) do update set
       hits = case when t.started_at <= now() - make_interval(secs => $2::int) then 1 else t.hits + 1 end,
       started_at = case when t.started_at <= now() - make_interval(secs => $2::int) then now() else t.started_at end
     returning hits, greatest(1, ceil(extract(epoch from (started_at + make_interval(secs => $2::int) - now()))))::int as retry`,
    [hashed, windowSec],
  )
  return { allowed: row.hits <= max, retryAfter: row.retry }
}

/** Same-origin check for requests that change something: browsers always send Origin or Sec-Fetch-Site on cross-site requests. */
export function sameOrigin(req: Request, base: string) {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin || origin === new URL(base).origin
}
