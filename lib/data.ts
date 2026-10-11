// Live data, server side only. IGDB is the catalog (calendar, browse, search, game pages); Steam adds PC upcoming games, Metacritic
// scores, trailers and long descriptions; PandaScore adds esports. Each source fails soft: whatever answers is shown.
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { type BrowseQuery, type Ev, type Found, type Game, type Payload, type Platform, BROWSE_PAGE, BROWSE_PAGES, expandQuery, iso, lite, shift } from './core'
import { allow } from './db'

const env = process.env
const STEAM = env.STEAM_BASE || 'https://store.steampowered.com', PANDA = env.PANDA_BASE || 'https://api.pandascore.co'
const TWITCH = env.TWITCH_BASE || 'https://id.twitch.tv', IGDB = env.IGDB_BASE || 'https://api.igdb.com/v4', IGDB_IMG = env.IGDB_IMG_BASE || 'https://images.igdb.com/igdb/image/upload'
const HOUR = 3600, DAY = 86400
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** JSON via Next's data cache. null: does not exist (400/404/410); undefined: unreachable or refused, never taken for missing. */
async function get<T>(url: string, revalidate = HOUR, headers?: Record<string, string>, tries = 2, timeout = 10000): Promise<T | null | undefined> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers, next: { revalidate }, signal: AbortSignal.timeout(timeout) })
      if (res.ok) return (await res.json()) as T
      void res.body?.cancel().catch(() => {})
      if ([400, 404, 410].includes(res.status)) return null
      if (res.status < 500 && res.status !== 429) return undefined
    } catch {}
    if (attempt >= tries) return undefined
    await sleep(1200 * attempt)
  }
}
const pages = <T,>(n: number, page: (p: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => page(i + 1)))
/** Runs `job` over `items`, `n` at a time, for at most `ms`; a job returning false (source throttled or down) stops the rest. */
async function each<T>(items: T[], n: number, ms: number, job: (item: T, i: number) => Promise<boolean | void>) {
  let next = 0, down = false
  const until = Date.now() + ms
  await Promise.all(Array.from({ length: n }, async () => {
    for (let i = next++; i < items.length && !down && Date.now() <= until; i = next++) if ((await job(items[i], i)) === false) down = true
  }))
}

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const same = (s: string) => kebab(s).replace(/^the-/, '') // "same game" across sources
const clean = (s: string) => s.replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim()
const decode = (s: string) => s.replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_, d, h, n: string) =>
  d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n.toLowerCase() as 'amp'])
/** Steam's HTML descriptions as plain paragraphs and bullets. */
const htmlText = (html = '') =>
  decode(html.replace(/<li[^>]*>/gi, '• ').replace(/<br\s*\/?>|<\/(?:p|li|h\d|ul)>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
const steamOn = () => env.STEAM_UPCOMING !== 'off'

// ── IGDB: the catalog (needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET; no monthly cap, about four requests a second) ──

const igdbOn = () => !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET)
const unix = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000)

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
async function igdbPost<T>(endpoint: string, body: string): Promise<T | undefined> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const turn = igGate
    igGate = turn.then(() => sleep(270))
    await turn
    const token = await igdbAuth(attempt > 1) // a second try signs in again: the token may have expired
    if (!token) return undefined
    try {
      const res = await fetch(`${IGDB}/${endpoint}`, { method: 'POST', headers: { 'Client-ID': env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${token}`, Accept: 'application/json' }, body, cache: 'no-store', signal: AbortSignal.timeout(12000) })
      if (res.ok) return (await res.json()) as T
      void res.body?.cancel().catch(() => {})
      if (res.status === 400) return undefined // a query IGDB refuses: asking again will not help
    } catch {}
    await sleep(800)
  }
  return undefined
}

interface IgdbGame {
  id: number; name: string; slug?: string; first_release_date?: number; hypes?: number
  aggregated_rating?: number; aggregated_rating_count?: number; rating?: number; rating_count?: number; total_rating_count?: number
  summary?: string; storyline?: string; cover?: { image_id: string }; artworks?: { image_id: string }[]; screenshots?: { image_id: string }[]
  genres?: { name: string }[]; themes?: { name: string }[]; platforms?: { name: string }[]; release_dates?: { date?: number; date_format?: number; human?: string }[]
  websites?: { url: string }[]; videos?: { video_id: string; name?: string }[]; involved_companies?: { developer?: boolean; publisher?: boolean; company?: { name: string } }[]
  age_ratings?: { organization?: { name?: string }; rating_category?: { rating?: string } }[]
}
const IG_FIELDS = 'name,slug,first_release_date,hypes,aggregated_rating,aggregated_rating_count,rating,rating_count,total_rating_count,cover.image_id,artworks.image_id,screenshots.image_id,genres.name,platforms.name,release_dates.date,release_dates.date_format,release_dates.human'
const IG_DETAIL = `${IG_FIELDS},summary,storyline,themes.name,websites.url,videos.video_id,videos.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name`
/** Games, not their add-ons: main games, standalone expansions, remakes, remasters and expanded editions; never a second listing of the same game. */
const CATALOG = 'version_parent = null & game_type = (0,4,8,9,10)'
const igq = (s: string) => s.replace(/["\\]/g, ' ')

const igdbKept = new Map<number, (endpoint: string, body: string) => Promise<unknown>>()
/** A query kept in Next's data cache; undefined: IGDB is off, refused it or did not answer (never kept). */
function igdb<T = IgdbGame[]>(body: string, revalidate: number, endpoint = 'games'): Promise<T | undefined> {
  if (!igdbOn()) return Promise.resolve(undefined)
  let ask = igdbKept.get(revalidate)
  if (!ask) igdbKept.set(revalidate, (ask = unstable_cache(async (e: string, b: string) => {
    const rows = await igdbPost<unknown>(e, b)
    if (rows === undefined) throw new Error('IGDB did not answer')
    return rows
  }, ['igdb', String(revalidate)], { revalidate })))
  return (ask(endpoint, body) as Promise<T>).catch(() => undefined)
}

const igImg = (id: string, size: 'cover_big' | 'screenshot_med' | 'screenshot_big' | '1080p') => `${IGDB_IMG}/t_${size}/${id}.jpg`
const igdbPlatform = (n: string): Platform | undefined =>
  /playstation|ps ?vita|\bpsp\b/i.test(n) ? 'PlayStation' : /xbox/i.test(n) ? 'Xbox' : /nintendo|\bwii|game ?boy|switch/i.test(n) ? 'Nintendo'
    : /^(ios|android)/i.test(n) ? 'Mobile' : /\bpc\b|windows|mac|linux|web browser/i.test(n) ? 'PC' : undefined
/** Critics' average, once at least three have scored the game. */
const igdbScore = (g: IgdbGame) => ((g.aggregated_rating_count ?? 0) >= 3 && g.aggregated_rating ? Math.round(g.aggregated_rating) : undefined)
/** Players' average out of 5, once at least five have rated the game. */
const igdbPlayers = (g: IgdbGame) => ((g.rating_count ?? 0) >= 5 && g.rating ? Math.round(g.rating / 2) / 10 : undefined)

/** How exactly the first release date is known: a day, a month, or less (a year, a quarter, TBD). */
function precision(g: IgdbGame): 'day' | 'month' | 'vague' {
  const r = g.release_dates?.find((x) => x.date === g.first_release_date)
  if (typeof r?.date_format === 'number') return r.date_format === 0 ? 'day' : r.date_format === 1 ? 'month' : 'vague'
  const human = r?.human ?? ''
  return /^[a-z]{3,9}\.? \d{1,2}, \d{4}$/i.test(human) ? 'day' : /^[a-z]{3,9}\.? \d{4}$/i.test(human) ? 'month' : 'vague'
}
/** A day, or a month (tba). The calendar leaves a year, a quarter and "TBD" off; `any` keeps them (tba) and games with no date at all (start ''). */
function igdbWhen(g: IgdbGame, any = false): { start: string; tba?: boolean; exact?: boolean } | null {
  if (!g.first_release_date) return any ? { start: '', tba: true } : null
  const start = new Date(g.first_release_date * 1000).toISOString().slice(0, 10), p = precision(g)
  return p === 'day' ? { start, exact: true } : p === 'month' || any ? { start, tba: true } : null
}
/** calendar: a date and artwork (unless people are waiting for it); browse: any date; saved: whatever there is. */
function igdbEv(g: IgdbGame, mode: 'calendar' | 'browse' | 'saved' = 'calendar'): Ev | null {
  const when = igdbWhen(g, mode !== 'calendar')
  if (!when || (mode === 'browse' && !when.start)) return null
  const art = g.screenshots?.[0]?.image_id ?? g.artworks?.[0]?.image_id, cover = g.cover?.image_id, pic = art ?? cover
  if (mode === 'calendar' && !pic && (g.hypes ?? 0) < 20) return null // no artwork at all, and not a game people wait for
  const platforms = [...new Set((g.platforms ?? []).map((p) => igdbPlatform(p.name)).filter(Boolean))] as Platform[], title = clean(g.name)
  return {
    id: `igdb-${g.id}`, slug: g.slug || kebab(`igdb ${g.id} ${title}`), title, kind: 'release', start: when.start, tba: when.tba || undefined, platforms,
    thumb: art ? igImg(art, 'screenshot_big') : cover ? igImg(cover, 'cover_big') : '', image: pic ? igImg(pic, '1080p') : undefined,
    shots: (g.screenshots ?? []).slice(1, 5).map((x) => igImg(x.image_id, 'screenshot_med')), genres: (g.genres ?? []).map((x) => x.name),
    rating: igdbPlayers(g), metacritic: igdbScore(g), pop: Math.min(2500, (g.hypes ?? 0) * 10 + Math.min(500, g.total_rating_count ?? 0)),
  }
}

/** The next two years in windows, so far-off games never crowd out the next months; the last sixty days too. Sorted by who waits for them. */
const WINDOWS: { from: number; to: number; limit: number; keep: number }[] = [
  { from: 0, to: 120, limit: 300, keep: HOUR }, { from: 121, to: 300, limit: 200, keep: 6 * HOUR }, { from: 301, to: 730, limit: 200, keep: 6 * HOUR }, { from: -60, to: -1, limit: 250, keep: 3 * HOUR },
]
interface Health { total: number; failed: number }
async function igdbReleases(today: string, health: Health): Promise<Ev[]> {
  if (!igdbOn()) return []
  const lists = await Promise.all(WINDOWS.map(({ from, to, limit, keep }) => igdb(
    `fields ${IG_FIELDS}; where first_release_date >= ${unix(shift(today, from))} & first_release_date <= ${unix(shift(today, to))} & ${to < 0 ? '(hypes > 0 | total_rating_count > 0)' : 'hypes > 0'} & ${CATALOG}; sort hypes desc; limit ${limit};`, keep)))
  health.total += lists.length
  health.failed += lists.filter((l) => l === undefined).length
  return lists.flatMap((l) => l ?? []).flatMap((g) => igdbEv(g) ?? [])
}
/** Critics' average, for a Steam game's page where Steam has no Metacritic score. */
async function igdbScoreOf(title: string): Promise<number | undefined> {
  const rows = await igdb(`search "${igq(title)}"; fields name,aggregated_rating,aggregated_rating_count; where aggregated_rating_count >= 3; limit 8;`, 3 * DAY)
  const hit = rows?.find((g) => same(g.name) === same(title))
  return hit ? igdbScore(hit) : undefined
}

const SHOPS: [RegExp, string][] = [
  [/store\.steampowered\.com/, 'Steam'], [/store\.playstation\.com/, 'PlayStation Store'], [/xbox\.com|microsoft\.com/, 'Xbox'], [/nintendo\.com/, 'Nintendo eShop'],
  [/epicgames\.com/, 'Epic Games Store'], [/gog\.com/, 'GOG'], [/apps\.apple\.com/, 'App Store'], [/play\.google\.com/, 'Google Play'], [/itch\.io/, 'itch.io'],
]
const SOCIAL = /twitter\.com|x\.com|facebook\.com|youtube\.com|youtu\.be|twitch\.tv|discord|reddit\.com|wikipedia\.org|instagram\.com|fandom\.com|wikia|igdb\.com|tiktok\.com|bsky\.app/
const steamAppOf = (urls: string[]) => urls.map((u) => u.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean)

/** What only separate IGDB lists hold: hours to finish and the age rating. Both optional: a refusal never costs the page. */
async function igdbExtras(id: number) {
  const [beat, rated] = await Promise.all([
    igdb<{ normally?: number }[]>(`fields normally; where game_id = ${id}; limit 1;`, 3 * DAY, 'game_time_to_beats'),
    igdb(`fields age_ratings.organization.name,age_ratings.rating_category.rating; where id = ${id}; limit 1;`, 3 * DAY),
  ])
  const all = (rated?.[0]?.age_ratings ?? []).flatMap((a) => (a.organization?.name && a.rating_category?.rating ? [`${a.organization.name} ${a.rating_category.rating}`] : []))
  const hours = Math.round((beat?.[0]?.normally ?? 0) / 3600)
  return { age: all.find((a) => /^esrb/i.test(a)) ?? all.find((a) => /^pegi/i.test(a)) ?? all[0], playtime: hours > 0 ? hours : undefined }
}

/** A game page, by IGDB id or slug; Steam, when the game is on it, adds the score, the long description and a video file. */
async function igdbGame(where: string): Promise<Game | null> {
  if (!igdbOn()) return null
  const rows = await igdb(`fields ${IG_DETAIL}; where ${where}; limit 1;`, DAY)
  if (rows === undefined) throw new Error('IGDB is unreachable')
  const g = rows[0]
  if (!g) return null
  const urls = (g.websites ?? []).map((w) => w.url), appid = steamAppOf(urls)
  const [a, more] = await Promise.all([appid && steamOn() ? steamApp(appid) : null, igdbExtras(g.id)])
  const name = clean(g.name), when = igdbWhen(g, true), pics = [...(g.screenshots ?? []), ...(g.artworks ?? [])].map((x) => igImg(x.image_id, '1080p'))
  const people = (k: 'developer' | 'publisher') => (g.involved_companies ?? []).filter((c) => c[k] && c.company).map((c) => c.company!.name)
  const critics = igdbScore(g), steamScore = a?.metacritic?.score || undefined, own = [g.summary, g.storyline].filter(Boolean).join('\n\n'), long = a ? htmlText(a.about_the_game) : ''
  const shots = pics.length < 4 ? [...pics, ...(a?.screenshots ?? []).map((s) => s.path_full)] : pics
  const video = g.videos?.find((v) => /trailer/i.test(v.name ?? '')) ?? g.videos?.[0], clip = a && steamTrailer(a)
  const shops = (g.websites ?? []).flatMap((w) => { const shop = SHOPS.find(([re]) => re.test(w.url))?.[1]; return shop ? [{ name: shop, url: w.url }] : [] })
  return {
    id: `igdb-${g.id}`, slug: g.slug || kebab(`igdb ${g.id} ${name}`), name, description: (long.length > own.length ? long : own) || a?.short_description || undefined,
    released: when?.exact ? when.start : undefined, website: urls.find((u) => !SOCIAL.test(u) && !SHOPS.some(([re]) => re.test(u))) ?? (a?.website || undefined),
    image: pics[0] ?? (g.cover ? igImg(g.cover.image_id, '1080p') : undefined), rating: igdbPlayers(g), metacritic: steamScore ?? critics, scoreFrom: !steamScore && critics ? 'IGDB critics' : undefined,
    age: more.age, playtime: more.playtime, trailer: clip ?? (video ? { youtube: video.video_id } : undefined),
    genres: (g.genres ?? []).map((x) => x.name), tags: (g.themes ?? []).map((x) => x.name), platforms: (g.platforms ?? []).map((x) => x.name),
    developers: people('developer').length ? people('developer') : (a?.developers ?? []), publishers: people('publisher').length ? people('publisher') : (a?.publishers ?? []),
    screenshots: shots.slice(0, 8), stores: !appid || shops.some((s) => s.name === 'Steam') ? shops : [...shops, { name: 'Steam', url: `https://store.steampowered.com/app/${appid}` }],
  }
}

// ── Search: IGDB and Steam's store at once, under every spelling ──

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
/** How well a title answers any spelling of what was typed: the exact name, its start, or all its words. */
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

export async function searchGames(q: string): Promise<Found[]> {
  const term = q.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (term.length < 2) return []
  const variants = expandQuery(term).slice(0, 2), enc = encodeURIComponent
  // "gta" is asked as typed and as "grand theft auto": the series first, so its main games come first
  const [shops, igs] = await Promise.all([
    Promise.all(variants.map((v) => (steamOn() ? get<{ items?: { id: number; name: string; type?: string; metascore?: string }[] }>(`${STEAM}/api/storesearch/?term=${enc(v)}&l=english&cc=us`) : undefined))),
    Promise.all(variants.map((v, i) => igdb(`search "${igq(v)}"; fields ${IG_FIELDS}; where ${CATALOG}; limit ${i ? 30 : 15};`, 12 * HOUR))),
  ])
  const found = new Map<string, { f: Found; rel: number; score: number }>(), seen = new Set<string>()
  const add = (id: string, title: string, rel: number, pop: number, { slug, ...f }: Omit<Found, 'key' | 'title'>) => { seen.add(same(title)); found.set(id, { rel, score: rel + pop, f: { key: id, slug, title, ...f } }) }
  for (const g of igs.flatMap((r) => r ?? [])) {
    const title = clean(g.name), id = `igdb-${g.id}`, pic = g.screenshots?.[0]?.image_id ?? g.artworks?.[0]?.image_id, cover = g.cover?.image_id
    if (!found.has(id)) add(id, title, relevance(title, variants), Math.min(30, Math.log10(1 + (g.hypes ?? 0) * 10 + (g.total_rating_count ?? 0) * 5) * 8),
      { slug: g.slug || kebab(`igdb ${g.id} ${title}`), released: igdbWhen(g, true)?.start || undefined, thumb: pic ? igImg(pic, 'screenshot_big') : cover ? igImg(cover, 'cover_big') : '', metacritic: igdbScore(g) })
  }
  // Steam search gives no date: those are "undated" (they may well be out)
  for (const s of shops.flatMap((r) => r?.items ?? [])) {
    const title = clean(s.name ?? ''), id = `steam-${s.id}`
    if (title && (!s.type || s.type === 'app') && !found.has(id) && !seen.has(same(title))) add(id, title, relevance(title, variants), 0,
      { slug: kebab(`steam ${s.id} ${title}`), thumb: `https://cdn.cloudflare.steamstatic.com/steam/apps/${s.id}/header.jpg`, metacritic: Number(s.metascore) || undefined, undated: true })
  }
  const all = [...found.values()], good = all.filter((x) => x.rel > 0) // fuzzy matches that share nothing with the name only fill in when little else was found
  return (good.length >= 5 ? good : all).sort((a, b) => b.score - a.score).slice(0, 24).map((x) => x.f)
}

// ── Browse: every game in IGDB ──

/** 'busy': today's browsing allowance is spent; 'down': IGDB did not answer. */
export class BrowseError extends Error {
  constructor(public why: 'busy' | 'down') { super(why) }
}
/** Pages of browsing that may be looked up a day (each costs IGDB two requests). It guards against crawlers: IGDB itself has no monthly cap. */
const BROWSE_PER_DAY = Number(env.BROWSE_PER_DAY) || 4000
// IGDB's platform ids, by family
const PLATFORM_IDS: Record<Platform, string> = {
  PC: '6,14,3,82', PlayStation: '7,8,9,48,167,38,46', Xbox: '11,12,49,169', Nintendo: '18,19,4,21,5,41,130,508,24,33,22,20,37', Mobile: '34,39',
}
const GENRE_WHERE: Record<string, string> = {
  action: 'themes = (1)', adventure: 'genres = (31)', rpg: 'genres = (12)', shooter: 'genres = (5)', strategy: 'genres = (11,15,16)', simulation: 'genres = (13)',
  puzzle: 'genres = (9)', platformer: 'genres = (8)', racing: 'genres = (10)', sports: 'genres = (14)', fighting: 'genres = (4)', indie: 'genres = (32)', arcade: 'genres = (33)',
  horror: 'themes = (19)', survival: 'themes = (21)', 'open-world': 'themes = (38)', 'visual-novel': 'genres = (34)', 'card-board': 'genres = (35)', music: 'genres = (7)',
}

function browseWhere(q: BrowseQuery, today: string) {
  const w = [CATALOG, 'cover != null', 'first_release_date != null'] // a cover and a date: every game listed can be shown, and the count is the list
  if (q.year) w.push(`first_release_date >= ${unix(`${q.year}-01-01`)} & first_release_date <= ${unix(`${q.year}-12-31`)}`)
  else if (q.sort === 'newest' || q.sort === 'oldest') w.push(`first_release_date <= ${unix(today)}`) // by date: games that are out, not placeholders
  if (q.platform) w.push(`platforms = (${PLATFORM_IDS[q.platform]})`)
  if (q.genre && GENRE_WHERE[q.genre]) w.push(GENRE_WHERE[q.genre])
  if (!q.q) { // a sort needs something to sort by: games without it would come first
    if (q.sort === 'score') w.push('aggregated_rating_count >= 3')
    else if (q.sort === 'popular') w.push(+q.year >= +today.slice(0, 4) ? 'hypes > 0' : 'total_rating_count > 0')
  }
  return w.join(' & ')
}
const sortOf = (q: BrowseQuery, thisYear: number) =>
  ({ popular: +q.year >= thisYear ? 'hypes desc' : 'total_rating_count desc', score: 'aggregated_rating desc', newest: 'first_release_date desc', oldest: 'first_release_date asc', name: 'name asc' })[q.sort]

interface Browsed { count: number; items: Ev[] }
/** One page, kept by Next for every instance: only a page not kept asks IGDB and counts against the allowance. */
const browsed = (revalidate: number) => unstable_cache(async (key: string): Promise<Browsed> => {
  const [q, today] = JSON.parse(key) as [BrowseQuery, string]
  if (!igdbOn()) throw new BrowseError('down')
  if (!(await allow('browse:igdb', BROWSE_PER_DAY, 86400))) throw new BrowseError('busy')
  const where = browseWhere(q, today), show = (rows: IgdbGame[]) => rows.flatMap((g) => igdbEv(g, 'browse') ?? []).map(lite)
  const term = q.q && (expandQuery(q.q)[1] ?? q.q) // "gta" browses Grand Theft Auto
  if (term) { // a name: the best 500 by relevance, paged here
    const rows = await igdbPost<IgdbGame[]>('games', `search "${igq(term)}"; fields ${IG_FIELDS}; where ${where}; limit 500;`)
    if (!rows) throw new BrowseError('down') // never kept: the next visit asks again
    const items = show(rows)
    return { count: items.length, items: items.slice((q.page - 1) * BROWSE_PAGE, q.page * BROWSE_PAGE) }
  }
  const [rows, total] = await Promise.all([
    igdbPost<IgdbGame[]>('games', `fields ${IG_FIELDS}; where ${where}; sort ${sortOf(q, +today.slice(0, 4))}; limit ${BROWSE_PAGE}; offset ${(q.page - 1) * BROWSE_PAGE};`),
    igdbPost<{ count: number }>('games/count', `where ${where};`),
  ])
  if (!rows || !total) throw new BrowseError('down')
  return { count: total.count, items: show(rows) }
}, ['browse', String(revalidate)], { revalidate })
const freshPages = browsed(24 * HOUR), settledPages = browsed(7 * DAY)

export async function browseGames(q: BrowseQuery): Promise<Browsed & { pages: number }> {
  const today = iso(new Date()), over = !q.q && !!q.year && +q.year < +today.slice(0, 4) - 1 // a past year barely changes: kept a week
  const out = await (over ? settledPages : freshPages)(JSON.stringify([q, today]))
  return { ...out, pages: Math.min(BROWSE_PAGES, Math.ceil(out.count / BROWSE_PAGE)) }
}

// ── Steam (no key): PC upcoming games, Metacritic scores, trailers and long descriptions ──

interface SteamApp {
  type?: string; name: string; header_image?: string; short_description?: string; about_the_game?: string; website?: string | null
  developers?: string[]; publishers?: string[]; genres?: { description: string }[]; platforms?: Record<string, boolean>
  screenshots?: { path_thumbnail: string; path_full: string }[]; release_date?: { date?: string }
  metacritic?: { score?: number }; content_descriptors?: { ids?: number[] }; movies?: { thumbnail?: string; mp4?: { 480?: string; max?: string } }[]
}
interface Row { id: string; title: string; date?: string; pop: number }

/** Steam's exact dates ("Oct 28, 2026", "28 Oct, 2026"); vaguer ones ("Q4 2026") stay off the calendar. */
function steamDate(s = '') {
  const m = s.trim().match(/^(?:(\d{1,2})\s+([a-z]{3})[a-z]*,?|([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?)\s+(\d{4})$/i)
  const mon = m ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf((m[2] ?? m[3]).toLowerCase()) : -1
  return m && mon >= 0 && mon % 3 === 0 ? iso(new Date(+m[5], mon / 3, +(m[1] ?? m[4]))) : undefined
}
/** A store list, most popular first; `weight` levels its top with IGDB's most awaited games. */
async function steamList(filter: string, weight: number): Promise<Row[]> {
  if (!steamOn()) return []
  const res = await get<{ results_html?: string }>(`${STEAM}/search/results/?filter=${filter}&infinite=1&count=100&start=0&cc=us&l=english&ndl=1`)
  const rows = (res?.results_html ?? '').split('<a ').filter((a) => a.includes('data-ds-appid="'))
  return rows.flatMap((a, i) => {
    const id = a.match(/data-ds-appid="(\d+)"/)?.[1] // bundles carry several ids and are skipped
    return id ? [{ id, date: steamDate(decode(a.match(/search_released[^>]*>([^<]*)</)?.[1] ?? '')), title: decode(a.match(/class="title">([^<]*)</)?.[1] ?? ''), pop: Math.round(weight * (1 - i / rows.length)) }] : []
  })
}
const listed = (a: SteamApp) => (!a.type || a.type === 'game') && !a.content_descriptors?.ids?.some((x) => x === 3 || x === 4)
const steamApp = async (id: string) => {
  const res = await get<Record<string, { data?: SteamApp }>>(`${STEAM}/api/appdetails?appids=${id}&cc=us&l=english&filters=basic,release_date,genres,screenshots,movies,platforms,metacritic,developers,publishers,content_descriptors`, DAY)
  return res === undefined ? undefined : (res?.[id]?.data ?? null)
}
async function steam(rows: Row[], skip: Set<string>, today: string): Promise<Ev[]> {
  const best = new Map<string, Row>()
  for (const r of rows) if (r.date && r.date >= today && !skip.has(same(r.title)) && (best.get(r.id)?.pop ?? -1) < r.pop) best.set(r.id, r)
  const picks = [...best.values()].sort((a, b) => b.pop - a.pop).slice(0, 120), apps: (SteamApp | null | undefined)[] = []
  await each(picks, 8, 25000, async (r, i) => (apps[i] = await steamApp(r.id)) !== undefined)
  return picks.flatMap((r, i) => { const a = apps[i]; return (a && steamEv(r.id, a, r.date, r.pop)) || [] })
}
function steamEv(id: string, a: SteamApp, date: string | undefined, pop: number): Ev | null {
  if (!a.header_image || !listed(a)) return null
  const title = clean(a.name), shots = a.screenshots ?? []
  return {
    id: `steam-${id}`, slug: kebab(`steam ${id} ${title}`), title, kind: 'release', start: steamDate(a.release_date?.date) ?? date ?? '',
    platforms: ['PC'], thumb: a.header_image, image: shots[0]?.path_full ?? a.header_image, shots: shots.slice(0, 4).map((s) => s.path_thumbnail),
    genres: (a.genres ?? []).map((g) => g.description), metacritic: a.metacritic?.score, pop,
  }
}
/** Steam's first trailer as a video file. */
function steamTrailer(a: SteamApp): Game['trailer'] {
  const m = a.movies?.find((x) => x.mp4?.max || x.mp4?.[480]), src = m?.mp4?.max || m?.mp4?.[480]
  return src ? { src: src.replace(/^http:/, 'https:'), preview: m?.thumbnail?.replace(/^http:/, 'https:') } : undefined
}
async function steamGame(id: string): Promise<Game | null> {
  const a = await steamApp(id)
  if (a === undefined) throw new Error('Steam is unreachable')
  if (!a || !listed(a)) return null
  const released = steamDate(a.release_date?.date), name = clean(a.name), shots = a.screenshots ?? []
  const critics = a.metacritic?.score || !released || released > iso(new Date()) ? undefined : await igdbScoreOf(name)
  return {
    id: `steam-${id}`, slug: kebab(`steam ${id} ${name}`), name, description: htmlText(a.about_the_game) || a.short_description,
    released, website: a.website || undefined, image: shots[0]?.path_full ?? a.header_image, metacritic: a.metacritic?.score || critics, scoreFrom: !a.metacritic?.score && critics ? 'IGDB critics' : undefined,
    trailer: steamTrailer(a), genres: (a.genres ?? []).map((g) => g.description), tags: [], developers: a.developers ?? [], publishers: a.publishers ?? [],
    platforms: (['windows', 'mac', 'linux'] as const).filter((p) => a.platforms?.[p]).map((p) => ({ windows: 'PC', mac: 'macOS', linux: 'Linux' })[p]),
    screenshots: shots.slice(0, 8).map((s) => s.path_full), stores: [{ name: 'Steam', url: `https://store.steampowered.com/app/${id}` }],
  }
}
// ── PandaScore: esports series ──

interface Serie {
  id: number; full_name?: string; begin_at: string | null; end_at: string | null
  league?: { name: string; image_url?: string | null; url?: string | null }; videogame?: { name: string; slug: string }
  tournaments?: { tier?: string | null; prizepool?: string | null }[]
}
// PandaScore rarely links the event's page: the game's Liquipedia wiki is searched for it
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
  const list = (kind: string, n: number, size: number, sort = 'begin_at') => pages(n, (p) => get<Serie[]>(`${PANDA}/series/${kind}?sort=${sort}&page[size]=${size}&page[number]=${p}`, HOUR, { Authorization: `Bearer ${token}` }))
  const lists = await Promise.all([list('running', 2, 100), list('upcoming', 2, 100), list('past', 1, 50, '-end_at')]) // up to 200 running, 200 upcoming, the 50 just ended
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

/** Everything, merged and sorted by date. Each source starts as soon as it can. */
async function load() {
  const today = iso(new Date()), health: Health = { total: 0, failed: 0 }
  const sports = safe(esports()), lists = Promise.all([safe(steamList('popularwishlist', 1500)), safe(steamList('popularcomingsoon', 600))])
  const releases = [...new Map((await safe(igdbReleases(today, health))).map((e) => [e.id, e])).values()]
  // If most IGDB lists got no answer (outage, throttling), the rest would pass for a full calendar for an hour: failing keeps the last good one
  if (health.total && health.failed * 2 > health.total) throw new Error(`IGDB did not answer (${health.failed} of ${health.total} lists)`)
  const have = new Set(releases.map((e) => same(e.title)))
  const [pc, cups] = await Promise.all([lists.then(([wished, soon]) => safe(steam([...wished, ...soon], have, today))), sports]) // Steam adds the PC games IGDB does not list yet
  const events = [...releases, ...pc, ...cups].sort((a, b) => a.start.localeCompare(b.start)).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as Ev)
  if (!events.length) throw new Error('No source answered')
  return { events, updated: new Date().toISOString(), sources: { igdb: releases.length, steam: pc.length, esports: cups.length } }
}

/** Ten minutes in Next's data cache, keyed by the settings that shape it: a cold instance reads it in one lookup. */
const kept = unstable_cache(load, ['events', env.PANDASCORE_TIERS || '', env.STEAM_UPCOMING || '', String(!!env.PANDASCORE_TOKEN), String(igdbOn())], { revalidate: 600 })
let run: { at: number; data: ReturnType<typeof load> } | null = null // one load per instance for 5 minutes
let last: Awaited<ReturnType<typeof load>> | null = null // the last good data, for when every source fails
let downUntil = 0 // after a failure, no new try for a minute

export async function getEvents(): Promise<Payload> {
  const today = iso(new Date())
  const fallback = (): Payload => last
    ? { ...last, today, stale: true }
    : { events: [], today, updated: new Date().toISOString(), stale: true, error: igdbOn() ? 'IGDB or another data source did not answer.' : 'TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are not set: IGDB is the game database.' }
  if (Date.now() < downUntil) return fallback()
  if (!run || Date.now() - run.at > 3e5) run = { at: Date.now(), data: kept() }
  try {
    last = await run.data
    return { ...last, today, stale: false }
  } catch {
    run = null
    downUntil = Date.now() + 60_000
    return fallback()
  }
}

/** The source's own copy of a game. Throws when the source cannot be reached: an outage is never "no such game". */
export async function fromSource(key: string): Promise<Ev | null> {
  const [, src, id] = key.match(/^(steam|igdb)-(\d+)$/) ?? []
  if (src === 'igdb' && igdbOn()) {
    const rows = await igdb(`fields ${IG_FIELDS}; where id = ${Number(id)};`, DAY)
    if (rows === undefined) throw new Error('IGDB is unreachable')
    return rows[0] ? igdbEv(rows[0], 'saved') : null
  }
  if (src === 'steam') {
    const a = await steamApp(id)
    if (a === undefined) throw new Error('Steam is unreachable')
    return a ? steamEv(id, a, undefined, 0) : null
  }
  return null
}

/** Games players of this one also like: IGDB's own list for it, in the catalog's rules (no add-ons, no duplicate listings). Only IGDB games have one. */
export const getSimilar = cache(async (key: string): Promise<Ev[]> => {
  const id = key.match(/^igdb-(\d+)$/)?.[1]
  const ids = id ? (await igdb<{ similar_games?: number[] }[]>(`fields similar_games; where id = ${id}; limit 1;`, 3 * DAY))?.[0]?.similar_games?.slice(0, 24) : undefined
  if (!ids?.length) return []
  const rows = await igdb(`fields ${IG_FIELDS}; where id = (${ids.join(',')}) & ${CATALOG}; limit 24;`, 3 * DAY)
  return (rows ?? []).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)).flatMap((g) => igdbEv(g, 'browse') ?? []).slice(0, 12).map(lite)
})

const missing = new Map<string, number>() // slugs a source said do not exist, for ten minutes
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i

/** A game page (an IGDB slug, igdb-<id>-…, steam-<id>-…), once per request; impossible or just-missing slugs never reach a source. */
export const getGame = cache(async (slug: string): Promise<Game | null> => {
  if (!SLUG.test(slug) || (missing.get(slug) ?? 0) > Date.now()) return null
  const [, src, id] = slug.match(/^(steam|igdb)-(\d+)(?:-|$)/) ?? []
  const game = await (src === 'steam' ? steamGame(id) : igdbGame(src ? `id = ${id}` : `slug = "${slug.toLowerCase()}"`))
  if (!game) {
    if (missing.size > 500) missing.clear()
    missing.set(slug, Date.now() + 600_000)
  }
  return game
})
