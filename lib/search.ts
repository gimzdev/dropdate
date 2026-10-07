// Smart search, shared by the calendar in the browser and the API: plain-English filters, then typo-tolerant text.
// Its own module so that only the pages with a search box download it.

import { type Ev, type Kind, type Platform, iso, monthLabel, shift, toDate } from './core'

export interface Chip { label: string; raw: string }
interface Parsed { kinds: Kind[]; platforms: Platform[]; range?: [string, string]; past: boolean; text: string; chips: Chip[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** A month from one word: its short name (oct), the name typed so far (octo) or a typo of it (ocotber, octobre). */
function monthOf(w: string) {
  w = w.toLowerCase()
  const short = MONTHS.findIndex((m) => m.slice(0, 3) === w)
  return short >= 0 ? short : w.length < 4 ? -1 : MONTHS.findIndex((m) => m.startsWith(w) || (w.length > 4 && m.length > 5 && dist(w, m, 1) <= 1))
}
const SEASONS: Record<string, number> = { spring: 2, summer: 5, fall: 8, autumn: 8, winter: 11 }
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
    const name = season[1].toLowerCase(), from = SEASONS[name]
    let y = from === 11 && M < 2 ? Y - 1 : Y
    if (d(y, from + 3, 0) < today) y++
    cut(season, `${name[0].toUpperCase()}${name.slice(1)} ${y}`)
    out.range = [d(y, from, 1), d(y, from + 3, 0)]
  }
  const named = out.range ? undefined : [...rest.matchAll(/\b(?:(?:in|during|for)\s+)?([a-z]{3,10})\b(?:\s+(20\d\d))?/gi)].find((x) => monthOf(x[1]) >= 0)
  if (named) {
    const i = monthOf(named[1]), y = named[2] ? +named[2] : d(Y, i + 1, 0) < shift(today, -60) ? Y + 1 : Y // a month we hold recent releases for stays this year
    cut(named, monthLabel(d(y, i, 1).slice(0, 7)))
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
    let low = i
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, older[j - 2] + 1)
      if ((cur[j] = v) < low) low = v
    }
    if (low > max) return max + 1
    ;[older, prev] = [prev, cur]
  }
  return prev[b.length]
}

const ROMAN: Record<string, string> = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }
/** What a search matches an event against, worked out once per event: its folded title, the title and genre words, the initials. */
const HAY = new WeakMap<Ev, { title: string; hay: string; parts: string[]; initials: string }>()
function hay(e: Ev) {
  let h = HAY.get(e)
  if (!h) {
    const title = fold(e.title), words = title.split(' ')
    const all = [...words, ...words.flatMap((w) => ROMAN[w] ?? []), fold(e.genres.join(' '))].join(' ')
    HAY.set(e, (h = { title, hay: all, parts: all.split(' '), initials: words.map((w) => ROMAN[w] ?? w[0]).join('') }))
  }
  return h
}

/** Every word must land in the title or genres: as text, as the title's initials (gta, re4), or within a typo or two. */
function hit(e: Ev, words: string[]) {
  const h = hay(e)
  return words.every((w) => {
    const max = w.length > 7 ? 2 : 1
    return h.hay.includes(w) || (ALIASES[w] && h.hay.includes(ALIASES[w])) || (w.length > 1 && h.initials.includes(w)) || (w.length > 3 && h.parts.some((p) => dist(w, p, max) <= max || dist(w, p.slice(0, w.length), 1) <= 1))
  })
}

interface Opts { kind?: Kind | 'all'; platform?: Platform | 'all'; genre?: string; from?: string; to?: string; past?: boolean }

/** Plain English + fuzzy filter, shared by the site and the API. Upcoming first, or most recent first for past events. */
export function search(events: Ev[], q: string, today: string, o: Opts = {}) {
  // A phrase that is part of a title is a title search: "final fantasy", "the finals", "asian games" are not filters
  const phrase = fold(q), titled = phrase.includes(' ') && events.some((e) => hay(e).title.includes(phrase))
  const parsed: Parsed = titled ? { kinds: [], platforms: [], past: false, text: q, chips: [] } : parse(q, today)
  const r = parsed.range ?? (o.from || o.to ? [o.from ?? '0000-01-01', o.to ?? '9999-12-31'] : undefined)
  const past = parsed.past || !!o.past, words = fold(parsed.text).split(' ').filter(Boolean)
  const kind = o.kind !== 'all' && o.kind, platform = o.platform !== 'all' && o.platform, genre = o.genre !== 'all' && o.genre
  const list = events.filter((e) => {
    const end = e.end ?? e.start
    if ((parsed.kinds.length && !parsed.kinds.includes(e.kind)) || (kind && e.kind !== kind)) return false
    if ((parsed.platforms.length && !e.platforms.some((p) => parsed.platforms.includes(p))) || (platform && !e.platforms.includes(platform))) return false
    if ((genre && !e.genres.includes(genre)) || (r ? e.start > r[1] || end < r[0] : past ? end >= today : end < today)) return false
    return !words.length || hit(e, words)
  })
  list.sort((a, b) => (past ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)))
  return { list, parsed }
}
