// Live data, server side only. Every source is optional and fails soft: whatever answers is shown.
//   RAWG        releases (upcoming + last 60 days), artwork, game pages, search and browse
//   Steam       the most wishlisted upcoming PC games, and Metacritic scores RAWG lacks for recent games
//   IGDB        (optional, Twitch login) more upcoming games, search, and critics' scores where Metacritic has none
//   PandaScore  esports series: running, upcoming and just finished

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { type BrowseQuery, type Ev, type Found, type Game, type Payload, type Platform, BROWSE_PAGE, BROWSE_PAGES, expandQuery, iso, lite, shift } from './core'
import { allow } from './limit'

const env = process.env
const RAWG = env.RAWG_BASE || 'https://api.rawg.io/api', STEAM = env.STEAM_BASE || 'https://store.steampowered.com', PANDA = env.PANDA_BASE || 'https://api.pandascore.co'
const HOUR = 3600, DAY = 86400

// RAWG keys: the first is used until RAWG refuses it (401/403: invalid, or its monthly limit reached), then the backup, for six hours
const RAWG_KEYS = [env.RAWG_API_KEY, env.RAWG_API_KEY_2].filter((k, i, all): k is string => !!k && all.indexOf(k) === i)
const keyDead = new Map<string, number>()
const liveKey = () => RAWG_KEYS.find((k) => (keyDead.get(k) ?? 0) < Date.now()) ?? RAWG_KEYS[0]
const withKey = (u: string) => (RAWG_KEYS.length && u.startsWith(RAWG) ? u.replace(/([?&]key=)[^&]*/, `$1${liveKey()}`) : u)

/** JSON kept in Next's data cache. null: it does not exist (400/404/410); undefined: unreachable or refused (never taken for "missing"). Retries 429, 5xx and network errors once. */
async function get<T>(url: string, revalidate = HOUR, headers?: Record<string, string>, tries = 2, timeout = 10000): Promise<T | null | undefined> {
  for (let attempt = 1; ; attempt++) {
    const target = withKey(url)
    try {
      const res = await fetch(target, { headers, next: { revalidate }, signal: AbortSignal.timeout(timeout) })
      if (res.ok) return (await res.json()) as T
      if ([400, 404, 410].includes(res.status)) return null
      if ((res.status === 401 || res.status === 403) && RAWG_KEYS.length > 1 && target.startsWith(RAWG)) {
        const used = new URL(target).searchParams.get('key') ?? ''
        keyDead.set(used, Date.now() + 6 * HOUR * 1000)
        if (liveKey() !== used) { attempt--; continue } // another key is left: straight away
      }
      if (res.status < 500 && res.status !== 429) return undefined
    } catch {}
    if (attempt >= tries) return undefined
    await new Promise((r) => setTimeout(r, 1200 * attempt))
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
  if (!lenient && (!g.released || (!g.background_image && (g.added ?? 0) < 300))) return null // a big game without artwork yet (GTA VI, say) still belongs on the calendar
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
interface Health { total: number; failed: number } // RAWG pages asked, and pages that got no answer (refused, throttled, down)
async function rawg(dates: string, max: number, steamy: Set<string>, revalidate = HOUR, health?: Health): Promise<Ev[]> {
  const key = env.RAWG_API_KEY
  if (!key) return []
  const all = await pages(max, (p) => get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&dates=${dates}&ordering=-added&page_size=40&page=${p}`, revalidate))
  if (health) { health.total += max; health.failed += all.filter((r) => r === undefined).length }
  const games = all.flatMap((r) => r?.results ?? [])
  for (const g of games) if (onSteam(g)) steamy.add(`rawg-${g.id}`)
  return games.flatMap((g) => rawgEv(g) ?? [])
}

/**
 * Everything RAWG lists as coming in the next two years, in three windows. One list of the 200 most followed would let the next
 * months' games be crowded out by far-off ones: here each period keeps its own most followed. The far windows change slowly and
 * are asked every six hours, which keeps the total below what one list asked hourly used to cost.
 */
async function upcomingGames(today: string, steamy: Set<string>, health: Health): Promise<Ev[]> {
  const lists = await Promise.all([
    rawg(`${today},${shift(today, 120)}`, 4, steamy, HOUR, health),
    rawg(`${shift(today, 121)},${shift(today, 300)}`, 3, steamy, 6 * HOUR, health),
    rawg(`${shift(today, 301)},${shift(today, 730)}`, 3, steamy, 6 * HOUR, health),
  ])
  return lists.flat()
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
  // kept five days: keeps RAWG's monthly quota safe even when crawlers visit every page
  const at = <T,>(sub = '') => get<T>(`${RAWG}/games/${slug}${sub}?key=${key}`, 5 * DAY)
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
  const critics = g.metacritic || fromSteam || !out ? undefined : await igdbScoreOf(g.name) // still none: IGDB's critics, if it is on
  return {
    id: `rawg-${g.id}`, slug: g.slug, name: g.name, description: g.description_raw?.trim() || undefined, released: g.released ?? undefined,
    website: g.website || undefined, image: g.background_image ? rawgImg(g.background_image, 1920) : undefined,
    rating: g.rating || undefined, metacritic: g.metacritic || fromSteam || critics, scoreFrom: !g.metacritic && !fromSteam && critics ? 'IGDB critics' : undefined, esrb: g.esrb_rating?.name, playtime: g.playtime || undefined,
    genres: names(g.genres), tags: names(g.tags?.filter((t) => !t.language || t.language === 'eng')).slice(0, 10),
    platforms: (g.platforms ?? []).map((p) => p.platform.name), developers: names(g.developers), publishers: names(g.publishers),
    screenshots: (shots?.results ?? []).slice(0, 8).map((s) => rawgImg(s.image, 1920)),
    trailer: clip ? { preview: clip.preview, src: (clip.data.max || clip.data[480]) as string } : undefined,
    stores: (stores?.results ?? []).flatMap((s) => { const name = store.get(s.store_id); return name && s.url ? [{ name, url: s.url }] : [] }),
  }
}

/** Titles compared the way people read them: no case, accents, apostrophes or punctuation. */
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** How well a title answers what was typed, under any of its spellings: the exact name, its start, or all of its words. */
function relevance(title: string, variants: string[]) {
  const t = fold(title), words = t.split(' ')
  let best = 0
  for (const v of variants) {
    const f = fold(v)
    if (!f) continue
    const score = t === f ? 100 : t.startsWith(f) ? 70 : f.split(' ').every((x) => words.some((w) => w.startsWith(x))) ? 40 : 0
    if (score > best) best = score
  }
  return best
}

/** Any game by name: the search boxes use this. RAWG and Steam's store are both asked, under every spelling of the name. */
export async function searchGames(q: string): Promise<Found[]> {
  const term = q.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (term.length < 2) return []
  const key = env.RAWG_API_KEY, variants = expandQuery(term).slice(0, 2), enc = encodeURIComponent
  // "gta" is asked as typed and as "grand theft auto": the series by popularity, so its main games come first
  const [rawgs, shops, igs] = await Promise.all([
    Promise.all(variants.map((v, i) => (key ? get<{ results?: Rawg[] }>(`${RAWG}/games?key=${key}&search=${enc(v)}&page_size=${i ? 30 : 12}${i ? '&ordering=-added' : ''}`, 12 * HOUR) : undefined))),
    Promise.all(variants.slice(0, 2).map((v) => (steamOn() ? get<{ items?: { id: number; name: string; type?: string; metascore?: string }[] }>(`${STEAM}/api/storesearch/?term=${enc(v)}&l=english&cc=us`) : undefined))),
    Promise.all(variants.map((v, i) => igdb(`search "${igq(v)}"; fields ${IG_FIELDS}; where version_parent = null; limit ${i ? 30 : 15};`, 12 * HOUR))),
  ])
  const found = new Map<string, { f: Found; rel: number; score: number }>(), seen = new Set<string>()
  for (const g of rawgs.flatMap((r) => r?.results ?? [])) {
    const id = `rawg-${g.id}`
    if (found.has(id)) continue
    const rel = relevance(g.name, variants), pop = Math.min(30, Math.log10(1 + (g.added ?? 0)) * 8)
    found.set(id, { rel, score: rel + pop, f: { key: id, slug: g.slug, title: g.name, released: g.released ?? undefined, thumb: g.background_image ? rawgImg(g.background_image, 640) : '', metacritic: g.metacritic || undefined } })
    seen.add(same(g.name))
  }
  // Steam knows many games RAWG lacks. Its search gives no release date, so those are marked "undated": they may well be out.
  for (const s of shops.flatMap((r) => r?.items ?? [])) {
    const title = clean(s.name ?? ''), id = `steam-${s.id}`
    if (!title || (s.type && s.type !== 'app') || found.has(id) || seen.has(same(title))) continue
    seen.add(same(title))
    const rel = relevance(title, variants)
    found.set(id, { rel, score: rel, f: { key: id, slug: kebab(`steam ${s.id} ${title}`), title, thumb: `https://cdn.cloudflare.steamstatic.com/steam/apps/${s.id}/header.jpg`, metacritic: Number(s.metascore) || undefined, undated: true } })
  }
  // IGDB knows many more games, and has dates for the unreleased ones
  for (const g of igs.flatMap((r) => r ?? [])) {
    const title = clean(g.name), id = `igdb-${g.id}`
    if (found.has(id) || seen.has(same(title))) continue
    seen.add(same(title))
    const rel = relevance(title, variants), pop = Math.min(30, Math.log10(1 + (g.follows ?? 0) * 3 + (g.hypes ?? 0) * 10 + (g.aggregated_rating_count ?? 0) * 40) * 8)
    const when = igdbWhen(g), pic = g.screenshots?.[0]?.image_id ?? g.artworks?.[0]?.image_id, cover = g.cover?.image_id
    found.set(id, { rel, score: rel + pop, f: { key: id, slug: kebab(`igdb ${g.id} ${title}`), title, released: when?.start, thumb: pic ? igImg(pic, 'screenshot_big') : cover ? igImg(cover, 'cover_big') : '', metacritic: igdbScore(g) } })
  }
  const all = [...found.values()], good = all.filter((x) => x.rel > 0) // fuzzy matches that share nothing with the name only fill in when little else was found
  return (good.length >= 5 ? good : all).sort((a, b) => b.score - a.score).slice(0, 24).map((x) => x.f)
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
  if (q.q) { const v = expandQuery(q.q); p.set('search', v.length > 1 ? v[1] : q.q) } // "gta" browses Grand Theft Auto
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
const freshPages = browsed(24 * HOUR), settledPages = browsed(7 * DAY)

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
  const released = steamDate(a.release_date?.date), critics = a.metacritic?.score || !released || released > iso(new Date()) ? undefined : await igdbScoreOf(clean(a.name))
  const text = (html = '') =>
    decode(html.replace(/<li[^>]*>/gi, '• ').replace(/<br\s*\/?>|<\/(?:p|li|h\d|ul)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  const shots = a.screenshots ?? [], name = clean(a.name)
  return {
    id: `steam-${id}`, slug: kebab(`steam ${id} ${name}`), name, description: text(a.about_the_game) || a.short_description,
    released: steamDate(a.release_date?.date), website: a.website || undefined, image: shots[0]?.path_full ?? a.header_image, metacritic: a.metacritic?.score || critics, scoreFrom: !a.metacritic?.score && critics ? 'IGDB critics' : undefined,
    genres: (a.genres ?? []).map((g) => g.description), tags: [], developers: a.developers ?? [], publishers: a.publishers ?? [],
    platforms: (['windows', 'mac', 'linux'] as const).filter((p) => a.platforms?.[p]).map((p) => ({ windows: 'PC', mac: 'macOS', linux: 'Linux' })[p]),
    screenshots: shots.slice(0, 8).map((s) => s.path_full), stores: [{ name: 'Steam', url: `https://store.steampowered.com/app/${id}` }],
  }
}

// ── IGDB (Twitch): optional, no monthly cap. Empty TWITCH_* = off, and everything else works as before ──

const TWITCH = env.TWITCH_BASE || 'https://id.twitch.tv', IGDB = env.IGDB_BASE || 'https://api.igdb.com/v4'
const igdbOn = () => !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET)
const unix = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let igToken: { value: string; until: number } | null = null
async function igdbAuth(fresh = false): Promise<string | null> {
  if (!igdbOn()) return null
  if (!fresh && igToken && igToken.until > Date.now() + 60_000) return igToken.value
  try {
    const res = await fetch(`${TWITCH}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store', signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID!, client_secret: env.TWITCH_CLIENT_SECRET!, grant_type: 'client_credentials' }),
    })
    const j = res.ok ? ((await res.json()) as { access_token?: string; expires_in?: number }) : null
    if (!j?.access_token) return null
    igToken = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 }
    return j.access_token
  } catch { return null }
}

let igGate: Promise<void> = Promise.resolve() // IGDB allows about four requests a second: starts are spaced out
async function igdbPost<T>(endpoint: string, body: string): Promise<T[] | undefined> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const turn = igGate
    igGate = turn.then(() => sleep(270))
    await turn
    const token = await igdbAuth(attempt > 1) // a second try signs in again: the token may have expired
    if (!token) return undefined
    try {
      const res = await fetch(`${IGDB}/${endpoint}`, {
        method: 'POST', headers: { 'Client-ID': env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${token}`, Accept: 'application/json' }, body, cache: 'no-store', signal: AbortSignal.timeout(12000),
      })
      if (res.ok) return (await res.json()) as T[]
      if (res.status === 400) return undefined // a query IGDB does not accept: asking again will not help
    } catch {}
    await sleep(800)
  }
  return undefined
}

interface IgdbGame {
  id: number; name: string; first_release_date?: number; hypes?: number; follows?: number; aggregated_rating?: number; aggregated_rating_count?: number
  summary?: string; storyline?: string
  cover?: { image_id: string }; artworks?: { image_id: string }[]; screenshots?: { image_id: string }[]
  genres?: { name: string }[]; themes?: { name: string }[]; platforms?: { name: string }[]; release_dates?: { date?: number; human?: string }[]
  websites?: { url: string }[]; involved_companies?: { developer?: boolean; publisher?: boolean; company?: { name: string } }[]
}
const IG_FIELDS = 'name,first_release_date,hypes,follows,aggregated_rating,aggregated_rating_count,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,platforms.name,release_dates.date,release_dates.human'
const IG_DETAIL = `${IG_FIELDS},summary,storyline,themes.name,websites.url,involved_companies.developer,involved_companies.publisher,involved_companies.company.name`
const igq = (s: string) => s.replace(/["\\]/g, ' ')

const igdbKept = new Map<number, (body: string) => Promise<IgdbGame[]>>()
/** A query on IGDB's games, kept in Next's data cache for `revalidate` seconds. undefined: off, or it did not answer (never kept). */
function igdb(body: string, revalidate: number): Promise<IgdbGame[] | undefined> {
  if (!igdbOn()) return Promise.resolve(undefined)
  let ask = igdbKept.get(revalidate)
  if (!ask) {
    ask = unstable_cache(async (b: string) => {
      const rows = await igdbPost<IgdbGame>('games', b)
      if (!rows) throw new Error('IGDB did not answer')
      return rows
    }, ['igdb', String(revalidate)], { revalidate })
    igdbKept.set(revalidate, ask)
  }
  return ask(body).catch(() => undefined)
}

const igImg = (id: string, size: 'cover_big' | 'screenshot_med' | 'screenshot_big' | '1080p') => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`
function igdbPlatform(n: string): Platform | undefined {
  return /playstation|ps ?vita|\bpsp\b/i.test(n) ? 'PlayStation' : /xbox/i.test(n) ? 'Xbox' : /nintendo|\bwii|game ?boy|switch/i.test(n) ? 'Nintendo'
    : /^(ios|android)/i.test(n) ? 'Mobile' : /\bpc\b|windows|mac|linux|web browser/i.test(n) ? 'PC' : undefined
}
/** IGDB's critics' average, when enough of them rated the game for it to mean something. */
const igdbScore = (g: IgdbGame) => ((g.aggregated_rating_count ?? 0) >= 3 && g.aggregated_rating ? Math.round(g.aggregated_rating) : undefined)

/** The date IGDB gives, as the calendar wants it: a day, or a month (tba). A year, a quarter or "TBD" stays off the calendar, unless `lenient`. */
function igdbWhen(g: IgdbGame, lenient = false): { start: string; tba?: boolean; exact?: boolean } | null {
  if (!g.first_release_date) return lenient ? { start: '', tba: true } : null
  const day = new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
  const human = g.release_dates?.find((r) => r.date === g.first_release_date)?.human ?? ''
  if (/^[a-z]{3,9}\.? \d{1,2}, \d{4}$/i.test(human)) return { start: day, exact: true }
  if (/^[a-z]{3,9}\.? \d{4}$/i.test(human)) return { start: day, tba: true }
  return lenient ? { start: day, tba: true } : null
}

function igdbEv(g: IgdbGame, lenient = false): Ev | null {
  const when = igdbWhen(g, lenient)
  if (!when) return null
  const art = g.screenshots?.[0]?.image_id ?? g.artworks?.[0]?.image_id, cover = g.cover?.image_id, pic = art ?? cover
  if (!lenient && !pic && (g.hypes ?? 0) < 20) return null // no artwork at all, and not a game people wait for
  const platforms = [...new Set((g.platforms ?? []).map((p) => igdbPlatform(p.name)).filter(Boolean))] as Platform[]
  const title = clean(g.name)
  return {
    id: `igdb-${g.id}`, slug: kebab(`igdb ${g.id} ${title}`), title, kind: 'release', start: when.start, tba: when.tba || undefined,
    platforms: platforms.length ? platforms : ['PC'], thumb: art ? igImg(art, 'screenshot_big') : cover ? igImg(cover, 'cover_big') : '', image: pic ? igImg(pic, '1080p') : undefined,
    shots: (g.screenshots ?? []).slice(1, 5).map((x) => igImg(x.image_id, 'screenshot_med')), genres: (g.genres ?? []).map((x) => x.name),
    metacritic: igdbScore(g), pop: Math.min(2500, (g.hypes ?? 0) * 10 + (g.follows ?? 0)),
  }
}

/** Games IGDB lists as coming in the next two years that people follow: the near months often, the far ones daily. */
async function igdbUpcoming(today: string): Promise<Ev[]> {
  if (!igdbOn()) return []
  const q = (from: number, to: number) => `fields ${IG_FIELDS}; where first_release_date >= ${unix(shift(today, from))} & first_release_date <= ${unix(shift(today, to))} & (hypes > 0 | follows > 0) & version_parent = null; sort hypes desc; limit 300;`
  const [near, far] = await Promise.all([igdb(q(0, 120), 3 * HOUR), igdb(q(121, 730), DAY)])
  return [...(near ?? []), ...(far ?? [])].flatMap((g) => igdbEv(g) ?? [])
}

/** Critics' scores of the games released lately, by title: a fallback for games Metacritic has no score for. */
async function igdbScores(today: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await igdb(`fields name,aggregated_rating,aggregated_rating_count; where first_release_date >= ${unix(shift(today, -90))} & first_release_date <= ${unix(today)} & aggregated_rating_count >= 3 & version_parent = null; sort aggregated_rating_count desc; limit 500;`, 3 * HOUR)
  for (const g of rows ?? []) { const n = igdbScore(g); if (n && !out.has(same(g.name))) out.set(same(g.name), n) }
  return out
}
/** One game's critic score by its title (for a game page whose source has no score). */
async function igdbScoreOf(title: string): Promise<number | undefined> {
  const rows = await igdb(`search "${igq(title)}"; fields name,aggregated_rating,aggregated_rating_count; where aggregated_rating_count >= 3; limit 8;`, 3 * DAY)
  const hit = rows?.find((g) => same(g.name) === same(title))
  return hit ? igdbScore(hit) : undefined
}

async function igdbGame(id: string): Promise<Game | null> {
  const rows = await igdb(`fields ${IG_DETAIL}; where id = ${Number(id)};`, DAY)
  if (rows === undefined) throw new Error('IGDB is unreachable')
  const g = rows[0]
  if (!g) return null
  const name = clean(g.name), when = igdbWhen(g, true), pics = [...(g.screenshots ?? []), ...(g.artworks ?? [])]
  const shop: [RegExp, string][] = [
    [/store\.steampowered\.com/, 'Steam'], [/store\.playstation\.com/, 'PlayStation Store'], [/xbox\.com|microsoft\.com/, 'Xbox'], [/nintendo\.com/, 'Nintendo eShop'],
    [/epicgames\.com/, 'Epic Games Store'], [/gog\.com/, 'GOG'], [/apps\.apple\.com/, 'App Store'], [/play\.google\.com/, 'Google Play'], [/itch\.io/, 'itch.io'],
  ]
  const stores = (g.websites ?? []).flatMap((w) => { const name = shop.find(([re]) => re.test(w.url))?.[1]; return name ? [{ name, url: w.url }] : [] })
  const social = /twitter\.com|x\.com|facebook\.com|youtube\.com|youtu\.be|twitch\.tv|discord|reddit\.com|wikipedia\.org|instagram\.com|fandom\.com|wikia|igdb\.com|tiktok\.com|bsky\.app/
  const people = (k: 'developer' | 'publisher') => (g.involved_companies ?? []).filter((c) => c[k] && c.company).map((c) => c.company!.name)
  const score = igdbScore(g)
  return {
    id: `igdb-${g.id}`, slug: kebab(`igdb ${g.id} ${name}`), name, description: [g.summary, g.storyline].filter(Boolean).join('\n\n') || undefined,
    released: when?.exact ? when.start : undefined, website: (g.websites ?? []).find((w) => !social.test(w.url) && !shop.some(([re]) => re.test(w.url)))?.url,
    image: pics[0] ? igImg(pics[0].image_id, '1080p') : g.cover ? igImg(g.cover.image_id, '1080p') : undefined,
    metacritic: score, scoreFrom: score ? 'IGDB critics' : undefined,
    genres: (g.genres ?? []).map((x) => x.name), tags: (g.themes ?? []).map((x) => x.name), platforms: (g.platforms ?? []).map((x) => x.name),
    developers: people('developer'), publishers: people('publisher'), screenshots: pics.slice(0, 8).map((x) => igImg(x.image_id, '1080p')), stores,
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
  const steamy = new Set<string>(), health: Health = { total: 0, failed: 0 }
  const [upcoming, recent, wished, soon, sports] = await Promise.all([
    safe(upcomingGames(today, steamy, health)), safe(rawg(`${shift(today, -60)},${shift(today, -1)}`, 4, steamy, 3 * HOUR, health)),
    safe(steamList('popularwishlist', 1500)), safe(steamList('popularcomingsoon', 600)), safe(esports()),
  ])
  // RAWG is where most of the games come from. If most of its pages got no answer (quota used up, outage), the rest would pass for a complete
  // calendar with a month or two nearly empty and be kept for an hour: better to fail, so the last good calendar stays up and the next visit asks again
  if (env.RAWG_API_KEY && health.total && health.failed * 2 > health.total) throw new Error(`RAWG did not answer (${health.failed} of ${health.total} pages)`)
  const releases = [...new Map([...upcoming, ...recent].map((e) => [e.id, e])).values()]
  const [pc, scores, critics, more] = await Promise.all([
    safe(steam([...wished, ...soon], new Set(releases.map((e) => same(e.title))), today)),
    steamScores(releases, steamy, today).catch(() => new Map<string, number>()),
    igdbScores(today).catch(() => new Map<string, number>()),
    safe(igdbUpcoming(today)),
  ])
  // IGDB adds the games the others lack (the same title is never listed twice); where no Metacritic score exists, its critics' average stands in
  const have = new Set([...releases, ...pc].map((e) => same(e.title)))
  const extra = more.filter((e) => !have.has(same(e.title)))
  const fill = (e: Ev): Ev => (e.metacritic || e.start > today || !critics.has(same(e.title)) ? e : { ...e, metacritic: critics.get(same(e.title)) })
  const scored = releases.map((e) => fill(scores.has(e.id) ? { ...e, metacritic: scores.get(e.id) } : e))
  const events = [...scored, ...pc.map(fill), ...extra, ...sports].sort((a, b) => a.start.localeCompare(b.start)).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as Ev)
  if (!events.length) throw new Error('No source answered')
  return { events, updated: new Date().toISOString(), sources: { rawg: releases.length, steam: pc.length, ...(igdbOn() && { igdb: extra.length }), esports: sports.length } }
}

/** The merged calendar kept in Next's data cache for ten minutes, keyed by the settings that shape it: a cold server instance reads it in one lookup, not hundreds. */
const kept = unstable_cache(load, ['events', env.PANDASCORE_TIERS || '', env.STEAM_UPCOMING || '', String(!!env.RAWG_API_KEY), String(!!env.PANDASCORE_TOKEN), String(igdbOn())], { revalidate: 600 })
let run: { at: number; data: ReturnType<typeof load> } | null = null // one load per server instance for 5 minutes
let last: Awaited<ReturnType<typeof load>> | null = null // the last good data, for when every source fails

let downUntil = 0 // after a failed load, no new attempt for a minute: a source that is out of quota is not helped by a request per visitor
export async function getEvents(): Promise<Payload> {
  const today = iso(new Date())
  const fallback = (): Payload => last
    ? { ...last, today, stale: true }
    : { events: [], today, updated: new Date().toISOString(), stale: true, error: env.RAWG_API_KEY ? 'RAWG or another data source did not answer: its quota may be used up.' : 'RAWG_API_KEY is not set.' }
  if (Date.now() < downUntil) return fallback()
  if (!run || Date.now() - run.at > 3e5) run = { at: Date.now(), data: kept() }
  try {
    last = await run.data
    return { ...last, today, stale: false }
  } catch (e) {
    run = null
    downUntil = Date.now() + 60_000
    return fallback()
  }
}

/** The source's own copy of a game. Throws when the source cannot be reached: an outage is never "no such game". */
export async function fromSource(key: string): Promise<Ev | null> {
  const [, src, id] = key.match(/^(rawg|steam|igdb)-(\d+)$/) ?? []
  if (src === 'rawg' && env.RAWG_API_KEY) {
    // RAWG's single-game endpoint is its slowest and flakiest one: three tries, up to 15 seconds each
    const g = await get<Rawg>(`${RAWG}/games/${id}?key=${env.RAWG_API_KEY}`, DAY, undefined, 3, 15000)
    if (g === undefined) throw new Error('RAWG is unreachable')
    const ev = g ? rawgEv(g, true) : null
    if (ev && g && !ev.metacritic && ev.start && ev.start <= iso(new Date()) && onSteam(g) && steamOn()) {
      try { // a missing score must never stop a game from being saved
        const app = steamAppOf(await rawgStores(id)), score = app ? await steamScore(app) : null
        if (score) ev.metacritic = score
      } catch {}
    }
    return ev
  }
  if (src === 'igdb' && igdbOn()) {
    const rows = await igdb(`fields ${IG_FIELDS}; where id = ${Number(id)};`, DAY)
    if (rows === undefined) throw new Error('IGDB is unreachable')
    return rows[0] ? igdbEv(rows[0], true) : null
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
  const igdbId = slug.match(/^igdb-(\d+)/)?.[1]
  const game = await (igdbId ? (igdbOn() ? igdbGame(igdbId) : null) : steamId ? steamGame(steamId) : rawgGame(slug))
  if (!game) {
    if (missing.size > 500) missing.clear()
    missing.set(slug, Date.now() + 600_000)
  }
  return game
})
