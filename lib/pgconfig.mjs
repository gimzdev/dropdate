// Postgres connection settings from a postgres:// URL. Shared by the app (lib/db.ts) and the migration script.
// Neon's URLs carry libpq-only options (sslmode, channel_binding) that node-postgres ignores or reads differently
// across versions, so the useful part is applied here, explicitly: encrypted and verified everywhere but on this machine.

/** @param {string} url @param {Record<string, unknown>} [extra] */
export function pgConfig(url, extra = {}) {
  const u = new URL(url)
  const host = u.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  const mode = (u.searchParams.get('sslmode') || '').toLowerCase()
  const ssl = mode === 'disable' || (!mode && local) ? false : { rejectUnauthorized: mode !== 'no-verify' }
  return {
    host, port: u.port ? Number(u.port) : 5432, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || undefined, ssl, ...extra,
  }
}

/** Neon's pooled address (host-pooler.region...) to its direct one: migrations take locks that a pooler can break. */
export function directUrl(url) {
  const u = new URL(url)
  u.hostname = u.hostname.replace(/-pooler(?=\.)/, '')
  return u.toString()
}

/** The region in a Neon host name (ep-xyz-123.c-2.eu-central-1.aws.neon.tech), if there is one. */
export function neonRegion(url) {
  try { return new URL(url).hostname.match(/\.([a-z]{2}(?:-[a-z]+)+-\d)\.(?:aws|azure)\.neon\.tech$/)?.[1] ?? '' } catch { return '' }
}
