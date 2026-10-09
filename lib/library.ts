// Everyone's library, server side only: what each person wishlisted, played or completed, and the shared cache of those games'
// public details (dd_game), so a library opens without calling the data sources for every game.
import 'server-only'
import { after } from 'next/server'
import { type Ev, type Flags, GAME_KEY, type LibItem, type ListName, PLATFORMS, type Platform } from './core'
import { fromSource, getEvents } from './data'
import { hashKey, q, tx } from './db'
import { allow, mailbox } from './limit'

/** Games per person: a wishlist is a list, not a database. */
export const LIMIT = 2000
/** Inactive accounts are deleted after this many months without a sign-in or a visit. */
export const INACTIVE_MONTHS = 24
/** Source lookups (for games nobody saved yet) one person may cause in an hour: the quotas are shared by everyone. */
const NEW_GAMES_PER_HOUR = 60

/** A failure with something worth telling the person. */
export class LibraryError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// ── The shared cache of public game details ──

interface GameRow {
  key: string; kind: 'release' | 'tournament'; title: string; slug: string | null; url: string | null; thumb: string
  starts_on: string | null; ends_on: string | null; tba: boolean; platforms: string[]; genres: string[]; metacritic: number | null; prize: string | null
}
type Dated = GameRow & { w: Date | null; p: Date | null; c: Date | null }
const GAME = `g.key, g.kind, g.title, g.slug, g.url, g.thumb, to_char(g.starts_on, 'YYYY-MM-DD') as starts_on, to_char(g.ends_on, 'YYYY-MM-DD') as ends_on, g.tba, g.platforms, g.genres, g.metacritic, g.prize`
const DATES = 'l.wishlisted_at as w, l.played_at as p, l.completed_at as c'
/** Snapshots refresh daily while their date or score can move (upcoming, recent, undated), every two weeks once settled. */
const STALE = `g.refreshed_at < now() - (case when g.starts_on is null or g.starts_on > current_date - 60 then interval '1 day' else interval '14 days' end)`

const web = (u?: string) => (u && /^https?:\/\//.test(u) ? u : null)
const day = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)

/** What is kept of an event: its public face, no more. */
const toRow = (e: Ev): GameRow => ({
  key: e.id, kind: e.kind, title: e.title.slice(0, 300), slug: e.slug && /^[a-z0-9-]{1,200}$/i.test(e.slug) ? e.slug : null, url: web(e.url), thumb: web(e.thumb) ?? '',
  starts_on: day(e.start), ends_on: day(e.end), tba: !!e.tba, platforms: e.platforms, genres: e.genres.slice(0, 12),
  metacritic: Number.isInteger(e.metacritic) && e.metacritic! >= 0 && e.metacritic! <= 100 ? e.metacritic! : null, prize: e.prize?.slice(0, 40) ?? null,
})
const toEv = (r: GameRow): Ev => ({
  id: r.key, title: r.title, kind: r.kind, start: r.starts_on ?? '', thumb: r.thumb, shots: [], pop: 0,
  platforms: r.platforms.filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p)), genres: r.genres,
  ...(r.ends_on && r.ends_on !== r.starts_on && { end: r.ends_on }), ...(r.tba && { tba: true }), ...(r.slug && { slug: r.slug }), ...(r.url && { url: r.url }),
  ...(r.metacritic !== null && { metacritic: r.metacritic }), ...(r.prize && { prize: r.prize }),
})

/** Stores or refreshes snapshots in one statement; a score or artwork a refresh lacks is kept. */
export async function saveGames(evs: Ev[]) {
  const rows = [...new Map(evs.filter((e) => GAME_KEY.test(e.id)).map((e) => [e.id, toRow(e)])).values()]
  if (!rows.length) return
  await q(
    `insert into dd_game (key, kind, title, slug, url, thumb, starts_on, ends_on, tba, platforms, genres, metacritic, prize, refreshed_at)
     select x.key, x.kind, x.title, x.slug, x.url, x.thumb, x.starts_on, x.ends_on, x.tba, x.platforms, x.genres, x.metacritic, x.prize, now()
     from jsonb_to_recordset($1::jsonb) as x(key text, kind text, title text, slug text, url text, thumb text, starts_on date, ends_on date, tba boolean, platforms text[], genres text[], metacritic smallint, prize text)
     on conflict (key) do update set kind = excluded.kind, title = excluded.title, slug = excluded.slug, url = excluded.url, thumb = coalesce(nullif(excluded.thumb, ''), dd_game.thumb),
       starts_on = excluded.starts_on, ends_on = excluded.ends_on, tba = excluded.tba, platforms = excluded.platforms, genres = excluded.genres,
       metacritic = coalesce(excluded.metacritic, dd_game.metacritic), prize = coalesce(excluded.prize, dd_game.prize), refreshed_at = now()`,
    [JSON.stringify(rows)],
  )
}

const unknown = new Map<string, number>() // games no source knows, for ten minutes
type Calendar = Awaited<ReturnType<typeof getEvents>>

/** A game neither stored nor in the calendar: its details, 'gone' (nothing knows it), 'later' (unreachable) or 'busy' (hourly allowance spent). */
async function lookup(userId: string, key: string, calendar: Calendar): Promise<Ev | 'gone' | 'later' | 'busy'> {
  if ((unknown.get(key) ?? 0) > Date.now()) return 'gone'
  if (key.startsWith('ps-')) return !calendar.error && !calendar.stale ? 'gone' : 'later' // tournaments exist only in the calendar
  if (!(await allow(`lookup:${userId}`, NEW_GAMES_PER_HOUR, 3600))) return 'busy'
  try {
    const ev = await fromSource(key)
    if (ev) return ev
  } catch { return 'later' }
  if (unknown.size > 500) unknown.clear()
  unknown.set(key, Date.now() + 600_000)
  return 'gone'
}

/** The game's snapshot, stored first if new. Null when nothing knows it; a LibraryError when it cannot be checked now. */
async function ensureGame(userId: string, key: string): Promise<Ev | null> {
  const [have] = await q<GameRow>(`select ${GAME} from dd_game g where g.key = $1`, [key])
  if (have) return toEv(have)
  const calendar = await getEvents()
  let ev: Ev | null = calendar.events.find((e) => e.id === key) ?? null
  if (!ev) {
    const found = await lookup(userId, key, calendar)
    if (found === 'gone') return null
    if (found === 'busy') throw new LibraryError(429, 'That is a lot of new games in an hour. Try again a little later.')
    if (found === 'later') throw new LibraryError(502, 'The game data did not load. Try again in a minute.')
    ev = found
  }
  await saveGames([ev])
  return toEv(toRow(ev))
}

/** Refreshes stale snapshots: from the live calendar now (free), the rest from their sources after the response. */
async function refresh(keys: string[]): Promise<Map<string, Ev>> {
  const fresh = new Map<string, Ev>()
  const calendar = await Promise.race([getEvents().catch(() => null), new Promise<null>((done) => setTimeout(done, 3000, null))])
  const byId = new Map((calendar?.events ?? []).map((e) => [e.id, e]))
  for (const k of keys) { const e = byId.get(k); if (e) fresh.set(k, toEv(toRow(e))) }
  await saveGames(keys.flatMap((k) => byId.get(k) ?? []))
  const rest = keys.filter((k) => !fresh.has(k)).slice(0, 6) // a few per visit: the data sources have quotas
  if (rest.length) after(async () => {
    for (const k of rest) {
      try {
        const e = await fromSource(k)
        if (e) await saveGames([e])
        else await q('update dd_game set refreshed_at = now() where key = $1', [k]) // gone from its source: stop asking every visit
      } catch {} // unreachable: ask again next visit
    }
  })
  return fresh
}

// ── Reading ──

/** Just the keys, newest first: what the buttons all over the site need. */
export async function libraryKeys(userId: string) {
  const rows = await q<{ game_key: string; w: Date | null; p: Date | null; c: Date | null }>(`select l.game_key, ${DATES} from dd_library l where l.user_id = $1`, [userId])
  const by = (f: 'w' | 'p' | 'c') => rows.filter((r) => r[f]).sort((a, b) => +b[f]! - +a[f]!).map((r) => r.game_key)
  return { wishlist: by('w'), played: by('p'), completed: by('c') }
}

/** The whole library with each game's details, for the profile page. */
export async function library(userId: string): Promise<LibItem[]> {
  const rows = await q<Dated & { stale: boolean }>(`select ${GAME}, ${DATES}, (${STALE}) as stale from dd_library l join dd_game g on g.key = l.game_key where l.user_id = $1`, [userId])
  const fresh = await refresh(rows.filter((r) => r.stale).map((r) => r.key)).catch(() => new Map<string, Ev>())
  return rows.map((r) => ({ ev: fresh.get(r.key) ?? toEv(r), ...(r.w && { wishlisted: r.w.toISOString() }), ...(r.p && { played: r.p.toISOString() }), ...(r.c && { completed: r.c.toISOString() }) }))
}

// ── Changing ──

// Turning a list on, as a new row and as an update. Played and completed take the game off the wishlist; completed also marks it played.
const ON = {
  wishlist: { values: 'now(), null::timestamptz, null::timestamptz', update: 'wishlisted_at = coalesce(dd_library.wishlisted_at, now())' },
  played: { values: 'null::timestamptz, now(), null::timestamptz', update: 'played_at = coalesce(dd_library.played_at, now()), wishlisted_at = null' },
  completed: { values: 'null::timestamptz, now(), now()', update: 'played_at = coalesce(dd_library.played_at, now()), completed_at = coalesce(dd_library.completed_at, now()), wishlisted_at = null' },
} as const
// Turning a list off. A row with neither a wishlist nor a played date goes; un-playing un-completes, un-completing keeps it played.
const OFF = {
  wishlist: ['update dd_library set wishlisted_at = null where user_id = $1 and game_key = $2 and played_at is not null', 'delete from dd_library where user_id = $1 and game_key = $2 and played_at is null'],
  played: ['update dd_library set played_at = null, completed_at = null where user_id = $1 and game_key = $2 and wishlisted_at is not null', 'delete from dd_library where user_id = $1 and game_key = $2 and wishlisted_at is null'],
  completed: ['update dd_library set completed_at = null where user_id = $1 and game_key = $2'],
} as const
const FLAGS = 'wishlisted_at is not null as wishlist, played_at is not null as played, completed_at is not null as completed'

/** Turns a list on or off for a game (see ON and OFF); tournaments can only be wishlisted. Returns the flags as stored. */
export async function setFlag(userId: string, key: string, list: ListName, on: boolean): Promise<{ flags: Flags; ev?: Ev }> {
  if (!GAME_KEY.test(key)) throw new LibraryError(400, 'That is not a game.')
  if (list !== 'wishlist' && key.startsWith('ps-')) throw new LibraryError(400, 'Only games can be marked as played or completed.')
  let ev: Ev | null = null
  if (on) {
    try { ev = await ensureGame(userId, key) } catch (e) {
      if (e instanceof LibraryError) throw e
      throw new LibraryError(502, 'The game data did not load. Try again in a minute.')
    }
    if (!ev) throw new LibraryError(404, 'We could not find that game.')
  }
  const change = () => tx(async (c) => {
    if (on) {
      const { rows } = await c.query<Flags>(
        `insert into dd_library (user_id, game_key, wishlisted_at, played_at, completed_at)
         select $1, $2, ${ON[list].values} where (select count(*) from dd_library where user_id = $1) < $3 or exists (select 1 from dd_library where user_id = $1 and game_key = $2)
         on conflict (user_id, game_key) do update set ${ON[list].update}
         returning ${FLAGS}`, [userId, key, LIMIT])
      if (!rows[0]) throw new LibraryError(409, `Your library is full (${LIMIT} games). Remove some to add more.`)
      return rows[0]
    }
    for (const sql of OFF[list]) await c.query(sql, [userId, key])
    const { rows } = await c.query<Flags>(`select ${FLAGS} from dd_library where user_id = $1 and game_key = $2`, [userId, key])
    return rows[0] ?? { wishlist: false, played: false, completed: false }
  })
  let flags: Flags
  try { flags = await change() } catch (e) {
    // the clean-up deleted this unused snapshot in between: store it again and retry once
    if (!(on && ev && (e as { code?: string }).code === '23503')) throw e
    await saveGames([ev])
    flags = await change()
  }
  return { flags, ...(ev && { ev }) }
}

/**
 * Hearts left in the browser before signing in become wishlist entries; nothing in the library changes. `done`: what the browser can
 * forget (now in the library, or unknown everywhere). The rest (a source down, the allowance spent, the library full) is tried again later.
 */
export async function merge(userId: string, keys: unknown): Promise<{ added: number; done: string[] }> {
  const given = (Array.isArray(keys) ? keys : []).filter((k): k is string => typeof k === 'string').slice(0, 500)
  const junk = given.filter((k) => !GAME_KEY.test(k))
  const wanted = [...new Set(given.filter((k) => GAME_KEY.test(k)))]
  if (!wanted.length) return { added: 0, done: junk }
  const have = new Set((await q<{ key: string }>('select key from dd_game where key = any($1::text[])', [wanted])).map((r) => r.key))
  const missing = wanted.filter((k) => !have.has(k)), gone = new Set<string>()
  if (missing.length) {
    const calendar = await getEvents(), byId = new Map(calendar.events.map((e) => [e.id, e]))
    const found = missing.flatMap((k) => byId.get(k) ?? [])
    // what the calendar no longer holds comes from its source: at most 20 at once, within the hourly allowance
    await Promise.all(missing.filter((k) => !byId.has(k)).slice(0, 20).map(async (k) => {
      const r = await lookup(userId, k, calendar)
      if (r === 'gone') gone.add(k)
      else if (typeof r === 'object') found.push(r)
    }))
    await saveGames(found)
  }
  const inserted = await q(
    `with room as (select greatest(0, $3::int - count(*)::int) as n from dd_library where user_id = $1)
     insert into dd_library (user_id, game_key, wishlisted_at)
     select $1, k, now() from unnest($2::text[]) as k where exists (select 1 from dd_game where key = k) limit (select n from room)
     on conflict do nothing returning 1`, [userId, wanted, LIMIT])
  const mine = new Set((await q<{ game_key: string }>('select game_key from dd_library where user_id = $1 and game_key = any($2::text[])', [userId, wanted])).map((r) => r.game_key))
  return { added: inserted.length, done: [...junk, ...wanted.filter((k) => mine.has(k) || gone.has(k))] }
}

// ── Your data ──

/** Everything held about an account, as a person can read it. */
export async function exportData(user: { id: string; email: string; since: string }) {
  const [accounts, sessions, rows, [who]] = await Promise.all([
    q<{ providerId: string; accountId: string; createdAt: Date }>('select "providerId", "accountId", "createdAt" from "account" where "userId" = $1 order by "createdAt"', [user.id]),
    q<{ createdAt: Date; updatedAt: Date; expiresAt: Date }>('select "createdAt", "updatedAt", "expiresAt" from "session" where "userId" = $1 order by "createdAt"', [user.id]),
    q<Dated>(`select ${GAME}, ${DATES} from dd_library l join dd_game g on g.key = l.game_key where l.user_id = $1`, [user.id]),
    q<{ updatedAt: Date }>('select "updatedAt" from "user" where "id" = $1', [user.id]),
  ])
  const providers = accounts.filter((a) => a.providerId !== 'credential')
  const list = (f: 'w' | 'p') => rows.filter((r) => r[f]).sort((a, b) => +b[f]! - +a[f]!).map((r) => ({
    id: r.key, title: r.title, type: r.kind, releaseDate: r.starts_on, metacritic: r.metacritic, addedAt: r[f]!.toISOString(), ...(f === 'p' && { completedAt: r.c?.toISOString() ?? null }),
  }))
  return {
    about: 'A copy of everything stored for this account: the email address, when the account was made and last used, the sign-in providers linked to it (with the identifier each one gave us), the browsers signed in, and the games you wishlisted or marked as played (each with the date and time you did it, and for a played game the date and time you marked it as completed, if you did). Nothing else is stored: no name, photo, IP address or device details. A scrambled sign-in code exists for ten minutes after you ask for one; it is not listed here because it cannot be read back.',
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email, createdAt: user.since, lastUsedAt: who?.updatedAt.toISOString() ?? null,
      signInMethods: ['email code', ...new Set(providers.map((a) => a.providerId))],
      linkedProviders: providers.map((a) => ({ provider: a.providerId, providerAccountId: a.accountId, linkedAt: a.createdAt.toISOString() })),
    },
    sessions: sessions.map((s) => ({ signedInAt: s.createdAt.toISOString(), lastUsedAt: s.updatedAt.toISOString(), expiresAt: s.expiresAt.toISOString() })),
    wishlist: list('w'),
    played: list('p'),
  }
}

/** Deletes the account; sessions, linked providers and the library go with the user row. */
export async function deleteAccount(user: { id: string; email: string }) {
  await tx(async (c) => {
    await c.query('delete from "verification" where "identifier" = any($1::text[])', [['sign-in', 'email-verification', 'forget-password'].map((t) => `${t}-otp-${user.email}`)])
    await c.query('delete from "user" where "id" = $1', [user.id])
  })
  await q('delete from dd_throttle where key = $1', [hashKey(`otp:${mailbox(user.email)}`)]).catch(() => {})
}

/** The daily clean-up: nothing personal outlives its purpose. A failing step never stops the others; `failed` counts them. */
export async function prune() {
  const count = (sql: string, params: unknown[] = []) => async () => (await q<{ n: number }>(`with d as (${sql} returning 1) select count(*)::int as n from d`, params))[0].n
  const steps = {
    inactiveAccounts: count(`delete from "user" where "updatedAt" < now() - make_interval(months => $1)`, [INACTIVE_MONTHS]),
    expiredSessions: count('delete from "session" where "expiresAt" < now()'),
    expiredCodes: count('delete from "verification" where "expiresAt" < now()'),
    oldCounters: count(`delete from dd_throttle where started_at < now() - interval '1 day'`),
    unusedGames: count(`delete from dd_game g where g.refreshed_at < now() - interval '30 days' and not exists (select 1 from dd_library l where l.game_key = g.key)`),
  }
  const out: Record<string, number | null> = {}
  let failed = 0
  for (const [name, run] of Object.entries(steps)) {
    try { out[name] = await run() } catch (e) {
      failed++
      out[name] = null
      console.error(`[dropdate] clean-up step ${name} failed:`, e instanceof Error ? e.message : e)
    }
  }
  return { ...out, failed }
}
