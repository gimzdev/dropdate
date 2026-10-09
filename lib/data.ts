// Live data, server side only. Every source is optional and fails soft: whatever answers is shown.
//   RAWG        releases (upcoming + last 60 days), artwork, game pages, search and browse
//   Steam       the most wishlisted upcoming PC games, and Metacritic scores RAWG lacks for recent games
//   PandaScore  esports series: running, upcoming and just finished

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { type BrowseQuery, type Ev, type Found, type Game, type Payload, type Platform, BROWSE_PAGE, BROWSE_PAGES, iso, lite, shift } from './core'
import { allow } from './limit'

const env = process.env
const RAWG = env.RAWG_BASE || 'https://api.rawg.io/api', STEAM = env.STEAM_BASE || 'https://store.steampowered.com', PANDA = env.PANDA_BASE || 'https://api.pandascore.co'
const HOUR = 3600, DAY = 86400

/** JSON kept in Next's data cache. null: it does not exist (400/404/410); undefined: unreachable or refused (never taken for "missing"). Retries 429, 5xx and network errors once. */
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
/** Pages 1 to n, all at once (a page past the end is empty or a 404). */
const pages = <T,>(n: number, page: (p: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => page(i + 1)))
/** Works through `items`, `n` at a time, for at most `ms`; a job returning false (source throttled or down) stops it: the rest waits for the next refresh. */
async function each<T>(items: T[], n: number, ms: number, job: (item: T, i: number) => Promise<boolean | void>) {
  let next = 0, down = false
  const until = Date.now() + ms
  await Promise.all(Array.from({ length: n }, async () => {
    for (let i = next++; i < items.length && !down && Date.now() <= until; i = next++) if ((await job(items[i], i)) === false) down = true
  }))
}

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const same = (s: string) => kebab(s).replace(/^the-/, '') // "same game" key across sources
const clean = (s: string) => s.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_, d, h, n: string) =>
    d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n.toLowerCase() as 'amp'])

// ── RAWG ──

interface Rawg { // a list entry; game pages add the details
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

/** A RAWG game as a calendar entry: lists need a date and artwork, a single saved game does not. */
function rawgEv(g: Rawg, lenient = false): Ev | null {
  if (!lenient && (!g.released || !g.background_image)) return null
  const platforms = [...new Set((g.parent_platforms ?? []).map((p) => PLAT[p.platform.slug]).filter(Boolean))]
  return {
    id: `rawg-${g.id}`, slug: g.slug, title: g.name, kind: 'release', start: g.released ?? '', tba: g.tba || undefined,
    platforms: platforms.length ? platforms : ['PC'], thumb: g.background_image ? rawgImg(g.background_image, 640) : '', image: g.background_image ? rawgImg(g.background_image, 1920) : undefined,
    shots: (g.short_screenshots ?? []).slice(1, 5).map((s) => rawgImg(s.image, 640)), genres: names(g.genres),
    rating: g.rating || undefined, metacritic: g.metacritic || undefined, pop: g.added ?? 0,
  }
}

const RAWG_STEAM = 1 // the id RAWG gives the Steam store
const onSteam = (g: Rawg) => !!g.stores?.some((s) => s.store.id === RAWG_STEAM)

/** `steamy` collects the games RAWG lists on Steam: where a missing score can be found. */
async function rawg(dates: string, max: number, steamy: Set<string>): Promise<Ev[]> {
  const key = env.RAWG_API_KEY
  if (!key) return []
  const all = await pages(max, (p) => get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&dates=${dates}&ordering=-added&page_size=40&page=${p}`))
  const games = all.flatMap((r) => r?.results ?? [])
  for (const g of games) if (onSteam(g)) steamy.add(`rawg-${g.id}`)
  return games.flatMap((g) => rawgEv(g) ?? [])
}

// ── Metacritic scores from Steam (RAWG has none for the last couple of years; Steam's store pages do) ──

const steamOn = () => env.STEAM_UPCOMING !== 'off'
const steamAppOf = (stores?: { results?: { url?: string }[] } | null) => stores?.results?.map((s) => s.url?.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean)
const rawgStores = (id: string) => get<{ results?: { url?: string }[] }>(`${RAWG}/games/${id}/stores?key=${env.RAWG_API_KEY}`, 7 * DAY)
/** Steam's copy of the score: a number, null when there is none, undefined when Steam could not be asked. */
async function steamScore(appid: string): Promise<number | null | undefined> {
  const res = await get<Record<string, { data?: { metacritic?: { score?: number } } }>>(`${STEAM}/api/appdetails?appids=${appid}&filters=metacritic`, DAY)
  return res === undefined ? undefined : (res?.[appid]?.data?.metacritic?.score || null)
}

/** Scores for released calendar games that lack one (store links kept a week, scores a day). */
async function steamScores(games: Ev[], steamy: Set<string>, today: string): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  if (!env.RAWG_API_KEY || !steamOn()) return found
  await each(games.filter((e) => !e.metacritic && e.start <= today && steamy.has(e.id)), 6, 20000, async (e) => {
    const appid = steamAppOf(await rawgStores(e.id.slice(5)))
    if (!appid) return
    const score = await steamScore(appid)
    if (score === undefined) return false
    if (score) found.set(e.id, score)
  })
  return found
}

async function rawgGame(slug: string): Promise<Game | null> {
  const key = env.RAWG_API_KEY
  if (!key) return null
  // kept two days: keeps RAWG's monthly quota safe even when crawlers visit every page
  const at = <T,>(sub = '') => get<T>(`${RAWG}/games/${slug}${sub}?key=${key}`, 2 * DAY)
  const g = await at<Rawg>() // alone first: a page that does not exist costs one request, not four
  if (g === undefined) throw new Error('RAWG is unreachable') // never cache a hiccup as a 404 page
  if (!g) return null
  const [shots, movies, stores] = await Promise.all([
    at<{ results?: { image: string }[] }>('/screenshots'),
    at<{ results?: { preview: string; data: { max?: string; 480?: string } }[] }>('/movies'), at<{ results?: { store_id: number; url: string }[] }>('/stores'),
  ])
  const store = new Map((g.stores ?? []).map((s) => [s.store.id, s.store.name])), clip = movies?.results?.find((m) => m.data.max || m.data[480])
  const out = !!g.released && g.released <= iso(new Date())
  const app = g.metacritic || !out || !steamOn() ? undefined : steamAppOf(stores) // released, no score at RAWG: Steam may have one
  const fromSteam = app ? await steamScore(app) : undefined
  return {
    id: `rawg-${g.id}`, slug: g.slug, name: g.name, description: g.description_raw?.trim() || undefined, released: g.released ?? undefined,
    website: g.website || undefined, image: g.background_image ? rawgImg(g.background_image, 1920) : undefined,
    rating: g.rating || undefined, metacritic: g.metacritic || fromSteam || undefined, esrb: g.esrb_rating?.name, playtime: g.playtime || undefined,
    genres: names(g.genres), tags: names(g.tags?.filter((t) => !t.language || t.language === 'eng')).slice(0, 10),
    platforms: (g.platforms ?? []).map((p) => p.platform.name), developers: names(g.developers), publishers: names(g.publishers),
    screenshots: (shots?.results ?? []).slice(0, 8).map((s) => rawgImg(s.image, 1920)),
    trailer: clip ? { preview: clip.preview, src: (clip.data.max || clip.data[480]) as string } : undefined,
    stores: (stores?.results ?? []).flatMap((s) => { const name = store.get(s.store_id); return name && s.url ? [{ name, url: s.url }] : [] }),
  }
}

/** Any game RAWG knows by name: the search boxes fall back to this for older games. */
export async function searchGames(q: string): Promise<Found[]> {
  const key = env.RAWG_API_KEY
  if (!key || q.trim().length < 2) return []
  const res = await get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&search=${encodeURIComponent(q.trim().slice(0, 80))}&search_precise=true&page_size=8`)
  return (res?.results ?? []).map((g) => ({ key: `rawg-${g.id}`, slug: g.slug, title: g.name, released: g.released ?? undefined, thumb: g.background_image ? rawgImg(g.background_image, 640) : '', metacritic: g.metacritic || undefined }))
}

// ── Browse: any game RAWG knows, a page at a time ──

/** 'busy': today's browsing allowance is spent; 'down': RAWG did not answer. */
export class BrowseError extends Error {
  constructor(public why: 'busy' | 'down') { super(why) }
}
/** RAWG requests browsing may make in a day: the monthly allowance (20,000 free) is shared with the calendar (~6,500), game pages and search. Kept pages cost nothing. */
const BROWSE_PER_DAY = Number(env.BROWSE_PER_DAY) || 250
const FAMILY: Record<Platform, string> = { PC: '1', PlayStation: '2', Xbox: '3', Nintendo: '7', Mobile: '4,8' } // RAWG's platform families
const ORDER = { popular: '-added', score: '-metacritic', newest: '-released', oldest: 'released', name: 'name' } as const

function browseUrl(q: BrowseQuery, today: string) {
  const p = new URLSearchParams({ page_size: String(BROWSE_PAGE), page: String(q.page), ordering: ORDER[q.sort] })
  if (q.year) p.set('dates', `${q.year}-01-01,${q.year}-12-31`)
  else if (q.sort === 'newest' || q.sort === 'oldest') p.set('dates', `1950-01-01,${today}`) // by date: games that are out, not placeholders
  if (q.platform) p.set('parent_platforms', FAMILY[q.platform])
  if (q.genre) p.set('genres', q.genre)
  if (q.sort === 'score') p.set('metacritic', '1,100')
  if (q.q) p.set('search', q.q)
  return `${RAWG}/games?${p}`
}

interface Browsed { count: number; items: Ev[] }
/** One page of games, kept by Next for every server instance; only a page not kept asks RAWG and counts against the allowance. */
const browsed = (revalidate: number) => unstable_cache(async (url: string): Promise<Browsed> => {
  const key = env.RAWG_API_KEY
  if (!key) throw new BrowseError('down')
  if (!(await allow('browse:rawg', BROWSE_PER_DAY, 86400))) throw new BrowseError('busy')
  const res = await get<{ count?: number; results?: Rawg[] }>(`${url}&key=${key}`, revalidate)
  if (res === undefined) throw new BrowseError('down') // never kept: the next visit asks again
  return { count: res?.count ?? 0, items: (res?.results ?? []).flatMap((g) => rawgEv(g) ?? []).map(lite) }
}, ['browse', String(revalidate)], { revalidate })
const freshPages = browsed(12 * HOUR), settledPages = browsed(7 * DAY)

/** Games from the whole of RAWG, filtered and sorted there: the same 40 for everyone asking the same. Throws a BrowseError. */
export async function browseGames(q: BrowseQuery): Promise<Browsed & { pages: number }> {
  const today = iso(new Date())
  const over = !q.q && !!q.year && +q.year < +today.slice(0, 4) - 1 // a past year barely changes: kept a week
  const out = await (over ? settledPages : freshPages)(browseUrl(q, today))
  return { ...out, pages: Math.min(BROWSE_PAGES, Math.ceil(out.count / BROWSE_PAGE)) }
}

// ── Steam (no key needed) ──

interface SteamApp {
  type?: string; name: string; header_image?: string; short_description?: string; about_the_game?: string; website?: string | null
  developers?: string[]; publishers?: string[]; genres?: { description: string }[]; platforms?: Record<string, boolean>
  screenshots?: { path_thumbnail: string; path_full: string }[]; release_date?: { date?: string }
  metacritic?: { score?: number }; content_descriptors?: { ids?: number[] }
}
interface Row { id: string; title: string; date?: string; pop: number }

/** Steam's exact dates ("Oct 28, 2026", "28 Oct, 2026"); vaguer ones ("Q4 2026") stay off the calendar. */
function steamDate(s = '') {
  const m = s.trim().match(/^(?:(\d{1,2})\s+([a-z]{3})[a-z]*,?|([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?)\s+(\d{4})$/i)
  const mon = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf((m[2] ?? m[3]).toLowerCase()) : -1
  return m && mon >= 0 && mon % 3 === 0 ? iso(new Date(+m[5], mon / 3, +(m[1] ?? m[4]))) : undefined
}

/** A Steam store list, most popular first; `weight` levels its top entry with RAWG's most followed games. */
async function steamList(filter: string, weight: number): Promise<Row[]> {
  if (!steamOn()) return []
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
  await each(picks, 8, 25000, async (r, i) => (apps[i] = await steamApp(r.id)) !== undefined)
  return picks.flatMap((r, i) => { const a = apps[i]; return (a && steamEv(r.id, a, r.date, r.pop)) || [] })
}

/** A Steam app as a calendar entry; `date` is the list's when the app has no exact one. */
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

// ── PandaScore: esports series (groups, playoffs and finals together) ──

interface Serie {
  id: number; full_name?: string; begin_at: string | null; end_at: string | null
  league?: { name: string; image_url?: string | null; url?: string | null }; videogame?: { name: string; slug: string }
  tournaments?: { tier?: string | null; prizepool?: string | null }[]
}
// PandaScore rarely links the event's own page: we search the game's Liquipedia wiki for it
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
  // Up to 200 running, 200 upcoming and the 50 just ended, all at once
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

// ── Public ──

const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]) // one failing source never takes the others down

/** Everything, merged and sorted by date, without empty fields (they would ship to every browser). */
async function load() {
  const today = iso(new Date())
  const steamy = new Set<string>()
  const [upcoming, recent, wished, soon, sports] = await Promise.all([
    safe(rawg(`${today},${shift(today, 730)}`, 5, steamy)), safe(rawg(`${shift(today, -60)},${shift(today, -1)}`, 4, steamy)),
    safe(steamList('popularwishlist', 1500)), safe(steamList('popularcomingsoon', 600)), safe(esports()),
  ])
  const releases = [...new Map([...upcoming, ...recent].map((e) => [e.id, e])).values()]
  const [pc, scores] = await Promise.all([
    safe(steam([...wished, ...soon], new Set(releases.map((e) => same(e.title))), today)),
    steamScores(releases, steamy, today).catch(() => new Map<string, number>()),
  ])
  const scored = releases.map((e) => (scores.has(e.id) ? { ...e, metacritic: scores.get(e.id) } : e))
  const events = [...scored, ...pc, ...sports].sort((a, b) => a.start.localeCompare(b.start)).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as Ev)
  if (!events.length) throw new Error('No source answered')
  return { events, updated: new Date().toISOString(), sources: { rawg: releases.length, steam: pc.length, esports: sports.length } }
}

/** The merged calendar kept in Next's data cache for ten minutes, keyed by the settings that shape it: a cold server instance reads it in one lookup, not hundreds. */
const kept = unstable_cache(load, ['events', env.PANDASCORE_TIERS || '', env.STEAM_UPCOMING || '', String(!!env.RAWG_API_KEY), String(!!env.PANDASCORE_TOKEN)], { revalidate: 600 })
let run: { at: number; data: ReturnType<typeof load> } | null = null // one load per server instance for 5 minutes
let last: Awaited<ReturnType<typeof load>> | null = null // the last good data, for when every source fails

export async function getEvents(): Promise<Payload> {
  const today = iso(new Date())
  if (!run || Date.now() - run.at > 3e5) run = { at: Date.now(), data: kept() }
  try {
    last = await run.data
    return { ...last, today, stale: false }
  } catch {
    run = null
    if (last) return { ...last, today, stale: true }
    return { events: [], today, updated: new Date().toISOString(), stale: true, error: env.RAWG_API_KEY ? 'The data sources did not answer.' : 'RAWG_API_KEY is not set.' }
  }
}

/** The source's own copy of a game. Throws when the source cannot be reached: an outage is never "no such game". */
export async function fromSource(key: string): Promise<Ev | null> {
  const [, src, id] = key.match(/^(rawg|steam)-(\d+)$/) ?? []
  if (src === 'rawg' && env.RAWG_API_KEY) {
    const g = await get<Rawg>(`${RAWG}/games/${id}?key=${env.RAWG_API_KEY}`)
    if (g === undefined) throw new Error('RAWG is unreachable')
    const ev = g ? rawgEv(g, true) : null
    if (ev && g && !ev.metacritic && ev.start && ev.start <= iso(new Date()) && onSteam(g) && steamOn()) {
      const app = steamAppOf(await rawgStores(id)), score = app ? await steamScore(app) : null
      if (score) ev.metacritic = score
    }
    return ev
  }
  if (src === 'steam') {
    const a = await steamApp(id)
    if (a === undefined) throw new Error('Steam is unreachable')
    return a ? steamEv(id, a, undefined, 0) : null
  }
  return null
}

const missing = new Map<string, number>() // slugs a source said do not exist, for ten minutes
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i

/** A game page: a RAWG slug, or steam-<appid>-<name>. Once per request; impossible or just-missing slugs never reach a source. */
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
