// Budgets for what costs quota or money (data sources, email). Server side only; counted in the database when there is one.
import 'server-only'
import { isIPv4, isIPv6 } from 'node:net'
import { hasDb, hit } from './db'

/** The network a request comes from. IPv6 is cut to its /64: one household or server owns a whole /64. */
export function network(ip: string) {
  let a = ip.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const mapped = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i) // an IPv4 address in IPv6 clothes
  if (mapped) a = mapped[1]
  if (isIPv4(a) || !isIPv6(a)) return a
  const [head, tail = ''] = a.split('::'), side = (s: string) => (s ? s.split(':') : [])
  const groups = a.includes('::') ? [...side(head), ...Array(Math.max(0, 8 - side(head).length - side(tail).length)).fill('0'), ...side(tail)] : side(a)
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`
}

/** Where a request comes from, for rate limits (Vercel sets these headers; locally there are none). */
export const clientIp = (req: { headers: { get(name: string): string | null } }) =>
  network(req.headers.get('x-vercel-forwarded-for')?.split(',')[0] || req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'local')

/** The mailbox an address leads to: no "+tag", no dots in Gmail. */
export function mailbox(email: string) {
  const [local = '', domain = ''] = email.toLowerCase().split('@')
  const gmail = domain === 'gmail.com' || domain === 'googlemail.com', base = local.split('+')[0] || local
  return `${gmail ? base.replace(/\./g, '') || base : base}@${gmail ? 'gmail.com' : domain}`
}

const memory = new Map<string, { n: number; until: number }>()

/** Counts a use of `name` against `max` per `windowSec`. Never throws: without the database, this instance counts alone. */
export async function allow(name: string, max: number, windowSec: number): Promise<boolean> {
  if (hasDb()) {
    try { return (await hit(name, max, windowSec)).allowed } catch { /* count here instead */ }
  }
  const now = Date.now(), m = memory.get(name)
  if (!m || m.until <= now) {
    if (memory.size > 4000) { for (const [k, v] of memory) if (v.until <= now) memory.delete(k); if (memory.size > 4000) memory.clear() }
    memory.set(name, { n: 1, until: now + windowSec * 1000 })
    return true
  }
  return ++m.n <= max
}
