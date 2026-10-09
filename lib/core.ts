// Shared by the server and the browser: types, dates and calendar export. The search lives in search.ts.

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://dropdate.net').replace(/\/$/, '')
export const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Nintendo', 'Mobile'] as const
export type Platform = (typeof PLATFORMS)[number]
export type Kind = 'release' | 'tournament'

export interface Ev {
  id: string; title: string; kind: Kind; start: string; end?: string // YYYY-MM-DD, end inclusive
  slug?: string; url?: string // releases open /game/[slug], tournaments their own page
  thumb: string; shots: string[]; image?: string // card artwork ('' if none), hover frames, large artwork (hero only)
  platforms: Platform[]; genres: string[]; rating?: number; metacritic?: number; pop: number; prize?: string; tba?: boolean
}
export interface Payload { events: Ev[]; today: string; updated: string; stale: boolean; error?: string; sources?: Record<string, number> }
export interface Game {
  id: string; slug: string; name: string; description?: string; released?: string; website?: string; image?: string
  rating?: number; metacritic?: number; esrb?: string; playtime?: number; trailer?: { preview: string; src: string }
  genres: string[]; tags: string[]; platforms: string[]; developers: string[]; publishers: string[]; screenshots: string[]; stores: { name: string; url: string }[]
}

// ── Dates: calendar days as YYYY-MM-DD, in local time ──────────────────

const p2 = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const toDate = (s: string, days = 0) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + days)
export const shift = (s: string, days: number) => iso(toDate(s, days))
export const gap = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5)
/** A date formatter, built once on first use: every card formats dates, and building one is the slow part. */
const fmt = (o: Intl.DateTimeFormatOptions) => {
  let f: Intl.DateTimeFormat | undefined
  return (s: string) => (f ??= new Intl.DateTimeFormat('en-US', o)).format(toDate(s))
}
const md = fmt({ month: 'short', day: 'numeric' }), mdy = fmt({ month: 'short', day: 'numeric', year: 'numeric' }), my = fmt({ month: 'long', year: 'numeric' })
export const range = (a: string, b?: string) => (!b || b === a ? mdy(a) : `${(a.slice(0, 4) === b.slice(0, 4) ? md : mdy)(a)} – ${mdy(b)}`)
export const longDate = fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const monthLabel = (month: string) => my(`${month}-01`)
export const monthShort = fmt({ month: 'short' })
export const weekday = fmt({ weekday: 'long' })

export function status(e: Pick<Ev, 'kind' | 'start' | 'end'>, today: string) {
  const rel = e.kind === 'release', d = gap(today, e.start)
  if ((e.end ?? e.start) < today) return { label: rel ? 'Out now' : 'Ended', tone: 'past' as const }
  if (d <= 0) return { label: rel ? 'Out today' : 'Live now', tone: 'live' as const }
  if (d === 1) return { label: 'Tomorrow', tone: 'soon' as const }
  return { label: d < 60 ? `In ${d} days` : `In ${Math.round(d / 30)} months`, tone: d <= 7 ? ('soon' as const) : ('future' as const) }
}

export function ago(time: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(time).getTime()) / 6e4))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export const lite = ({ image: _, ...e }: Ev): Ev => e // large artwork stays on the server unless the hero needs it
export const href = (e: Pick<Ev, 'slug' | 'url'>) => (e.slug ? `/game/${e.slug}` : (e.url ?? '#'))
export const scoreTone = (n: number) => (n >= 75 ? 'bg-emerald-500 text-black' : n >= 50 ? 'bg-amber-400 text-black' : 'bg-rose-500 text-white')
/** Smaller renditions of large artwork, for srcset: RAWG resizes, Steam screenshot sizes. */
export function srcSet(u?: string) {
  if (u?.includes('/resize/1920/-/')) return [640, 1280, 1920].map((w) => `${u.replace('/1920/', `/${w}/`)} ${w}w`).join(', ')
  if (u?.includes('.1920x1080.')) return `${u.replace('.1920x1080.', '.600x338.')} 600w, ${u} 1920w`
}

// ── Calendar export ─────────────────────────────────────────────────────

const ymd = (s: string) => s.replace(/-/g, '')
const until = (e: Pick<Ev, 'start' | 'end'>) => ymd(shift(e.end ?? e.start, 1)) // all-day ends are exclusive
const link = (e: Pick<Ev, 'slug' | 'url'>) => (e.slug ? `${SITE}/game/${e.slug}` : (e.url ?? SITE))

const fold75 = (line: string) => { // long lines continue on the next line after a space, at most 75 bytes each (RFC 5545)
  let out = '', bytes = 0
  for (const ch of line) {
    const n = ch.charCodeAt(0) < 0x80 ? 1 : ch.charCodeAt(0) < 0x800 ? 2 : ch.length > 1 ? 4 : 3
    if (bytes + n > 75) { out += '\r\n '; bytes = 1 }
    out += ch
    bytes += n
  }
  return out
}

export function ics(events: Ev[]) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dropdate//EN', 'X-WR-CALNAME:Dropdate', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...events.flatMap((e) => ['BEGIN:VEVENT', `UID:${e.id}@dropdate`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${until(e)}`, `SUMMARY:${esc(e.title)}`, `URL:${link(e)}`, 'END:VEVENT']),
    'END:VCALENDAR', ''].map(fold75).join('\r\n')
}

/** A calendar feed address as calendar apps want it to subscribe. */
export const webcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://')
export const googleUrl = (e: Pick<Ev, 'title' | 'start' | 'end' | 'slug' | 'url'>) =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${ymd(e.start)}/${until(e)}`, details: link(e) })}`

// ── Accounts (shared by the server and the browser) ─────────────────────

/** Whether this build has accounts: the generator sets it when a database is configured. Without one the site works as before, with the list kept in the browser. */
export const ACCOUNTS = process.env.NEXT_PUBLIC_ACCOUNTS === '1'
/** What a person can mark on a game: put it on the wishlist, mark it played, mark it completed. Completed is not a list of its own: it is a mark on a played game. */
export const LISTS = ['wishlist', 'played', 'completed'] as const
export type ListName = (typeof LISTS)[number]
/** The two lists the profile shows: what is coming, and what has been played (completed or not). */
export const TABS = ['wishlist', 'played'] as const
export type TabName = (typeof TABS)[number]
/** How the calendar names a game or tournament: rawg-123, steam-456, ps-789. */
export const GAME_KEY = /^(?:rawg|steam|ps)-\d{1,12}$/
/** What someone has marked: a played game can also be wishlisted again to replay it, and a completed game is always played. */
export interface Flags { wishlist: boolean; played: boolean; completed: boolean }
/** A game in someone's library: its public details, and when they wishlisted it, marked it played and marked it completed. */
export interface LibItem { ev: Ev; wishlisted?: string; played?: string; completed?: string }
/**
 * What a change does to a game's flags, by the rules the server applies (the browser shows it at once, then takes the server's answer).
 * Marking a game played or completed takes it off the wishlist (it is done); completing it marks it played too;
 * un-marking it as played also un-completes it; un-completing keeps it played.
 */
export function afterChange(f: Flags, list: ListName, on: boolean): Flags {
  if (list === 'wishlist') return { ...f, wishlist: on }
  if (list === 'played') return on ? { wishlist: false, played: true, completed: f.completed } : { wishlist: f.wishlist, played: false, completed: false }
  return on ? { wishlist: false, played: true, completed: true } : { ...f, completed: false }
}
/**
 * A same-site path to return to after signing in. Anything else (another site, //host, backslashes, the sign-in page itself) falls back.
 * No control characters, spaces or non-ASCII either: browsers drop tabs and newlines inside an address, so "/<tab>/evil.example" would mean "//evil.example".
 */
export const safeNext = (n?: string | null, fallback = '/profile') => (n && /^\/(?![/\\])(?!signin(?:[/?#]|$))[^\x00-\x20\x7f-\uffff\\]*$/.test(n) ? n : fallback)
/** "March 2026" for a timestamp: when someone joined. */
export const monthYear = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(iso))

// ── Browse: every game RAWG knows, filtered and in pages (shared by the page and its filters) ──

/** RAWG's genres: [the name in its address, the name shown]. */
export const GENRES: readonly (readonly [string, string])[] = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['role-playing-games-rpg', 'RPG'], ['shooter', 'Shooter'], ['strategy', 'Strategy'], ['simulation', 'Simulation'],
  ['puzzle', 'Puzzle'], ['platformer', 'Platformer'], ['racing', 'Racing'], ['sports', 'Sports'], ['fighting', 'Fighting'], ['indie', 'Indie'], ['arcade', 'Arcade'],
  ['casual', 'Casual'], ['massively-multiplayer', 'Massively multiplayer'], ['family', 'Family'], ['card', 'Card'], ['board-games', 'Board games'], ['educational', 'Educational'],
]
export const BROWSE_SORTS = { popular: 'Most popular', score: 'Best reviewed', newest: 'Newest', oldest: 'Oldest', name: 'A to Z' } as const
export type BrowseSort = keyof typeof BROWSE_SORTS
/** Games per page, and how many pages one search can go through: past that, a year, a platform or a genre narrows it down. */
export const BROWSE_PAGE = 40, BROWSE_PAGES = 25
export const FIRST_YEAR = 1970
export interface BrowseQuery { q: string; year: string; platform: Platform | ''; genre: string; sort: BrowseSort; page: number }

/** What an address asks for, checked against what exists: anything else is ignored, so only a small set of questions ever reaches the data source. */
export function parseBrowse(raw: Record<string, string | string[] | undefined>, thisYear: number): BrowseQuery {
  const one = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v[0] : v) ?? '' }
  const year = /^\d{4}$/.test(one('year')) && +one('year') >= FIRST_YEAR && +one('year') <= thisYear + 2 ? one('year') : ''
  const sort = (Object.keys(BROWSE_SORTS) as BrowseSort[]).find((s) => s === one('sort')) ?? 'popular'
  return {
    q: one('q').replace(/\s+/g, ' ').trim().slice(0, 60), year, platform: PLATFORMS.find((p) => p === one('platform')) ?? '',
    genre: GENRES.find(([slug]) => slug === one('genre'))?.[0] ?? '', sort, page: Math.min(BROWSE_PAGES, Math.max(1, Math.floor(+one('page')) || 1)),
  }
}
/** The address of a browse page; what is on its default is left out. */
export function browseHref(q: Partial<BrowseQuery>) {
  const p = new URLSearchParams()
  if (q.q) p.set('q', q.q)
  if (q.year) p.set('year', q.year)
  if (q.platform) p.set('platform', q.platform)
  if (q.genre) p.set('genre', q.genre)
  if (q.sort && q.sort !== 'popular') p.set('sort', q.sort)
  if (q.page && q.page > 1) p.set('page', String(q.page))
  const s = p.toString()
  return s ? `/browse?${s}` : '/browse'
}
