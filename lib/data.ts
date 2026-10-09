// Live data, server side only. Every source is optional and fails soft: whatever answers is shown.
//   RAWG        releases (upcoming + last 60 days), artwork, game pages, and every other game it knows (search, browse)
//   Steam       the most wishlisted and most anticipated upcoming PC games (RAWG only lists a few dozen), and the Metacritic
//               score of recent PC games (RAWG's copy of Metacritic stops at older games)
//   PandaScore  esports series: running, upcoming and just finished

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { type BrowseQuery, type Ev, type Game, type Payload, type Platform, BROWSE_PAGE, BROWSE_PAGES, iso, lite, shift } from './core'
import { allow } from './limit'

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

const RAWG_STEAM = 1 // the id RAWG gives the Steam store
const onSteam = (g: Rawg) => !!g.stores?.some((s) => s.store.id === RAWG_STEAM)

/** `steamy` collects the games RAWG lists on Steam, which is where a score can be found for the ones RAWG has none for. */
async function rawg(dates: string, max: number, steamy: Set<string>): Promise<Ev[]> {
  const key = env.RAWG_API_KEY
  if (!key) return []
  const all = await pages(max, (p) => get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&dates=${dates}&ordering=-added&page_size=40&page=${p}`))
  const games = all.flatMap((r) => r?.results ?? [])
  for (const g of games) if (onSteam(g)) steamy.add(`rawg-${g.id}`)
  return games.flatMap((g) => rawgEv(g) ?? [])
}

// ── Metacritic scores from Steam ────────────────────────────────────────
// RAWG keeps Metacritic scores for older games and has none for what came out in the last couple of years. Steam still shows Metacritic's
// score on the store page of the PC games that have one, so a game RAWG lists on Steam and has no score for is looked up there.

const steamOn = () => env.STEAM_UPCOMING !== 'off'
/** The Steam app a list of RAWG store links points to. */
const steamAppOf = (stores?: { results?: { url?: string }[] } | null) => stores?.results?.map((s) => s.url?.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean)
const rawgStores = (id: string) => get<{ results?: { url?: string }[] }>(`${RAWG}/games/${id}/stores?key=${env.RAWG_API_KEY}`, 7 * DAY)
/** Steam's copy of a game's Metacritic score: the number, null when the store page shows none, undefined when Steam could not be asked. */
async function steamScore(appid: string): Promise<number | null | undefined> {
  const res = await get<Record<string, { data?: { metacritic?: { score?: number } } }>>(`${STEAM}/api/appdetails?appids=${appid}&filters=metacritic`, DAY)
  return res === undefined ? undefined : (res?.[appid]?.data?.metacritic?.score || null)
}

/**
 * Scores for the released games on the calendar that RAWG has none for and lists on Steam. Both answers are kept (RAWG's store links a week,
 * Steam's score a day), so a refresh only asks about games it has not seen. If Steam throttles or a cold start runs long it stops asking:
 * what is missing now is fetched on the next refresh.
 */
async function steamScores(games: Ev[], steamy: Set<string>, today: string): Promise<Map<string, number>> {
  const found = new Map<string, number>()
  if (!env.RAWG_API_KEY || !steamOn()) return found
  const todo = games.filter((e) => !e.metacritic && e.start <= today && steamy.has(e.id))
  let next = 0, down = false
  const until = Date.now() + 20000
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let i = next++; i < todo.length; i = next++) {
      if (down || Date.now() > until) return
      const appid = steamAppOf(await rawgStores(todo[i].id.slice(5)))
      if (!appid) continue
      const score = await steamScore(appid)
      if (score === undefined) { down = true; return }
      if (score) found.set(todo[i].id, score)
    }
  }))
  return found
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
  const out = !!g.released && g.released <= iso(new Date()) // a game that is not out has no score to look for
  const app = g.metacritic || !out || !steamOn() ? undefined : steamAppOf(stores) // no score at RAWG: Steam's store page may have one
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

/** Any game RAWG knows, calendar or not: the search box falls back to this so older and long-running games can be found too. */
export interface Found { key: string; slug: string; title: string; released?: string; thumb: string; metacritic?: number }
export async function searchGames(q: string): Promise<Found[]> {
  const key = env.RAWG_API_KEY
  if (!key || q.trim().length < 2) return []
  const res = await get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&search=${encodeURIComponent(q.trim().slice(0, 80))}&search_precise=true&page_size=8`)
  return (res?.results ?? []).map((g) => ({ key: `rawg-${g.id}`, slug: g.slug, title: g.name, released: g.released ?? undefined, thumb: g.background_image ? rawgImg(g.background_image, 640) : '', metacritic: g.metacritic || undefined }))
}

// ── Browse: any game RAWG knows, a page at a time ───────────────────────

/** Why a page of games could not be had: 'busy' = what browsing may ask RAWG for today is spent, 'down' = RAWG did not answer. */
export class BrowseError extends Error {
  constructor(public why: 'busy' | 'down') { super(why) }
}
/**
 * What browsing may ask RAWG for in a day, however many people browse. RAWG's monthly allowance (20,000 on the free plan) is shared with the
 * calendar (about 6,500), game pages and search, so this keeps a crawler or a curious crowd from using it up. Pages already looked at cost nothing.
 */
const BROWSE_PER_DAY = Number(env.BROWSE_PER_DAY) || 250
const FAMILY: Record<Platform, string> = { PC: '1', PlayStation: '2', Xbox: '3', Nintendo: '7', Mobile: '4,8' } // RAWG's platform families
const ORDER = { popular: '-added', score: '-metacritic', newest: '-released', oldest: 'released', name: 'name' } as const

function browseUrl(q: BrowseQuery, today: string) {
  const p = new URLSearchParams({ page_size: String(BROWSE_PAGE), page: String(q.page), ordering: ORDER[q.sort] })
  if (q.year) p.set('dates', `${q.year}-01-01,${q.year}-12-31`)
  else if (q.sort === 'newest' || q.sort === 'oldest') p.set('dates', `1950-01-01,${today}`) // ordered by date means games that are out, not placeholders years ahead
  if (q.platform) p.set('parent_platforms', FAMILY[q.platform])
  if (q.genre) p.set('genres', q.genre)
  if (q.sort === 'score') p.set('metacritic', '1,100')
  if (q.q) p.set('search', q.q)
  return `${RAWG}/games?${p}`
}

interface Browsed { count: number; items: Ev[] }
/** One page of games, kept by Next (shared by every server instance). The function runs only when the page is not kept: that is when RAWG is asked, and when the day's allowance is spent. */
const browsed = (revalidate: number) => unstable_cache(async (url: string): Promise<Browsed> => {
  const key = env.RAWG_API_KEY
  if (!key) throw new BrowseError('down')
  if (!(await allow('browse:rawg', BROWSE_PER_DAY, 86400))) throw new BrowseError('busy')
  const res = await get<{ count?: number; results?: Rawg[] }>(`${url}&key=${key}`, revalidate)
  if (res === undefined) throw new BrowseError('down') // never kept: the next visit asks again
  return { count: res?.count ?? 0, items: (res?.results ?? []).flatMap((g) => rawgEv(g) ?? []).map(lite) } // (a page past the end is a 404: no games)
}, ['browse', String(revalidate)], { revalidate })
const freshPages = browsed(12 * HOUR), settledPages = browsed(7 * DAY)

/** Games from the whole of RAWG, filtered and sorted by RAWG: the same 40 for everyone who asks the same thing. Throws a BrowseError. */
export async function browseGames(q: BrowseQuery): Promise<Browsed & { pages: number }> {
  const today = iso(new Date())
  const over = !q.q && !!q.year && +q.year < +today.slice(0, 4) - 1 // a year that is over barely changes, so what was looked up stays for a week
  const out = await (over ? settledPages : freshPages)(browseUrl(q, today))
  return { ...out, pages: Math.min(BROWSE_PAGES, Math.ceil(out.count / BROWSE_PAGE)) }
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
  const steamy = new Set<string>()
  const [upcoming, recent, wished, soon, sports] = await Promise.all([
    safe(rawg(`${today},${shift(today, 730)}`, 5, steamy)), safe(rawg(`${shift(today, -60)},${shift(today, -1)}`, 4, steamy)),
    safe(steamList('popularwishlist', 1500)), safe(steamList('popularcomingsoon', 600)), safe(esports()),
  ])
  const releases = [...new Map([...upcoming, ...recent].map((e) => [e.id, e])).values()]
  const [pc, scores] = await Promise.all([
    safe(steam([...wished, ...soon], new Set(releases.map((e) => same(e.title))), today)),
    steamScores(releases, steamy, today).catch(() => new Map<string, number>()), // a failing lookup only leaves games without a score
  ])
  const scored = releases.map((e) => (scores.has(e.id) ? { ...e, metacritic: scores.get(e.id) } : e))
  const events = [...scored, ...pc, ...sports].sort((a, b) => a.start.localeCompare(b.start)).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as Ev)
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
    const ev = g ? rawgEv(g, true) : null
    if (ev && g && !ev.metacritic && ev.start && ev.start <= iso(new Date()) && onSteam(g) && steamOn()) { // no score at RAWG: Steam's store page may have one (a failure here only leaves the game without)
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
