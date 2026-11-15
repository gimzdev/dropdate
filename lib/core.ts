// Shared by the server and the browser: types, dates, calendar export, accounts and browse helpers. The search is in search.ts.

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://dropdate.net').replace(/\/$/, '')
/** Where people can support Dropdate: the header, the footer and the notes in components/support.tsx link here */
export const PATREON = 'https://www.patreon.com/gimzdev'
export const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Nintendo', 'Mobile'] as const
export type Platform = (typeof PLATFORMS)[number]
export type Kind = 'release' | 'tournament'

export interface Ev {
  id: string; title: string; kind: Kind; start: string; end?: string // YYYY-MM-DD, end inclusive
  slug?: string; url?: string // a release opens /game/[slug], a tournament its own page
  thumb: string; shots?: string[]; image?: string // card artwork ('' if none), hover frames, large artwork (hero only)
  platforms: Platform[]; genres: string[]; rating?: number; metacritic?: number; pop: number; prize?: string
  tba?: boolean; span?: Span // tba: no day yet, `start` is the last day of its month; span: not even a month, `start` is the last day of that quarter or year
}
export type Span = 'quarter' | 'year'
/** A game found by name anywhere, calendar or not. undated: the source gives no date (the game may be out). */
export interface Found { key: string; slug: string; title: string; released?: string; tba?: boolean; span?: Span; thumb: string; metacritic?: number; undated?: boolean }
export interface Payload { events: Ev[]; today: string; updated: string; stale: boolean; error?: string; sources?: Record<string, number> }
export interface Game {
  id: string; slug: string; name: string; description?: string; released?: string; website?: string; image?: string
  loose?: { start: string; span?: Span } // a first release known only by its month, quarter or year (`released` is an exact day)
  rating?: number; metacritic?: number; scoreFrom?: string; age?: string; playtime?: number
  trailer?: { preview?: string; src?: string; youtube?: string } // a video file (Steam) or a YouTube id (IGDB)
  genres: string[]; tags: string[]; platforms: string[]; developers: string[]; publishers: string[]; screenshots: string[]; stores: { name: string; url: string }[]
}

/** Steam's names for the genres IGDB also has, in IGDB's words: the calendar lists each genre once. A feed made with Steam's word still works. */
const GENRE_NAMES: Record<string, string> = { RPG: 'Role-playing (RPG)', Simulation: 'Simulator', Sports: 'Sport' }
export const genreName = (g: string) => (Object.hasOwn(GENRE_NAMES, g) ? GENRE_NAMES[g] : g)

// ── Dates: calendar days as YYYY-MM-DD, local time ──

const p2 = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
export const toDate = (s: string, days = 0) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + days)
export const shift = (s: string, days: number) => iso(toDate(s, days))
export const gap = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5)
const fmt = (o: Intl.DateTimeFormatOptions) => {
  let f: Intl.DateTimeFormat | undefined
  return (s: string) => (f ??= new Intl.DateTimeFormat('en-US', o)).format(s.length > 10 ? new Date(s) : toDate(s))
}
const md = fmt({ month: 'short', day: 'numeric' }), mdy = fmt({ month: 'short', day: 'numeric', year: 'numeric' })
export const range = (a: string, b?: string) => (!b || b === a ? mdy(a) : `${(a.slice(0, 4) === b.slice(0, 4) ? md : mdy)(a)} – ${mdy(b)}`)
export const longDate = fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const monthYear = fmt({ month: 'long', year: 'numeric' })
export const monthLabel = (month: string) => monthYear(`${month}-01`)
export const monthShort = fmt({ month: 'short' })
export const weekday = fmt({ weekday: 'long' })

/** What a date without a day is called: "November 2026", "Q4 2026" or "2026". */
export const period = (e: Pick<Ev, 'start' | 'span'>) =>
  e.span === 'year' ? e.start.slice(0, 4) : e.span === 'quarter' ? `Q${Math.ceil(+e.start.slice(5, 7) / 3)} ${e.start.slice(0, 4)}` : monthLabel(e.start.slice(0, 7))
/** The same in a few letters, under "TBA": "Nov", "Q4" or "2026". */
export const periodShort = (e: Pick<Ev, 'start' | 'span'>) =>
  e.span === 'year' ? e.start.slice(0, 4) : e.span === 'quarter' ? `Q${Math.ceil(+e.start.slice(5, 7) / 3)}` : monthShort(e.start)

export function status(e: Pick<Ev, 'kind' | 'start' | 'end' | 'tba' | 'span'>, today: string) {
  const rel = e.kind === 'release', d = gap(today, e.start)
  if ((e.end ?? e.start) < today) return { label: rel ? 'Out now' : 'Ended', tone: 'past' as const }
  if (e.tba) return { label: period(e), tone: 'future' as const } // no day to count down to: the month, quarter or year it is set for
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
/** The same picture in the sizes its source offers, for `srcSet`: with `sizes`, a small slot or a phone loads a small file. */
export function srcSet(u?: string) {
  if (u?.includes('/t_1080p/')) return `${u.replace('/t_1080p/', '/t_screenshot_big/')} 889w, ${u.replace('/t_1080p/', '/t_720p/')} 1280w, ${u} 1920w`
  if (u?.includes('/t_screenshot_big/')) return `${u.replace('/t_screenshot_big/', '/t_screenshot_med/')} 569w, ${u} 889w` // card artwork: 569 px is enough for most slots
  if (u?.includes('.1920x1080.')) return `${u.replace('.1920x1080.', '.600x338.')} 600w, ${u} 1920w`
}

// ── Calendar export ──

const ymd = (s: string) => s.replace(/-/g, '')
const until = (e: Pick<Ev, 'start' | 'end'>) => ymd(shift(e.end ?? e.start, 1)) // all-day ends are exclusive
const link = (e: Pick<Ev, 'slug' | 'url'>) => (e.slug ? `${SITE}/game/${e.slug}` : (e.url ?? SITE))
/** An event's name in a calendar. A release without a day sits on the last day of its month there, so its name says what is known. */
export const calTitle = (e: Pick<Ev, 'title' | 'start' | 'tba' | 'span'>) => (e.tba && e.start ? `${e.title} (${period(e)}, ${e.span ? 'date' : 'day'} not announced)` : e.title)
/** Long lines go on over several, at most 75 bytes each (RFC 5545). */
function fold75(line: string) {
  let out = '', bytes = 0
  for (const ch of line) {
    const c = ch.charCodeAt(0), n = c < 0x80 ? 1 : c < 0x800 ? 2 : ch.length > 1 ? 4 : 3
    if (bytes + n > 75) { out += '\r\n '; bytes = 1 }
    out += ch
    bytes += n
  }
  return out
}
/** Text in a calendar file: no control characters, line breaks as \n, and \ ; , escaped (RFC 5545, 3.3.11). */
const icsText = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
/** A link in a calendar file: one line, whatever the source sent. */
const icsUrl = (u: string) => u.replace(/[\x00-\x20\x7f]/g, (c) => encodeURIComponent(c))
/** What a calendar shows when the event is opened: platforms and genres (a tournament: its game and prize pool), then the page. */
function icsNotes(e: Ev) {
  const facts = e.kind === 'tournament' ? [e.genres[0], e.prize && `Prize pool ${e.prize}`] : [e.platforms.join(', '), e.genres.slice(0, 3).join(', ')]
  return [...(e.tba && e.start ? [`Set for ${period(e)}. The ${e.span ? 'date' : 'day'} is not announced yet.`] : []), facts.filter(Boolean).join(' · '), icsUrl(link(e))].filter(Boolean).join('\n')
}
/**
 * The calendar feed (RFC 5545): all-day events without a time zone, so a release is on its day wherever the calendar is read.
 * UIDs never change for an event. `at`: when the data was last read from its sources (DTSTAMP). `name`: what calendar apps call the feed.
 */
export function ics(events: Ev[], at: string | Date = new Date(), name = 'Dropdate') {
  const time = new Date(at), stamp = (Number.isNaN(time.getTime()) ? new Date() : time).toISOString().replace(/[-:]|\.\d{3}/g, '')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dropdate//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(name)}`, `NAME:${icsText(name)}`,
    'X-WR-CALDESC:Game releases and esports tournaments from dropdate.net', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ...events.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start)).flatMap((e) => ['BEGIN:VEVENT', `UID:${icsText(e.id)}@dropdate`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${until(e)}`,
      `SUMMARY:${icsText(calTitle(e))}`, `DESCRIPTION:${icsText(icsNotes(e))}`, `URL:${icsUrl(link(e))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT']),
    'END:VCALENDAR', ''].map(fold75).join('\r\n')
}
export const webcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://')
export const googleUrl = (e: Pick<Ev, 'title' | 'start' | 'end' | 'slug' | 'url' | 'tba' | 'span'>) =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: calTitle(e), dates: `${ymd(e.start)}/${until(e)}`, details: link(e) })}`

// ── Accounts ──

export const ACCOUNTS = process.env.NEXT_PUBLIC_ACCOUNTS === '1'
export const LISTS = ['wishlist', 'played', 'completed'] as const
export type ListName = (typeof LISTS)[number]
export const TABS = ['wishlist', 'played'] as const
export type TabName = (typeof TABS)[number]
export const GAME_KEY = /^(?:steam|igdb|ps)-\d{1,12}$/
export interface Flags { wishlist: boolean; played: boolean; completed: boolean }
export interface LibItem { ev: Ev; wishlisted?: string; played?: string; completed?: string; tell?: string }
/** The server's rules: played or completed leaves the wishlist, completing plays, un-playing un-completes. */
export function afterChange(f: Flags, list: ListName, on: boolean): Flags {
  if (list === 'wishlist') return { ...f, wishlist: on }
  if (list === 'played') return on ? { wishlist: false, played: true, completed: f.completed } : { wishlist: f.wishlist, played: false, completed: false }
  return on ? { wishlist: false, played: true, completed: true } : { ...f, completed: false }
}
/** "Tell me" (lib/tell.ts) is for a release still ahead (after today), or without a day yet. */
export const canTell = (e: Pick<Ev, 'kind' | 'start' | 'tba'>, today: string) => e.kind === 'release' && (!e.start || !!e.tba || e.start > today)
/** A same-site path to go back to after signing in: no //, backslashes, control or non-ASCII characters ("/<tab>/evil" is "//evil"). */
export const safeNext = (n?: string | null, fallback = '/profile') => (n && /^\/(?![/\\])(?!signin(?:[/?#]|$))[^\x00-\x20\x7f-￿\\]*$/.test(n) ? n : fallback)

// ── What people type for a series ("gta", "cod", "botw") and what it is called ──

export const FRANCHISES: Record<string, string> = {
  gta: 'grand theft auto', gtav: 'grand theft auto v', gtasa: 'grand theft auto san andreas', cod: 'call of duty', rdr: 'red dead redemption', tlou: 'the last of us',
  botw: 'the legend of zelda breath of the wild', totk: 'the legend of zelda tears of the kingdom', loz: 'the legend of zelda', zelda: 'the legend of zelda',
  ac: 'assassins creed', ff: 'final fantasy', ffxiv: 'final fantasy xiv', re: 'resident evil', mgs: 'metal gear solid', nfs: 'need for speed', lol: 'league of legends',
  cs: 'counter strike', csgo: 'counter strike global offensive', wow: 'world of warcraft', dbd: 'dead by daylight', ssb: 'super smash bros', smash: 'super smash bros',
  mk: 'mortal kombat', sf: 'street fighter', bf: 'battlefield', gow: 'god of war', hzd: 'horizon zero dawn', dmc: 'devil may cry', lotr: 'the lord of the rings',
  kh: 'kingdom hearts', dq: 'dragon quest', smb: 'super mario bros', mc: 'minecraft', hk: 'hollow knight', ds: 'dark souls', er: 'elden ring', bg: 'baldurs gate',
  tw: 'total war', fm: 'football manager', pes: 'pro evolution soccer', hl: 'half life', l4d: 'left 4 dead', tf: 'team fortress', ow: 'overwatch', sw: 'star wars',
  kotor: 'star wars knights of the old republic', me: 'mass effect', da: 'dragon age', tes: 'the elder scrolls', eso: 'the elder scrolls online', fo: 'fallout',
  bl: 'borderlands', farcry: 'far cry', sh: 'silent hill', pd: 'payday', wd: 'watch dogs', pkmn: 'pokemon', cp: 'cyberpunk', sm: 'super mario', dkc: 'donkey kong country',
  ttt: 'tony hawk', thps: 'tony hawk pro skater', fnaf: 'five nights at freddys', nms: 'no mans sky', mhw: 'monster hunter world', mh: 'monster hunter', ys: 'ys',
}
const ROMANS = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
/** The ways a name may be written, as typed first: "gta 5" is also "grand theft auto 5" and "grand theft auto v". */
export function expandQuery(q: string): string[] {
  const typed = q.replace(/\s+/g, ' ').trim()
  const t = typed.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^([a-z]+)(\d{1,2})$/, '$1 $2') // gta5 is gta 5
  const [head = '', ...rest] = t.split(' '), full = FRANCHISES[head], out = new Set<string>([typed])
  if (full) {
    const tail = rest.join(' '), n = /^\d{1,2}$/.test(tail) ? +tail : 0, r = ROMANS.indexOf(tail)
    if (!tail) out.add(full)
    else {
      out.add(`${full} ${tail}`)
      if (n >= 1 && n <= 10) out.add(`${full} ${ROMANS[n]}`)
      if (r > 0) out.add(`${full} ${r}`)
      out.add(full)
    }
  }
  return [...out].filter(Boolean)
}

// ── Browse: every game IGDB knows, filtered and in pages ──

export const GENRES: readonly (readonly [string, string])[] = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['rpg', 'RPG'], ['shooter', 'Shooter'], ['strategy', 'Strategy'], ['simulation', 'Simulation'],
  ['puzzle', 'Puzzle'], ['platformer', 'Platformer'], ['racing', 'Racing'], ['sports', 'Sports'], ['fighting', 'Fighting'], ['indie', 'Indie'], ['arcade', 'Arcade'],
  ['horror', 'Horror'], ['survival', 'Survival'], ['open-world', 'Open world'], ['visual-novel', 'Visual novel'], ['card-board', 'Card and board'], ['music', 'Music'],
]
export const BROWSE_SORTS = { popular: 'Most popular', score: 'Best reviewed', newest: 'Newest', oldest: 'Oldest', name: 'A to Z' } as const
export type BrowseSort = keyof typeof BROWSE_SORTS
export const BROWSE_PAGE = 40, BROWSE_PAGES = 25, FIRST_YEAR = 1970
export interface BrowseQuery { q: string; year: string; platform: Platform | ''; genre: string; sort: BrowseSort; page: number }

/** What an address asks for, checked against what exists: only a small set of questions ever reaches the source. */
export function parseBrowse(raw: Record<string, string | string[] | undefined>, thisYear: number): BrowseQuery {
  const one = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v[0] : v) ?? '' }, y = one('year')
  return {
    q: one('q').replace(/\s+/g, ' ').trim().slice(0, 60), year: /^\d{4}$/.test(y) && +y >= FIRST_YEAR && +y <= thisYear + 2 ? y : '',
    platform: PLATFORMS.find((p) => p === one('platform')) ?? '', genre: GENRES.find(([slug]) => slug === one('genre'))?.[0] ?? '',
    sort: (Object.keys(BROWSE_SORTS) as BrowseSort[]).find((s) => s === one('sort')) ?? 'popular', page: Math.min(BROWSE_PAGES, Math.max(1, Math.floor(+one('page')) || 1)),
  }
}
export function browseHref(q: Partial<BrowseQuery>) {
  const p = new URLSearchParams()
  for (const k of ['q', 'year', 'platform', 'genre'] as const) if (q[k]) p.set(k, q[k])
  if (q.sort && q.sort !== 'popular') p.set('sort', q.sort)
  if (q.page && q.page > 1) p.set('page', String(q.page))
  const s = p.toString()
  return s ? `/browse?${s}` : '/browse'
}

// ── Pages people search for (app/releases, app/esports): a month's releases, a platform's, an esports game's tournaments ──

export const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const
/** 2026-11 is /releases/2026/november. */
export const monthPath = (month: string) => `/releases/${month.slice(0, 4)}/${MONTHS[+month.slice(5, 7) - 1]}`
/** The month after (1) or before (-1) a YYYY-MM month. */
export const nextMonth = (month: string, n = 1) => iso(new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1)).slice(0, 7)
export const PLATFORM_PAGES: Record<string, Platform> = { pc: 'PC', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo', mobile: 'Mobile' }
export const platformPath = (p: Platform) => `/releases/${p.toLowerCase()}`
/** An esports game's address, from its name as PandaScore gives it: Counter-Strike is /esports/counter-strike. */
export const gameSlug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const esportsPath = (name: string) => `/esports/${gameSlug(name)}`
