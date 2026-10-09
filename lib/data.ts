// Live data, server side only. Every source is optional and fails soft: whatever answers is shown.
//   RAWG        releases (upcoming + last 60 days), artwork, game pages
//   Steam       the most wishlisted and most anticipated upcoming PC games (RAWG only lists a few dozen)
//   PandaScore  esports series: running, upcoming and just finished

import { cache } from 'react'
import { type Ev, type Game, type Payload, type Platform, iso, shift } from './core'

const env = process.env
const RAWG = env.RAWG_BASE || 'https://api.rawg.io/api', STEAM = env.STEAM_BASE || 'https://store.steampowered.com', PANDA = env.PANDA_BASE || 'https://api.pandascore.co'
const HOUR = 3600, DAY = 86400

/**
 * JSON, kept in Next's data cache for `revalidate` seconds (shared by every page, API route and server instance).
 * null: the source says it doesn't exist (400/404/410). undefined: unreachable or refused (bad key, blocked,
 * throttled, down), so nobody mistakes an outage for a missing game. 429, 5xx and network errors are retried once.
 */
async function get<T>(url: string, revalidate = HOUR, headers?: Record<string, string>): Promise<T | null | undefined> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers, next: { revalidate }, signal: AbortSignal.timeout(10000) })
      if (res.ok) return (await res.json()) as T
      if ([400, 404, 410].includes(res.status)) return null
      if (res.status < 500 && res.status !== 429) return undefined
    } catch {}
    if (attempt === 2) return undefined
    await new Promise((r) => setTimeout(r, 1500))
  }
}
/** Pages 1 to n, all requested at once (a page past the end is simply empty or a 404). */
const pages = <T,>(n: number, page: (p: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => page(i + 1)))

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const same = (s: string) => kebab(s).replace(/^the-/, '') // "same game" key across sources
const clean = (s: string) => s.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_, d, h, n: string) =>
    d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n.toLowerCase() as 'amp'])

// ── RAWG ────────────────────────────────────────────────────────────────

interface Rawg { // a list entry; game pages add the details below
  id: number; slug: string; name: string; released: string | null; tba?: boolean; background_image: string | null
  rating?: number; metacritic?: number | null; added?: number; genres?: { name: string }[]
  parent_platforms?: { platform: { slug: string } }[]; short_screenshots?: { image: string }[]
  description_raw?: string; website?: string; esrb_rating?: { name: string } | null; playtime?: number
  tags?: { name: string; language?: string }[]; platforms?: { platform: { name: string } }[]
  developers?: { name: string }[]; publishers?: { name: string }[]; stores?: { store: { id: number; name: string } }[]
}

const PLAT: Record<string, Platform> = { pc: 'PC', mac: 'PC', linux: 'PC', web: 'PC', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo', ios: 'Mobile', android: 'Mobile' }
// RAWG only renders some sizes (resize/420|640|1280|1920, crop/600/400); any other size is a 404
const rawgImg = (u: string, w: 640 | 1920) => u.replace(/\/media\/(?=games\/|screenshots\/)/, `/media/resize/${w}/-/`)
const names = (l?: { name: string }[]) => (l ?? []).map((x) => x.name)

/** A RAWG game as a calendar entry. Lists need a date and artwork to be worth a card; a single game someone saved does not. */
function rawgEv(g: Rawg, lenient = false): Ev | null {
  if (!lenient && (!g.released || !g.background_image)) return null // no date or no artwork, no card
  const platforms = [...new Set((g.parent_platforms ?? []).map((p) => PLAT[p.platform.slug]).filter(Boolean))]
  return {
    id: `rawg-${g.id}`, slug: g.slug, title: g.name, kind: 'release', start: g.released ?? '', tba: g.tba || undefined,
    platforms: platforms.length ? platforms : ['PC'], thumb: g.background_image ? rawgImg(g.background_image, 640) : '', image: g.background_image ? rawgImg(g.background_image, 1920) : undefined,
    shots: (g.short_screenshots ?? []).slice(1, 5).map((s) => rawgImg(s.image, 640)), genres: names(g.genres),
    rating: g.rating || undefined, metacritic: g.metacritic || undefined, pop: g.added ?? 0,
  }
}

async function rawg(dates: string, max: number): Promise<Ev[]> {
  const key = env.RAWG_API_KEY
  if (!key) return []
  const all = await pages(max, (p) => get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&dates=${dates}&ordering=-added&page_size=40&page=${p}`))
  return all.flatMap((r) => r?.results ?? []).flatMap((g) => rawgEv(g) ?? [])
}

async function rawgGame(slug: string): Promise<Game | null> {
  const key = env.RAWG_API_KEY
  if (!key) return null
  // details barely change: kept two days, which keeps RAWG's monthly quota safe even when crawlers visit every page
  const at = <T,>(sub = '') => get<T>(`${RAWG}/games/${slug}${sub}?key=${key}`, 2 * DAY)
  const g = await at<Rawg>() // asked first and alone: a page that does not exist costs one request, not four
  if (g === undefined) throw new Error('RAWG is unreachable') // never cache a hiccup as a 404 page
  if (!g) return null
  const [shots, movies, stores] = await Promise.all([
    at<{ results?: { image: string }[] }>('/screenshots'),
    at<{ results?: { preview: string; data: { max?: string; 480?: string } }[] }>('/movies'), at<{ results?: { store_id: number; url: string }[] }>('/stores'),
  ])
  const store = new Map((g.stores ?? []).map((s) => [s.store.id, s.store.name])), clip = movies?.results?.find((m) => m.data.max || m.data[480])
  return {
    id: `rawg-${g.id}`, slug: g.slug, name: g.name, description: g.description_raw?.trim() || undefined, released: g.released ?? undefined,
    website: g.website || undefined, image: g.background_image ? rawgImg(g.background_image, 1920) : undefined,
    rating: g.rating || undefined, metacritic: g.metacritic || undefined, esrb: g.esrb_rating?.name, playtime: g.playtime || undefined,
    genres: names(g.genres), tags: names(g.tags?.filter((t) => !t.language || t.language === 'eng')).slice(0, 10),
    platforms: (g.platforms ?? []).map((p) => p.platform.name), developers: names(g.developers), publishers: names(g.publishers),
    screenshots: (shots?.results ?? []).slice(0, 8).map((s) => rawgImg(s.image, 1920)),
    trailer: clip ? { preview: clip.preview, src: (clip.data.max || clip.data[480]) as string } : undefined,
    stores: (stores?.results ?? []).flatMap((s) => { const name = store.get(s.store_id); return name && s.url ? [{ name, url: s.url }] : [] }),
  }
}

/** Any game RAWG knows, calendar or not: the search box falls back to this so older and long-running games can be found too. */
export interface Found { key: string; slug: string; title: string; released?: string; thumb: string; metacritic?: number }
export async function searchGames(q: string): Promise<Found[]> {
  const key = env.RAWG_API_KEY
  if (!key || q.trim().length < 2) return []
  const res = await get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&search=${encodeURIComponent(q.trim().slice(0, 80))}&search_precise=true&page_size=8`)
  return (res?.results ?? []).map((g) => ({ key: `rawg-${g.id}`, slug: g.slug, title: g.name, released: g.released ?? undefined, thumb: g.background_image ? rawgImg(g.background_image, 640) : '', metacritic: g.metacritic || undefined }))
}

// ── Steam (no key needed) ───────────────────────────────────────────────

interface SteamApp {
  type?: string; name: string; header_image?: string; short_description?: string; about_the_game?: string; website?: string | null
  developers?: string[]; publishers?: string[]; genres?: { description: string }[]; platforms?: Record<string, boolean>
  screenshots?: { path_thumbnail: string; path_full: string }[]; release_date?: { date?: string }
  metacritic?: { score?: number }; content_descriptors?: { ids?: number[] }
}
interface Row { id: string; title: string; date?: string; pop: number }

/** Steam's exact dates ("Oct 28, 2026", "28 Oct, 2026"). Vaguer ones ("Q4 2026", "Coming soon") stay off the calendar. */
function steamDate(s = '') {
  const m = s.trim().match(/^(?:(\d{1,2})\s+([a-z]{3})[a-z]*,?|([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?)\s+(\d{4})$/i)
  const mon = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf((m[2] ?? m[3]).toLowerCase()) : -1
  return m && mon >= 0 && mon % 3 === 0 ? iso(new Date(+m[5], mon / 3, +(m[1] ?? m[4]))) : undefined
}

/** One of Steam's store lists, most popular first. `weight` puts its top entry level with RAWG's most followed games. */
async function steamList(filter: string, weight: number): Promise<Row[]> {
  if (env.STEAM_UPCOMING === 'off') return []
  const res = await get<{ results_html?: string }>(`${STEAM}/search/results/?filter=${filter}&infinite=1&count=100&start=0&cc=us&l=english&ndl=1`)
  const rows = (res?.results_html ?? '').split('<a ').filter((a) => a.includes('data-ds-appid="'))
  return rows.flatMap((a, i) => {
    const id = a.match(/data-ds-appid="(\d+)"/)?.[1] // bundles carry several ids and are skipped
    const date = steamDate(decode(a.match(/search_released[^>]*>([^<]*)</)?.[1] ?? ''))
    return id ? [{ id, date, title: decode(a.match(/class="title">([^<]*)</)?.[1] ?? ''), pop: Math.round(weight * (1 - i / rows.length)) }] : []
  })
}

const listed = (a: SteamApp) => (!a.type || a.type === 'game') && !a.content_descriptors?.ids?.some((x) => x === 3 || x === 4) // games only, no adult-only
const steamApp = async (id: string) => {
  const res = await get<Record<string, { data?: SteamApp }>>(`${STEAM}/api/appdetails?appids=${id}&cc=us&l=english&filters=basic,release_date,genres,screenshots,platforms,metacritic,developers,publishers,content_descriptors`, DAY)
  return res === undefined ? undefined : (res?.[id]?.data ?? null)
}

async function steam(rows: Row[], skip: Set<string>, today: string): Promise<Ev[]> {
  const best = new Map<string, Row>()
  for (const r of rows) if (r.date && r.date >= today && !skip.has(same(r.title)) && (best.get(r.id)?.pop ?? -1) < r.pop) best.set(r.id, r)
  const picks = [...best.values()].sort((a, b) => b.pop - a.pop).slice(0, 120), apps: (SteamApp | null | undefined)[] = []
  // Details are cached for a day, so only new games cost a request, eight at a time. If Steam throttles or a cold start
  // runs long, stop asking: the games missing now are fetched on the next refresh.
  let next = 0, down = false
  const until = Date.now() + 25000
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let i = next++; i < picks.length; i = next++) {
      apps[i] = down || Date.now() > until ? undefined : await steamApp(picks[i].id)
      if (apps[i] === undefined) down = true
    }
  }))
  return picks.flatMap((r, i) => {
    const a = apps[i]
    return (a && steamEv(r.id, a, r.date, r.pop)) || []
  })
}

/** A Steam app as a calendar entry; `date` is the list's date when the app itself has no exact one. */
function steamEv(id: string, a: SteamApp, date: string | undefined, pop: number): Ev | null {
  if (!a.header_image || !listed(a)) return null
  const title = clean(a.name), shots = a.screenshots ?? []
  return {
    id: `steam-${id}`, slug: kebab(`steam ${id} ${title}`), title, kind: 'release', start: steamDate(a.release_date?.date) ?? date ?? '',
    platforms: ['PC'], thumb: a.header_image, image: shots[0]?.path_full ?? a.header_image, shots: shots.slice(0, 4).map((s) => s.path_thumbnail),
    genres: (a.genres ?? []).map((g) => g.description), metacritic: a.metacritic?.score, pop,
  }
}

async function steamGame(id: string): Promise<Game | null> {
  const a = await steamApp(id)
  if (a === undefined) throw new Error('Steam is unreachable')
  if (!a || !listed(a)) return null
  const text = (html = '') =>
    decode(html.replace(/<li[^>]*>/gi, '• ').replace(/<br\s*\/?>|<\/(?:p|li|h\d|ul)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const shots = a.screenshots ?? [], name = clean(a.name)
  return {
    id: `steam-${id}`, slug: kebab(`steam ${id} ${name}`), name, description: text(a.about_the_game) || a.short_description,
    released: steamDate(a.release_date?.date), website: a.website || undefined, image: shots[0]?.path_full ?? a.header_image, metacritic: a.metacritic?.score,
    genres: (a.genres ?? []).map((g) => g.description), tags: [], developers: a.developers ?? [], publishers: a.publishers ?? [],
    platforms: (['windows', 'mac', 'linux'] as const).filter((p) => a.platforms?.[p]).map((p) => ({ windows: 'PC', mac: 'macOS', linux: 'Linux' })[p]),
    screenshots: shots.slice(0, 8).map((s) => s.path_full), stores: [{ name: 'Steam', url: `https://store.steampowered.com/app/${id}` }],
  }
}

// ── PandaScore: esports series (a series groups its stages: groups, playoffs, finals) ──

interface Serie {
  id: number; full_name?: string; begin_at: string | null; end_at: string | null
  league?: { name: string; image_url?: string | null; url?: string | null }; videogame?: { name: string; slug: string }
  tournaments?: { tier?: string | null; prizepool?: string | null }[]
}
// PandaScore rarely links a page for the event itself, so we search the game's Liquipedia wiki for it
const WIKI: Record<string, string> = {
  'cs-go': 'counterstrike', 'cs-2': 'counterstrike', 'league-of-legends': 'leagueoflegends', 'dota-2': 'dota2', valorant: 'valorant', ow: 'overwatch',
  'r6-siege': 'rainbowsix', rl: 'rocketleague', mlbb: 'mobilelegends', kog: 'honorofkings', pubg: 'pubg', 'cod-mw': 'callofduty',
  'lol-wild-rift': 'wildrift', 'starcraft-2': 'starcraft2', 'starcraft-brood-war': 'starcraft', fifa: 'easportsfc',
}
const TIERS = 'sabcd'

async function esports(): Promise<Ev[]> {
  const token = env.PANDASCORE_TOKEN
  if (!token) return []
  const wanted = (env.PANDASCORE_TIERS || 's,a,b,c').toLowerCase().split(',').map((t) => t.trim())
  // Up to 200 running and 200 upcoming series (two pages of 100) and the 50 that just ended, all requested at once
  const list = (kind: string, n: number, size: number, sort = 'begin_at') =>
    pages(n, (p) => get<Serie[]>(`${PANDA}/series/${kind}?sort=${sort}&page[size]=${size}&page[number]=${p}`, HOUR, { Authorization: `Bearer ${token}` }))
  const lists = await Promise.all([list('running', 2, 100), list('upcoming', 2, 100), list('past', 1, 50, '-end_at')])
  return [...new Map(lists.flat().flatMap((page) => page ?? []).map((s) => [s.id, s])).values()].flatMap((s): Ev[] => {
    const rank = Math.min(9, ...(s.tournaments ?? []).map((t) => TIERS.indexOf(t.tier?.toLowerCase() || '?')).filter((r) => r >= 0))
    if (!s.begin_at || !wanted.includes(TIERS[rank])) return []
    const league = s.league?.name ?? s.videogame?.name ?? 'Esports'
    const title = s.full_name?.toLowerCase().startsWith(league.toLowerCase()) ? s.full_name : `${league} ${s.full_name ?? ''}`.trim()
    const usd = Math.max(0, ...(s.tournaments ?? []).map((t) => Number(t.prizepool?.match(/^([\d.]+) United States Dollar/)?.[1] ?? 0)))
    const start = s.begin_at.slice(0, 10), end = s.end_at?.slice(0, 10), wiki = WIKI[s.videogame?.slug ?? '']
    return [{
      id: `ps-${s.id}`, title, kind: 'tournament', start, end: end && end > start ? end : undefined, platforms: [], thumb: s.league?.image_url ?? '', shots: [],
      url: s.league?.url || (wiki ? `https://liquipedia.net/${wiki}/index.php?search=${encodeURIComponent(title)}` : `https://www.google.com/search?q=${encodeURIComponent(`${title} esports`)}`),
      genres: [s.videogame?.name ?? 'Esports'], pop: [1200, 600, 300, 150, 50][rank] + Math.min(800, usd / 5000), prize: usd ? `$${Math.round(usd).toLocaleString('en-US')}` : undefined,
    }]
  })
}

// ── Public ──────────────────────────────────────────────────────────────

const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]) // one failing source never takes the others down

/** Everything, merged and sorted by date, without empty fields (they would ship to every browser). */
async function load() {
  const today = iso(new Date())
  const [upcoming, recent, wished, soon, sports] = await Promise.all([
    safe(rawg(`${today},${shift(today, 730)}`, 5)), safe(rawg(`${shift(today, -60)},${shift(today, -1)}`, 4)),
    safe(steamList('popularwishlist', 1500)), safe(steamList('popularcomingsoon', 600)), safe(esports()),
  ])
  const releases = [...new Map([...upcoming, ...recent].map((e) => [e.id, e])).values()]
  const pc = await safe(steam([...wished, ...soon], new Set(releases.map((e) => same(e.title))), today))
  const events = [...releases, ...pc, ...sports].sort((a, b) => a.start.localeCompare(b.start)).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as Ev)
  if (!events.length) throw new Error('No source answered')
  return { events, updated: new Date().toISOString(), sources: { rawg: releases.length, steam: pc.length, esports: sports.length } }
}

let run: { at: number; data: ReturnType<typeof load> } | null = null // pages and API calls in one server instance share a load for 5 minutes
let last: Awaited<ReturnType<typeof load>> | null = null // last good data, in case every source fails at once

export async function getEvents(): Promise<Payload> {
  const today = iso(new Date())
  if (!run || Date.now() - run.at > 3e5) run = { at: Date.now(), data: load() }
  try {
    last = await run.data
    return { ...last, today, stale: false }
  } catch {
    run = null
    if (last) return { ...last, today, stale: true }
    return { events: [], today, updated: new Date().toISOString(), stale: true, error: env.RAWG_API_KEY ? 'The data sources did not answer.' : 'RAWG_API_KEY is not set.' }
  }
}

/** The source's own copy of a game, bypassing the calendar. Throws when the source cannot be reached, so an outage is never taken for "no such game". */
export async function fromSource(key: string): Promise<Ev | null> {
  const [, src, id] = key.match(/^(rawg|steam)-(\d+)$/) ?? []
  if (src === 'rawg' && env.RAWG_API_KEY) {
    const g = await get<Rawg>(`${RAWG}/games/${id}?key=${env.RAWG_API_KEY}`)
    if (g === undefined) throw new Error('RAWG is unreachable')
    return g ? rawgEv(g, true) : null
  }
  if (src === 'steam') {
    const a = await steamApp(id)
    if (a === undefined) throw new Error('Steam is unreachable')
    return a ? steamEv(id, a, undefined, 0) : null
  }
  return null
}

const missing = new Map<string, number>() // slugs a source said do not exist, remembered for ten minutes in this server instance
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i

/**
 * A game page: RAWG slugs, or steam-<appid>-<name> for games only Steam knows. Once per request, however often a page asks.
 * Addresses that cannot be a game are answered without asking anyone, and one that a source has just said does not exist is not asked again for a while:
 * the sources' request allowances are shared by every visitor.
 */
export const getGame = cache(async (slug: string): Promise<Game | null> => {
  if (!SLUG.test(slug) || (missing.get(slug) ?? 0) > Date.now()) return null
  const steamId = slug.match(/^steam-(\d+)/)?.[1]
  const game = await (steamId ? steamGame(steamId) : rawgGame(slug))
  if (!game) {
    if (missing.size > 500) missing.clear()
    missing.set(slug, Date.now() + 600_000)
  }
  return game
})
