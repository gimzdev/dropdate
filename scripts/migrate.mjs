// Applies db/*.sql in order, each file once, on the direct (not pooled) connection. Safe to run any time:
//   npm run migrate | npm run migrate -- --check (test the pooled and direct connections) | --if-configured (quiet without a database)
// Exit codes: 0 done, 1 refused or failed, 2 no database URL, 3 the database could not be reached.
import { readdirSync, readFileSync } from 'node:fs'
import pg from 'pg'
import { directUrl, pgConfig } from '../lib/pgconfig.mjs'

const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL, dir = new URL('../db/', import.meta.url)
const say = (m) => console.log(`  ${m}`), args = process.argv
if (!url) {
  if (args.includes('--if-configured')) process.exit(0)
  console.error('  DATABASE_URL is not set.')
  process.exit(2)
}

const timeout = (e) => e?.code === 'ETIMEDOUT' || /timeout|timed out/i.test(String(e?.message || e))
const unreachable = (e) => ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(e?.code) || timeout(e)
function explain(e) {
  const code = e?.code, msg = String(e?.message || e)
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'the database refused the user or password in the database address'
  if (code === '3D000') return 'that database does not exist on the server (check the name at the end of the address)'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `the host in the database address does not resolve (${e.hostname || 'unknown host'})`
  if (code === 'ECONNREFUSED') return 'nothing is listening at the host and port in the database address'
  if (timeout(e)) return 'the database did not answer in time (a Neon database that was asleep needs a few seconds: try again)'
  return /self[- ]signed|certificate/i.test(msg) ? 'the TLS certificate could not be verified' : msg
}

/** A connected client; a database waking up (timeouts, resets) gets three tries. */
async function connect(target, extra = {}) {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client(pgConfig(target, { connectionTimeoutMillis: 20000, ...extra }))
    try { await client.connect(); client.on('error', () => {}); return client } catch (e) {
      await client.end().catch(() => {})
      if (attempt === 3 || !(e?.code === 'ECONNRESET' || timeout(e))) throw e
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

let client
try {
  if (args.includes('--check')) {
    const direct = directUrl(url), targets = new URL(direct).hostname === new URL(url).hostname ? [url] : [url, direct]
    let first
    for (const target of targets) {
      const c = await connect(target)
      try { first ??= (await c.query('select current_database() as db, version() as v')).rows[0] } finally { await c.end().catch(() => {}) }
    }
    say(`connected to ${first.db} (${first.v.split(' ').slice(0, 2).join(' ')})${targets.length > 1 ? ', pooled and direct' : ''}`)
    process.exit(0)
  }
  client = await connect(directUrl(url), { statement_timeout: 60000 })
  await client.query('select pg_advisory_lock(727301)') // two deploys at once never apply a file twice
  await client.query('create table if not exists dd_migrations (name text primary key, applied_at timestamptz not null default now())')
  const done = new Set((await client.query('select name from dd_migrations')).rows.map((r) => r.name))
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort(), todo = files.filter((f) => !done.has(f))
  for (const file of todo) {
    await client.query('begin')
    try {
      await client.query(readFileSync(new URL(file, dir), 'utf8'))
      await client.query('insert into dd_migrations (name) values ($1)', [file])
      await client.query('commit')
    } catch (e) {
      await client.query('rollback').catch(() => {})
      throw new Error(`${file}: ${e.message}`)
    }
    say(`applied ${file}`)
  }
  say(todo.length ? `database is up to date (${todo.length} applied)` : `database is up to date (${files.length} migrations, nothing to apply)`)
} catch (e) {
  console.error(`  Database: ${explain(e)}`)
  process.exitCode = unreachable(e) ? 3 : 1
} finally {
  await client?.end().catch(() => {})
}
