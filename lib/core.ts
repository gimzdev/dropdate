// Shared by the server and the browser: types, dates, smart search, calendar export.

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
const fmt = (s: string, o: Intl.DateTimeFormatOptions) => toDate(s).toLocaleDateString('en-US', o)
const DAY = { month: 'short', day: 'numeric' } as const
export const range = (a: string, b?: string) =>
  !b || b === a ? fmt(a, { ...DAY, year: 'numeric' }) : `${fmt(a, a.slice(0, 4) === b.slice(0, 4) ? DAY : { ...DAY, year: 'numeric' })} – ${fmt(b, { ...DAY, year: 'numeric' })}`
export const longDate = (s: string) => fmt(s, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const monthLabel = (month: string) => fmt(`${month}-01`, { month: 'long', year: 'numeric' })
export const monthShort = (s: string) => fmt(s, { month: 'short' })
export const weekday = (s: string, long = false) => fmt(s, { weekday: long ? 'long' : 'short' })

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

// ── Smart search: plain-English filters, then typo-tolerant text ───────

export interface Chip { label: string; raw: string }
export interface Parsed { kinds: Kind[]; platforms: Platform[]; range?: [string, string]; past: boolean; text: string; chips: Chip[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const SHORT = new Map(Object.entries({ jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }))
/** A month from one word: its short name (oct), the name typed so far (octo) or a typo of it (ocotber, octobre). */
function monthOf(w: string) {
  w = w.toLowerCase()
  return SHORT.get(w) ?? (w.length < 4 ? -1 : MONTHS.findIndex((m) => m.startsWith(w) || (w.length > 4 && m.length > 5 && dist(w, m, 1) <= 1)))
}
const SEASONS = new Map(Object.entries({ spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 }))
const ALIASES: Record<string, string> = { fps: 'shooter', tps: 'shooter', mmo: 'massively multiplayer', mmorpg: 'massively multiplayer', sim: 'simulation', jrpg: 'rpg', arpg: 'rpg', moba: 'strategy' }
const KINDS: [Kind, string, RegExp][] = [
  ['release', 'Releases', /\b(?:releases?|launch(?:es)?|drops?|games?)\b/i],
  ['tournament', 'Tournaments', /\b(?:tournaments?|esports?|majors?|championships?|cups?|finals?)\b/i],
]
const WORDS: [Platform, RegExp][] = [
  ['PC', /\b(?:pc|steam|windows)\b/i], ['PlayStation', /\b(?:ps[345]|playstation)\b/i], ['Xbox', /\b(?:xbox|series\s+[xs])\b/i],
  ['Nintendo', /\b(?:switch(?:\s*2)?|nintendo)\b/i], ['Mobile', /\b(?:mobile|ios|android)\b/i],
]
const STOP = new Set('in on for the a an of and show me find what new all any to from are is'.split(' '))

export function parse(input: string, today: string): Parsed {
  const t = toDate(today), Y = t.getFullYear(), M = t.getMonth(), mon = t.getDate() - ((t.getDay() + 6) % 7)
  const out: Parsed = { kinds: [], platforms: [], past: false, text: '', chips: [] }
  let rest = ` ${input} `
  const cut = (m: RegExpMatchArray, label: string) => { // removes the phrase from the text and shows it as a chip
    rest = `${rest.slice(0, m.index)} ${rest.slice((m.index ?? 0) + m[0].length)}`
    out.chips.push({ label, raw: m[0].trim() })
  }
  const take = (re: RegExp, label: string) => { const m = rest.match(re); if (m) cut(m, label); return m }
  const d = (y: number, m: number, day: number) => iso(new Date(y, m, day))
  const WHEN: [RegExp, string, [string, string]][] = [
    [/\btoday\b/i, 'Today', [today, today]], [/\btomorrow\b/i, 'Tomorrow', [shift(today, 1), shift(today, 1)]],
    [/\bnext\s+weekend\b/i, 'Next weekend', [d(Y, M, mon + 12), d(Y, M, mon + 13)]], [/\b(?:this\s+)?weekend\b/i, 'This weekend', [d(Y, M, mon + 5), d(Y, M, mon + 6)]],
    [/\bnext\s+week\b/i, 'Next week', [d(Y, M, mon + 7), d(Y, M, mon + 13)]], [/\bthis\s+week\b/i, 'This week', [d(Y, M, mon), d(Y, M, mon + 6)]],
    [/\b(?:this|next)\s+fortnight\b/i, 'Next 2 weeks', [today, shift(today, 13)]],
    [/\bnext\s+month\b/i, 'Next month', [d(Y, M + 1, 1), d(Y, M + 2, 0)]], [/\bthis\s+month\b/i, 'This month', [d(Y, M, 1), d(Y, M + 1, 0)]],
    [/\bnext\s+year\b/i, 'Next year', [d(Y + 1, 0, 1), d(Y + 1, 11, 31)]], [/\bthis\s+year\b/i, 'This year', [d(Y, 0, 1), d(Y, 11, 31)]],
  ]
  const days = rest.match(/\b(?:in\s+the\s+|in\s+)?next\s+(\d{1,3})\s+(day|week|month)s?\b/i) // "next 30 days"
  if (days) { cut(days, `Next ${days[1]} ${days[2]}s`); out.range = [today, shift(today, +days[1] * { day: 1, week: 7, month: 30 }[days[2].toLowerCase() as 'day'] - 1)] }
  for (const [re, label, span] of out.range ? [] : WHEN) if (take(re, label)) { out.range = span; break }
  const quarter = out.range ? null : rest.match(/\bq([1-4])(?:\s+(20\d\d))?\b/i)
  if (quarter) {
    const n = +quarter[1] - 1, y = quarter[2] ? +quarter[2] : n * 3 + 2 < M ? Y + 1 : Y
    cut(quarter, `Q${n + 1} ${y}`)
    out.range = [d(y, n * 3, 1), d(y, n * 3 + 3, 0)]
  }
  const season = out.range ? null : rest.match(/\b(?:this|next|in)\s+(?:the\s+)?(spring|summer|fall|autumn|winter)\b/i) // "fall" alone stays a title word
  if (season) {
    const from = SEASONS.get(season[1].toLowerCase()) ?? 0
    let y = from === 11 && M < 2 ? Y - 1 : Y
    if (d(y, from + 3, 0) < today) y++
    cut(season, `${season[1][0].toUpperCase()}${season[1].slice(1).toLowerCase()} ${y}`)
    out.range = [d(y, from, 1), d(y, from + 3, 0)]
  }
  const named = out.range ? undefined : [...rest.matchAll(/\b(?:(?:in|during|for)\s+)?([a-z]{3,10})\b(?:\s+(20\d\d))?/gi)].find((x) => monthOf(x[1]) >= 0)
  if (named) {
    const i = monthOf(named[1]), y = named[2] ? +named[2] : d(Y, i + 1, 0) < shift(today, -60) ? Y + 1 : Y // a month we hold recent releases for stays this year
    cut(named, new Date(y, i, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
    out.range = [d(y, i, 1), d(y, i + 1, 0)]
  } else if (!out.range) {
    const y = rest.match(/\b(?:in\s+)?(20\d\d)\b/i)?.[1] // a year close to now; "cyberpunk 2077" stays a title
    if (y && Math.abs(+y - Y) < 6 && take(new RegExp(`\\b(?:in\\s+)?${y}\\b`, 'i'), y)) out.range = [`${y}-01-01`, `${y}-12-31`]
  }
  if (take(/\b(?:past|ended|previous)\b/i, 'Past')) out.past = true
  for (const [kind, label, re] of KINDS) while (take(re, label)) if (!out.kinds.includes(kind)) out.kinds.push(kind)
  for (const [p, re] of WORDS) while (take(re, p)) if (!out.platforms.includes(p)) out.platforms.push(p)
  out.text = rest.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase())).join(' ')
  return out
}

export const removeChip = (q: string, c: Chip) =>
  q.replace(new RegExp(`\\b${c.raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ').replace(/\s+/g, ' ').trim()

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ'’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Edit distance counting swapped letters as one edit; gives up as soon as it passes `max`. */
function dist(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let older: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], older[j - 2] + 1)
    }
    if (Math.min(...cur) > max) return max + 1
    ;[older, prev] = [prev, cur]
  }
  return prev[b.length]
}

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }

/** Every word must land in the title or genres: as text, as the title's initials (gta, re4), or within a typo or two. */
function hit(e: Ev, words: string[]) {
  const title = fold(e.title).split(' '), initials = title.map((w) => ROMAN[w] ?? w[0]).join('')
  const hay = [...title, ...title.flatMap((w) => ROMAN[w] ?? []), fold(e.genres.join(' '))].join(' '), parts = hay.split(' ')
  return words.every((w) => {
    const max = w.length > 7 ? 2 : 1
    return hay.includes(w) || (ALIASES[w] && hay.includes(ALIASES[w])) || (w.length > 1 && initials.includes(w)) || (w.length > 3 && parts.some((p) => dist(w, p, max) <= max || dist(w, p.slice(0, w.length), 1) <= 1))
  })
}

export interface Opts { kind?: Kind | 'all'; platform?: Platform | 'all'; genre?: string; from?: string; to?: string; past?: boolean }

/** Plain English + fuzzy filter, shared by the site and the API. Upcoming first, or most recent first for past events. */
export function search(events: Ev[], q: string, today: string, o: Opts = {}) {
  // A phrase that is part of a title is a title search: "final fantasy", "the finals", "asian games" are not filters
  const phrase = fold(q), titled = phrase.includes(' ') && events.some((e) => fold(e.title).includes(phrase))
  const parsed: Parsed = titled ? { kinds: [], platforms: [], past: false, text: q, chips: [] } : parse(q, today)
  const r = parsed.range ?? (o.from || o.to ? [o.from ?? '0000-01-01', o.to ?? '9999-12-31'] : undefined)
  const past = parsed.past || !!o.past
  const words = fold(parsed.text).split(' ').filter(Boolean)
  const list = events.filter((e) => {
    const end = e.end ?? e.start
    if ((parsed.kinds.length && !parsed.kinds.includes(e.kind)) || (o.kind && o.kind !== 'all' && e.kind !== o.kind)) return false
    if ((parsed.platforms.length && !e.platforms.some((p) => parsed.platforms.includes(p))) || (o.platform && o.platform !== 'all' && !e.platforms.includes(o.platform))) return false
    if (o.genre && o.genre !== 'all' && !e.genres.includes(o.genre)) return false
    if (r ? e.start > r[1] || end < r[0] : past ? end >= today : end < today) return false
    return !words.length || hit(e, words)
  })
  list.sort((a, b) => (past ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)))
  return { list, parsed }
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

export const googleUrl = (e: Pick<Ev, 'title' | 'start' | 'end' | 'slug' | 'url'>) =>
  `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${ymd(e.start)}/${until(e)}`, details: link(e) })}`
