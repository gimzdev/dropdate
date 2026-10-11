// Postgres settings from a postgres:// URL, for the app and the migrations. Neon's URLs carry libpq-only options (sslmode,
// channel_binding) that node-postgres reads differently across versions, so TLS is set here: on and verified, except locally.

/** @param {string} url @param {Record<string, unknown>} [extra] */
export function pgConfig(url, extra = {}) {
  const u = new URL(url), host = u.hostname, mode = (u.searchParams.get('sslmode') || '').toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  return {
    host, port: u.port ? Number(u.port) : 5432, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)) || undefined, ssl: mode === 'disable' || (!mode && local) ? false : { rejectUnauthorized: mode !== 'no-verify' }, ...extra,
  }
}

/** Neon's pooled address to its direct one: migrations take locks a pooler can break. */
export const directUrl = (url) => { const u = new URL(url); u.hostname = u.hostname.replace(/-pooler(?=\.)/, ''); return u.toString() }

/** The region in a Neon host name (ep-x.c-2.eu-central-1.aws.neon.tech), or ''. */
export function neonRegion(url) {
  try { return new URL(url).hostname.match(/\.([a-z]{2}(?:-[a-z]+)+-\d)\.(?:aws|azure)\.neon\.tech$/)?.[1] ?? '' } catch { return '' }
}
