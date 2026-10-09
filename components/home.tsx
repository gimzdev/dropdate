'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type KeyboardEvent, type ReactNode, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { type Ev, type Kind, type Payload, type Platform, PLATFORMS, browseHref, gap, googleUrl, href, iso, longDate, monthLabel, monthShort, range, shift, srcSet, status, toDate, webcal, weekday } from '@/lib/core'
import { type Chip, removeChip, search } from '@/lib/search'
import { BigDate, Card, Circled, Countdown, DateBlock, EXPLORE_EVENT, type ExploreIntent, Heart, Icon, Img, Open, SaveButton, Score, Section, Select, Thumb, Updated, fallback, useExplore, useSaved, useSwipe, useToday } from './ui'

// The home page: the biggest upcoming releases one at a time, the week ahead as a wall calendar, the most
// anticipated games, the month's biggest launches, the esports schedule and the searchable calendar.

const underline = 'decoration-line/40 underline-offset-[3px] group-hover:underline'
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

export function Hero({ slides, today: serverToday }: { slides: Ev[]; today: string }) {
  const today = useToday(serverToday), n = slides.length
  const [i, setI] = useState(0), [hover, setHover] = useState(false), [focus, setFocus] = useState(false), [stopped, setStopped] = useState(false)
  const [loaded, setLoaded] = useState([0, 1]) // artwork in the page: slides shown so far, plus the next one
  const [settled, setSettled] = useState(false) // the first slide starts zoomed in and eases out once the page is up, like every later one
  const paused = hover || focus || stopped
  const go = (k: number) => {
    const next = (k + n) % n
    setI(next)
    setLoaded((l) => [...new Set([...l, next, (next + 1) % n])])
  }
  const swipe = useSwipe((d) => go(i + d), 60)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setStopped(true)
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)))
    return () => cancelAnimationFrame(r)
  }, [])
  useEffect(() => {
    if (paused || n < 2) return
    const t = setTimeout(() => go(i + 1), 7000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, n])

  if (!n) return (
    <section className="pt-36 pb-10 md:pt-44 md:pb-14">
      <div className="wrap">
        <p className="display text-[clamp(3rem,6vw+1rem,6.5rem)]">Every game drop.<br />One calendar.</p>
        <p className="mt-6 max-w-xl text-lg text-muted">Game releases and esports tournaments, refreshed every hour. Search in plain English and add anything to your own calendar.</p>
      </div>
    </section>
  )
  const s = slides[i]
  return (
    // Rotation holds only while the pointer is over a link or button, or while keyboard focus is in the slide (not after a click, which leaves focus behind)
    <section aria-roledescription="carousel" aria-label="Biggest upcoming releases" className="relative isolate overflow-hidden text-white" {...swipe}
      onPointerOver={(ev) => setHover(ev.pointerType !== 'touch' && !!(ev.target as Element).closest('a,button'))} onPointerLeave={() => setHover(false)}
      onFocus={(ev) => setFocus(ev.target.matches(':focus-visible'))} onBlur={() => setFocus(false)}>
      <div className="absolute inset-0 -z-10 bg-black">
        {slides.map((x, k) => loaded.includes(k) && (
          <img key={x.id} src={x.image ?? x.thumb} srcSet={srcSet(x.image)} sizes="100vw" alt="" fetchPriority={k ? 'low' : 'high'} onError={fallback}
            className={`absolute inset-0 h-full w-full object-cover object-[60%_0%] transition-[opacity,scale] duration-[1200ms,9000ms] ease-out ${k === i ? (settled || i > 0 ? 'scale-100 opacity-100' : 'scale-[1.06] opacity-100') : 'scale-[1.06] opacity-0'}`} />
        ))}
        <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/45 to-black/0" />
        <div className="absolute inset-0 bg-linear-to-t from-black via-black/25 to-black/0" />
      </div>
      <div className="wrap flex min-h-[max(660px,100svh)] flex-col pt-24 pb-6 md:pb-10">
        <div key={s.id} className="flex flex-1 animate-enter flex-col justify-end pb-10 md:pb-14">
          <BigDate date={s.start} tba={s.tba} size="text-[clamp(5.5rem,5vw+3.25rem,9.5rem)]" unknown="Exact date not announced" />
          <h2 className="display mt-6 max-w-[15ch] text-[clamp(2.75rem,3.4vw+1.6rem,5.25rem)]"><span className="sr-only">{s.tba ? `${monthLabel(s.start.slice(0, 7))}: ` : `${longDate(s.start)}: `}</span>{s.title}</h2>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {s.platforms.length > 0 && <span className="flex flex-wrap gap-1.5">{s.platforms.map((p) => <span key={p} className="rounded-full bg-white/12 px-3 py-1 text-[13px] font-medium ring-1 ring-white/15 backdrop-blur-md ring-inset">{p}</span>)}</span>}
            {s.genres.length > 0 && <span className="text-[15px] text-white/65">{s.genres.slice(0, 3).join(', ')}</span>}
          </div>
          <Countdown start={s.start} today={today} className="mt-6 short:hidden" />
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={href(s)} className="btn btn-mark">View game</Link>
            <a href={googleUrl(s)} target="_blank" rel="noopener noreferrer" className="btn btn-glass"><Icon name="plus" />Add to calendar</a>
            <SaveButton id={s.id} title={s.title} label variant="glass" />
          </div>
        </div>
        {n > 1 && (
          <div className="flex items-end gap-4">
            <ol className="grid max-w-[900px] flex-1 gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {slides.map((x, k) => (
                <li key={x.id}>
                  <button type="button" onClick={() => go(k)} aria-label={`Show ${x.title}`} aria-current={k === i ? 'true' : undefined} className="group/t block w-full py-3 text-left md:py-0">
                    <span className={`relative hidden aspect-video overflow-hidden rounded-art ring-2 transition md:block ${k === i ? 'ring-white' : 'opacity-55 ring-transparent group-hover/t:opacity-100'}`}><Img src={x.thumb} className="h-full w-full object-cover" /></span>
                    <span className="block h-[3px] overflow-hidden rounded-full bg-white/20 md:mt-2.5">{k === i && <span key={`${i}-${paused}`} className={`block h-full origin-left bg-mark ${paused ? '' : 'animate-bar'}`} />}</span>
                    <span className={`mt-2 hidden truncate text-[13px] font-medium transition md:block ${k === i ? 'text-white' : 'text-white/55 group-hover/t:text-white/85'}`}>{x.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setStopped(!stopped)} aria-label={stopped ? 'Play slideshow' : 'Pause slideshow'} className="btn btn-glass mb-1 h-9 w-9 shrink-0 px-0 md:mb-8"><Icon name={stopped ? 'play' : 'pause'} className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </section>
  )
}

/** The next seven days, one column each, today circled. */
export function WeekStrip({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday), explore = useExplore()
  const days = Array.from({ length: 7 }, (_, k) => shift(today, k)).map((d) => ({ d, list: items.filter((e) => e.start === d).sort((a, b) => b.pop - a.pop) }))
  const total = days.reduce((sum, x) => sum + x.list.length, 0)
  return (
    <Section id="week" title="This week" className="pt-10 pb-14 md:pt-14 md:pb-20"
      lede={total ? `${total} ${total === 1 ? 'release or tournament starts' : 'releases and tournaments start'} in the next seven days.` : 'Nothing starts in the next seven days. The full calendar has what comes after.'}
      action={<button type="button" onClick={() => explore({ day: today })} className="btn btn-line">Open the calendar</button>}>
      <ol className="no-scrollbar bleed -my-3 flex snap-x snap-mandatory gap-8 overflow-x-auto py-3 xl:mx-0 xl:grid xl:grid-cols-7 xl:overflow-visible xl:px-0">
        {days.map(({ d, list }) => <Day key={d} d={d} list={list} today={today} onOpen={() => explore({ day: d })} />)}
      </ol>
    </Section>
  )
}

function Day({ d, list, today, onOpen }: { d: string; list: Ev[]; today: string; onOpen: () => void }) {
  const isToday = d === today, label = isToday ? 'Today' : gap(today, d) === 1 ? 'Tomorrow' : weekday(d)
  const [lead, ...rest] = list, more = rest.slice(0, 3), extra = rest.length - more.length
  return ( // columns are ruled like a wall calendar: the line sits in the gap, so every day gets the same width
    <li className="relative flex w-[220px] shrink-0 snap-start flex-col before:absolute before:inset-y-0 before:-left-4 before:w-px before:bg-line/10 first:before:hidden xl:w-auto">
      <button type="button" onClick={onOpen} aria-label={`${label}, ${longDate(d)}: ${plural(list.length, 'event')}. Open it in the calendar`} className="mb-4 flex items-end gap-3 rounded-lg text-left">
        <span className="relative grid h-[58px] min-w-[50px] place-items-center">{isToday && <Circled className="-inset-x-3 -inset-y-2" />}<span className="display text-[52px] leading-none">{+d.slice(8)}</span></span>
        <span className="pb-1 leading-tight">
          <span className={`block text-[15px] font-semibold ${isToday ? 'text-mark' : ''}`}>{label}</span>
          <span className="block text-[13px] text-muted">{list.length ? plural(list.length, 'drop') : monthShort(d)}</span>
        </span>
      </button>
      {lead ? (
        <Open e={lead} className="group relative block aspect-[16/10] overflow-hidden rounded-art bg-raised">
          {lead.kind === 'tournament' ? <Thumb e={lead} className="absolute inset-0 h-full w-full" />
            : lead.thumb ? <Img src={lead.thumb} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : null}
          <span className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent" />
          <span className="absolute inset-x-3 bottom-2.5">
            {lead.kind === 'tournament' && <span className="block text-[12px] font-semibold text-arena">Esports</span>}
            <span className="line-clamp-2 text-[14px] leading-tight font-semibold text-white">{lead.title}</span>
          </span>
        </Open>
      ) : <div className="grid aspect-[16/10] place-items-center rounded-art border border-dashed border-line/12 px-4 text-center text-[13px] text-dim">Nothing starts this day</div>}
      {more.length > 0 && (
        <ul className="mt-3">
          {more.map((e) => (
            <li key={e.id}>
              <Open e={e} className="flex items-center gap-2 rounded-md py-1 text-[14px] leading-snug text-muted transition hover:text-fg">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.kind === 'tournament' ? 'bg-arena' : 'bg-line/35'}`} /><span className="line-clamp-1">{e.title}</span>
              </Open>
            </li>
          ))}
        </ul>
      )}
      {extra > 0 && <button type="button" onClick={onOpen} className="mt-2 self-start text-[13px] font-semibold underline decoration-line/30 underline-offset-4 transition hover:decoration-mark">{extra} more</button>}
    </li>
  )
}

/** The most followed upcoming games after the ones in the hero: five large tiles and a short list. */
export function Upcoming({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday)
  if (items.length < 3) return null
  const [lead, ...rest] = items, tiles = rest.slice(0, 4), list = rest.slice(4, 10)
  return (
    <Section id="upcoming" title="Most anticipated" lede="The upcoming games the most players are following.">
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
        <div className={`grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[210px] sm:grid-cols-4 lg:auto-rows-[230px] ${list.length ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          <Tile e={lead} today={today} big />
          {tiles.map((e) => <Tile key={e.id} e={e} today={today} className={tiles.length === 4 ? '' : 'sm:col-span-2'} />)}
        </div>
        {list.length > 0 && (
          <div className="lg:col-span-4">
            <h3 className="mb-1 text-[15px] font-semibold text-muted">Also on the radar</h3>
            <ul className="divide-y divide-line/10">
              {list.map((e) => (
                <li key={e.id} className="flex items-center gap-1">
                  <Open e={e} className="group flex min-w-0 flex-1 items-center gap-3.5 py-3">
                    <DateBlock start={e.start} tba={e.tba} size="sm" />
                    <Thumb e={e} className="h-12 w-[76px] rounded-[7px]" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[15px] font-semibold ${underline}`}>{e.title}</span>
                      <span className="block truncate text-[13px] text-muted">{(e.platforms.length ? e.platforms : e.genres).join(', ')}</span>
                    </span>
                  </Open>
                  <SaveButton id={e.id} title={e.title} variant="plain" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

function Tile({ e, today, big, className = '' }: { e: Ev; today: string; big?: boolean; className?: string }) {
  const src = big ? (e.image ?? e.thumb) : e.thumb, s = status(e, today)
  return (
    <article className={`group relative overflow-hidden rounded-art bg-raised ${big ? 'col-span-2 row-span-2' : ''} ${className}`}>
      <Open e={e} className="absolute inset-0 block">
        {src && <img src={src} srcSet={big ? srcSet(e.image) : undefined} sizes={big ? '(min-width: 1024px) 560px, 100vw' : '(min-width: 1024px) 280px, 50vw'} alt="" loading="lazy" decoding="async" onError={fallback}
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />}
        <span className="absolute inset-0 bg-linear-to-t from-black/90 via-black/25 to-black/0" />
        <span className={`absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-white ${big ? 'md:gap-4 md:p-6' : ''}`}>
          <DateBlock start={e.start} tba={e.tba} size={big ? 'lg' : 'md'} />
          <span className="min-w-0 pb-0.5">
            <span className={`block text-[13px] font-semibold ${s.tone === 'soon' ? 'text-mark' : 'text-white/75'}`}>{s.label}</span>
            <span className={`display mt-1 block ${big ? 'text-[clamp(1.9rem,1.6vw+1.2rem,2.9rem)]' : 'line-clamp-2 text-[19px] leading-[1]'}`}>{e.title}</span>
          </span>
        </span>
      </Open>
      <div className="absolute top-3 right-3"><SaveButton id={e.id} title={e.title} /></div>
    </article>
  )
}

/** The biggest launches of the past month, ranked. */
export function Fresh({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday)
  if (!items.length) return null
  return (
    <Section id="fresh" title="Just released" lede="The biggest launches of the past 30 days, ranked by how many players follow them.">
      <ol className="grid grid-cols-1 gap-x-14 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
        {items.map((e, n) => {
          const days = gap(e.start, today)
          return (
            <li key={e.id} className={`flex items-center gap-1 border-line/10 ${n ? 'border-t' : ''} ${n % 5 === 0 ? 'md:border-t-0' : ''}`}>
              <Open e={e} className="group flex min-w-0 flex-1 items-center gap-3.5 py-3.5 sm:gap-4">
                <span className="display w-7 shrink-0 text-right text-[30px] text-dim sm:w-8 sm:text-[34px]">{n + 1}</span>
                <Thumb e={e} className="h-[50px] w-[84px] rounded-[7px] sm:h-[58px] sm:w-[100px]" />
                <span className="min-w-0 flex-1">
                  <span className={`line-clamp-2 text-[16px] leading-snug font-semibold ${underline}`}>{e.title}</span>
                  <span className="mt-0.5 flex gap-3 text-[13px]">
                    <span className="shrink-0 font-semibold text-go">{days < 1 ? 'Out today' : days === 1 ? 'Out yesterday' : `Out ${days} days ago`}</span>
                    <span className="truncate text-muted">{e.genres.slice(0, 2).join(', ')}</span>
                  </span>
                </span>
                {!!e.metacritic && <Score n={e.metacritic} className="text-[13px]" />}
              </Open>
              <SaveButton id={e.id} title={e.title} variant="plain" />
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

const COLS = 'md:grid-cols-[170px_minmax(0,1fr)_200px_130px]'
const WHEN = { live: 'text-live', soon: 'text-mark', future: 'text-fg', past: 'text-dim' }

/** Esports as a broadcast schedule: what is live, what is next, the game and the prize pool. */
export function Schedule({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday)
  if (!items.length) return null
  const live = items.filter((e) => status(e, today).tone === 'live').length
  return (
    <Section id="esports" title="Esports" lede={live ? `${live} ${live === 1 ? 'tournament is' : 'tournaments are'} live right now, and the biggest ones coming up.` : 'The biggest tournaments coming up, with their prize pools.'}>
      <div className="overflow-hidden rounded-panel bg-panel">
        <div className={`hidden gap-6 border-b border-line/10 px-6 py-3 text-[13px] font-medium text-dim md:grid ${COLS}`}><span>When</span><span>Tournament</span><span>Game</span><span className="text-right">Prize pool</span></div>
        <ul className="divide-y divide-line/[0.07]">
          {items.map((e) => {
            const s = status(e, today)
            const when = <span className={`inline-flex items-center gap-2 font-semibold ${WHEN[s.tone]}`}>{s.tone === 'live' && <span className="h-2 w-2 animate-pulse rounded-full bg-live" />}{s.label}</span>
            return (
              <li key={e.id}>
                <Open e={e} className={`group grid grid-cols-1 items-center gap-x-6 px-4 py-4 transition hover:bg-raised/60 md:px-6 ${COLS}`}>
                  <span className="hidden flex-col text-[14px] md:flex">{when}<span className="text-[13px] text-muted">{range(e.start, e.end)}</span></span>
                  <span className="flex min-w-0 items-center gap-4">
                    <Thumb e={e} className="h-12 w-12 rounded-[12px]" />
                    <span className="min-w-0">
                      <span className={`line-clamp-2 text-[16px] leading-snug font-semibold md:line-clamp-1 ${underline}`}>{e.title}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-[13px] md:hidden">{when}<span className="text-muted">{range(e.start, e.end)}</span></span>
                      <span className="block truncate text-[13px] text-muted md:hidden">{[e.genres[0], e.prize].filter(Boolean).join(', ')}</span>
                    </span>
                  </span>
                  <span className="hidden truncate text-[15px] text-muted md:block">{e.genres[0]}</span>
                  <span className="hidden text-right text-[15px] font-semibold md:block">{e.prize ?? <span className="font-normal text-dim">Not announced</span>}</span>
                </Open>
              </li>
            )
          })}
        </ul>
      </div>
    </Section>
  )
}

// ── The searchable calendar: plain-English search, filters, a grid or a month, and a calendar feed of what is shown ──

const PAGE = 16
const SORTS = { date: 'Soonest first', hype: 'Most anticipated', score: 'Best reviewed' }
const EXAMPLES = ['ps5 games next month', 'esports this weekend', 'switch in december', 'xbox shooters in q4']
const KINDS = { all: 'releases and tournaments', release: 'releases', tournament: 'tournaments' }
const GRID = 'grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-3 xl:grid-cols-4'
const score = (e: Ev) => e.metacritic ?? (e.rating ?? 0) * 20

function Segment<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-full p-1 ring-1 ring-line/12 ring-inset">
      {items.map(([id, text]) => <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id} className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition ${value === id ? 'bg-fg text-black' : 'text-muted hover:text-fg'}`}>{text}</button>)}
    </div>
  )
}

export function Explorer({ data }: { data: Payload }) {
  const saved = useSaved()
  const [today, setToday] = useState(data.today), [origin, setOrigin] = useState(''), [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind | 'all'>('all'), [platform, setPlatform] = useState<Platform | 'all'>('all'), [genre, setGenre] = useState('all')
  const [sort, setSort] = useState<keyof typeof SORTS>('date'), [view, setView] = useState<'grid' | 'calendar'>('grid'), [onlySaved, setOnlySaved] = useState(false)
  const [month, setMonth] = useState(data.today.slice(0, 7)), [day, setDay] = useState<string>(), [limit, setLimit] = useState(PAGE), [copied, setCopied] = useState('')
  const query = useDeferredValue(q) // typing stays instant while the results catch up

  useEffect(() => { // the page can be an hour old: use the visitor's own today, then ?q= and whatever the header or the week asked for
    const apply = ({ list, day: d }: ExploreIntent) => {
      if (list) { setOnlySaved(true); setView('grid') }
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setView('calendar'); setMonth(d.slice(0, 7)); setDay(d) }
    }
    const t = iso(new Date()), p = new URLSearchParams(location.search)
    setToday(t)
    setMonth(t.slice(0, 7))
    setOrigin(location.origin)
    setQ(p.get('q') ?? '')
    apply({ list: p.has('list'), day: p.get('day') ?? undefined })
    if (p.has('focus')) setTimeout(() => document.getElementById('search-input')?.focus(), 300)
    const on = (ev: Event) => apply((ev as CustomEvent<ExploreIntent>).detail ?? {})
    addEventListener(EXPLORE_EVENT, on)
    return () => removeEventListener(EXPLORE_EVENT, on)
  }, [])
  useEffect(() => {
    if (origin) history.replaceState(null, '', (q ? `?q=${encodeURIComponent(q)}` : location.pathname) + location.hash)
    setLimit(PAGE)
  }, [q, kind, platform, genre, sort, onlySaved, origin])

  const [genres, hasTournaments] = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of data.events) if (e.kind === 'release') for (const g of e.genres) n.set(g, (n.get(g) ?? 0) + 1)
    return [[...n].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => [g]), data.events.some((e) => e.kind === 'tournament')] as const
  }, [data.events])

  const { list, parsed } = useMemo(() => {
    const span = view === 'calendar' ? { from: `${month}-01`, to: shift(`${month}-01`, new Date(+month.slice(0, 4), +month.slice(5), 0).getDate() - 1) } : {}
    const r = search(data.events, query, today, { kind, platform, genre, ...span })
    let l = r.list
    // just browsing: tournaments already under way are in the esports schedule, so the grid starts with what's next
    if (view === 'grid' && kind === 'all' && !query.trim() && !onlySaved) l = l.filter((e) => e.kind === 'release' || e.start >= today)
    if (onlySaved) l = l.filter((e) => saved.has(e.id))
    if (view === 'grid' && sort !== 'date') l = [...l].sort((a, b) => (sort === 'hype' ? b.pop - a.pop : score(b) - score(a)))
    return { list: l, parsed: r.parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.events, query, today, kind, platform, genre, sort, view, onlySaved, saved.ids, month])

  const [groups, perMonth] = useMemo(() => { // the first `limit` results by month (one group when sorted otherwise), and every month's total
    const m = new Map<string, Ev[]>(), count = new Map<string, number>()
    list.forEach((e, n) => {
      const k = e.start.slice(0, 7), key = sort === 'date' ? k : ''
      count.set(k, (count.get(k) ?? 0) + 1)
      if (n < limit) m.get(key)?.push(e) ?? m.set(key, [e])
    })
    return [[...m], count] as const
  }, [list, limit, sort])

  const dayList = day ? list.filter((e) => e.start <= day && (e.end ?? e.start) >= day) : []
  const filtered = !!q.trim() || kind !== 'all' || platform !== 'all' || genre !== 'all' || onlySaved
  const moveMonth = (n: number) => { setMonth(iso(new Date(+month.slice(0, 4), +month.slice(5) - 1 + n, 1)).slice(0, 7)); setDay(undefined) }
  const reset = () => { setQ(''); setKind('all'); setPlatform('all'); setGenre('all'); setOnlySaved(false) }

  // The calendar feed follows what is on screen, or the saved list
  const mine = onlySaved && saved.ids.length > 0
  const params = new URLSearchParams(Object.entries(mine ? { ids: saved.ids.slice(0, 300).join(',') } : { q: q.trim(), type: kind, platform, genre }).filter(([, v]) => v && v !== 'all')).toString()
  const feed = origin ? `${origin}/api/calendar.ics${params ? `?${params}` : ''}` : '', done = !!copied && copied === feed
  const describe = mine ? 'everything on your wishlist' : `upcoming ${platform !== 'all' ? `${platform} ` : ''}${KINDS[kind]}${genre !== 'all' ? ` in ${genre}` : ''}${q.trim() ? ` matching “${q.trim()}”` : ''}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(feed) } catch { prompt('Calendar feed link', feed) }
    setCopied(feed)
    setTimeout(() => setCopied(''), 2200)
  }
  const cards = (l: Ev[]) => <div className={GRID}>{l.map((e) => <Card key={e.id} e={e} today={today} row />)}</div>
  const empty = 'rounded-panel border border-dashed border-line/12 px-6 text-center'

  return (
    <Section id="explore" title="Search the calendar"
      lede={<>Type a game, a platform or a date. Plain English works, like <q>switch games in december</q> or <q>esports this weekend</q>.</>}
      action={(
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="inline-flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 rounded-full bg-go" />Live data, updated <Updated at={data.updated} /></p>
          <Link href="/browse" className="btn btn-sm btn-line">Browse every game</Link>
        </div>
      )}>
      {data.error && <div role="alert" className="mb-6 rounded-[14px] bg-live/10 p-4 text-[15px] text-[#ffb7be] ring-1 ring-live/30 ring-inset"><strong className="font-semibold">Live data is unavailable.</strong> {data.error} Check the API keys in your environment, then redeploy.</div>}
      {data.stale && !data.error && <div role="status" className="mb-6 rounded-[14px] bg-mark/10 p-3.5 text-[15px] text-[#ffe8a3] ring-1 ring-mark/25 ring-inset">The data sources did not answer just now, so this is the last good data. It refreshes on its own.</div>}

      <SearchBox value={q} query={query} onChange={setQ} events={data.events} today={today} chips={parsed.chips} text={parsed.text} />

      <div className="sticky top-[65px] z-30 -mx-4 mt-8 border-y lg:top-[76px] border-line/10 bg-black/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-full lg:border lg:px-2.5 lg:py-2">
        <div className="flex items-center gap-3">
          <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] xl:[mask-image:none]">
            <Segment label="Show" value={kind} onChange={setKind} items={[['all', 'All'], ['release', 'Games'], ...(hasTournaments ? [['tournament', 'Esports'] as [Kind, ReactNode]] : [])]} />
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line/12" />
            <div role="group" aria-label="Platform" className="flex shrink-0 gap-1.5">
              {PLATFORMS.map((p) => <button key={p} type="button" onClick={() => setPlatform(platform === p ? 'all' : p)} aria-pressed={platform === p} className="pill">{p}</button>)}
            </div>
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line/12" />
            <Select label="Genre" value={genre} onChange={setGenre} options={[['all', 'All genres'], ...genres]} className="w-[150px]" />
            <button type="button" onClick={() => setOnlySaved(!onlySaved)} aria-pressed={onlySaved} className="pill"><Heart on={onlySaved} className="h-4 w-4" />Wishlist{saved.ids.length ? <span className="opacity-70">{saved.ids.length}</span> : null}</button>
          </div>
          <Segment label="View" value={view} onChange={setView}
            items={[['grid', <><Icon name="grid" /><span className="sr-only sm:not-sr-only">Grid</span></>], ['calendar', <><Icon name="calendar" /><span className="sr-only sm:not-sr-only">Month</span></>]]} />
        </div>
      </div>

      <div className="mt-6 mb-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <p aria-live="polite" className="text-[15px] text-muted"><span className="font-semibold text-fg">{list.length.toLocaleString('en-US')}</span> {list.length === 1 ? 'result' : 'results'}{view === 'calendar' ? ` in ${monthLabel(month)}` : ''}</p>
        {filtered && <button type="button" onClick={reset} className="text-[15px] font-semibold underline decoration-line/30 underline-offset-4 transition hover:decoration-mark">Clear filters</button>}
        {view === 'grid' && <span className="ml-auto"><Select label="Sort by" value={sort} onChange={setSort} options={Object.entries(SORTS)} /></span>}
      </div>

      {view === 'calendar' ? (
        <div>
          <MonthGrid month={month} events={list} today={today} selected={day} onSelect={(d) => { setDay(d); setMonth(d.slice(0, 7)) }} onMonth={moveMonth} />
          <div className="mt-10">
            {day ? (
              <>
                <h3 className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="display text-[34px]">{longDate(day)}</span><span className="text-[15px] text-muted">{dayList.length} {dayList.length === 1 ? 'event' : 'events'}</span></h3>
                {dayList.length ? cards(dayList) : <p className={`${empty} py-12 text-muted`}>Nothing on this day. Pick another one in the calendar above.</p>}
              </>
            ) : <p className="text-center text-[15px] text-muted">Pick a day to see everything on it.</p>}
          </div>
        </div>
      ) : (
        <>
          {groups.map(([m, items]) => (
            <div key={m || 'all'} className="mb-14 last:mb-0">
              {m && <h3 className="mb-6 flex items-baseline gap-3 border-b border-line/10 pb-3"><span className="display text-[34px]">{monthLabel(m)}</span><span className="text-[15px] text-muted">{perMonth.get(m)} {perMonth.get(m) === 1 ? 'event' : 'events'}</span></h3>}
              {cards(items)}
            </div>
          ))}
          {list.length > limit && <div className="mt-12 text-center"><button type="button" onClick={() => setLimit((l) => l + PAGE * 2)} className="btn btn-line px-7">Show more<span className="text-muted">{list.length - limit} left</span></button></div>}
          {!data.error && !list.length && (
            <div className={`${empty} py-16`}>
              <p className="text-lg font-semibold">{onlySaved ? 'Your wishlist is empty' : 'No matches'}</p>
              <p className="mx-auto mt-2 max-w-sm text-muted">{onlySaved ? 'Tap the heart on any game or tournament to keep it here. Then add the whole wishlist to your calendar in one go.' : 'Try fewer words, another month, or clear the filters. The calendar holds what is out lately or coming: older games are in Browse.'}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <button type="button" className="btn btn-mark" onClick={reset}>{onlySaved ? 'Browse the calendar' : 'Clear filters'}</button>
                {!onlySaved && !!parsed.text.trim() && <Link href={browseHref({ q: parsed.text.trim().slice(0, 60) })} className="btn btn-line">Search every game for “{parsed.text.trim().slice(0, 30)}”</Link>}
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-16 grid grid-cols-1 gap-6 rounded-panel bg-panel p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-mark text-black"><Icon name="calendar" className="h-6 w-6" /></span>
          <div>
            <h3 className="text-lg font-semibold">Add {mine ? 'your wishlist' : 'this view'} to your calendar</h3>
            <p className="mt-1 max-w-xl text-[15px] text-muted">A live feed of {describe}. When a date moves, your calendar follows.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={feed ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(feed))}` : undefined} target="_blank" rel="noopener noreferrer" className="btn btn-mark">Google Calendar</a>
          <a href={feed ? webcal(feed) : undefined} className="btn btn-line">Apple or Outlook</a>
          <button type="button" onClick={copy} disabled={!feed} className="btn btn-line"><Icon name={done ? 'check' : 'copy'} />{done ? 'Link copied' : 'Copy link'}</button>
        </div>
      </div>
    </Section>
  )
}

/** The search box: suggestions as you type, and the filters it understood. */
function SearchBox({ value, query, onChange, events, today, chips, text }: { value: string; query: string; onChange: (v: string) => void; events: Ev[]; today: string; chips: Chip[]; text: string }) {
  const router = useRouter()
  const [focus, setFocus] = useState(false), [active, setActive] = useState(-1)
  // Suggestions only when part of the query names a game: a pure filter ("ps5 next month") is answered by the grid, and its chips stay in view
  const local = useMemo(() => (text.trim() ? search(events, query, today, { from: '0000-01-01', to: '9999-12-31' }).list.sort((a, b) => b.pop - a.pop).slice(0, 6) : []), [events, query, today, text])
  // The calendar only holds what is out recently or coming, so titles it lacks (older and long-running games) are looked up by name
  const [found, setFound] = useState<Ev[]>([])
  useEffect(() => {
    const q = text.trim()
    if (q.length < 3 || local.length >= 6) return setFound([])
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => r.json()).then((j: { data?: { slug: string; title: string; released?: string; thumb: string }[] }) => {
        setFound((j.data ?? []).map((g): Ev => ({ id: `lookup-${g.slug}`, slug: g.slug, title: g.title, kind: 'release', start: g.released ?? '', thumb: g.thumb, shots: [], platforms: [], genres: [], pop: 0 })))
      }).catch(() => {})
    }, 250)
    return () => { clearTimeout(t); ctl.abort() }
  }, [text, local.length])
  const hits = useMemo(() => {
    const seen = new Set(local.map((e) => e.slug))
    return [...local, ...found.filter((e) => !seen.has(e.slug))].slice(0, 8)
  }, [local, found])
  useEffect(() => setActive(-1), [value])
  const open = (e: Ev) => (e.slug ? router.push(href(e)) : e.url && window.open(e.url, '_blank', 'noopener'))
  const name = text.trim().slice(0, 60), rows = hits.length + (name.length >= 2 ? 1 : 0) // the last row, when there is a name to look for, goes on to Browse: every game, not only these few
  const browseAll = () => router.push(browseHref({ q: name }))
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(-1, Math.min(rows - 1, a + (ev.key === 'ArrowDown' ? 1 : -1)))) }
    else if (ev.key === 'Enter' && active >= 0) { if (hits[active]) open(hits[active]); else if (active < rows) browseAll() }
    else if (ev.key === 'Escape') { if (value) onChange(''); else ev.currentTarget.blur() }
  }
  const expanded = focus && hits.length > 0

  return (
    <div className="max-w-3xl">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-muted" />
        <input id="search-input" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          role="combobox" aria-expanded={expanded} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={expanded && active >= 0 ? (hits[active] ? `hit-${hits[active].id}` : 'hit-browse') : undefined}
          aria-label="Search games and tournaments" autoComplete="off" spellCheck={false} enterKeyHint="search" placeholder="Search games, platforms or dates"
          className={`h-14 w-full rounded-full bg-panel pl-14 text-base text-fg ring-1 ring-line/12 transition outline-none ring-inset placeholder:text-dim hover:ring-line/25 focus:ring-2 focus:ring-mark sm:h-16 sm:text-[17px] ${value ? 'pr-24' : 'pr-5 sm:pr-14'}`} />
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          {value ? <button type="button" onClick={() => onChange('')} className="btn btn-sm text-muted hover:text-fg">Clear</button> : <span className="kbd mr-3 hidden text-dim sm:inline-grid">/</span>}
        </div>
        {expanded && (
          <ul id="search-results" role="listbox" aria-label="Suggestions" className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-[20px] bg-panel p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] ring-1 ring-line/12 ring-inset">
            {hits.map((e, n) => (
              <li key={e.id} id={`hit-${e.id}`} role="option" aria-selected={n === active} onMouseDown={(ev) => { ev.preventDefault(); open(e) }} onMouseEnter={() => setActive(n)}
                className={`flex cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 ${n === active ? 'bg-raised' : ''}`}>
                <Thumb e={e} className="h-10 w-16 rounded-[6px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{e.title}</span>
                  <span className="block truncate text-[13px] text-muted">{e.start ? range(e.start, e.end) : 'Release date not announced'}</span>
                </span>
                <span className={`shrink-0 text-[13px] font-semibold ${e.kind === 'tournament' ? 'text-arena' : 'text-muted'}`}>{e.kind === 'tournament' ? 'Esports' : 'Game'}</span>
              </li>
            ))}
            {rows > hits.length && (
              <li id="hit-browse" role="option" aria-selected={active === hits.length} onMouseDown={(ev) => { ev.preventDefault(); browseAll() }} onMouseEnter={() => setActive(hits.length)}
                className={`flex cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2.5 ${active === hits.length ? 'bg-raised' : ''}`}>
                <span className="grid h-10 w-16 shrink-0 place-items-center rounded-[6px] bg-raised text-muted"><Icon name="search" className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">Search every game for “{name.slice(0, 30)}”</span>
                <Icon name="right" className="h-4 w-4 shrink-0 text-muted" />
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="mt-4 flex min-h-8 flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{chips.length ? 'Searching for' : 'Try'}</span>
        {chips.length ? chips.map((c, n) => (
          <button key={n} type="button" onClick={() => onChange(removeChip(value, c))} aria-label={`Remove ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-sm font-semibold text-black transition hover:bg-white">{c.label}<Icon name="close" className="h-3 w-3" /></button>
        )) : EXAMPLES.map((x) => <button key={x} type="button" onClick={() => onChange(x)} className="h-8 rounded-full px-3 text-sm text-fg ring-1 ring-line/12 transition ring-inset hover:ring-line/30">{x}</button>)}
      </div>
    </div>
  )
}

/** The month view: a wall calendar with what starts each day, today circled. */
function MonthGrid({ month, events, today, selected, onSelect, onMonth }: { month: string; events: Ev[]; today: string; selected?: string; onSelect: (d: string) => void; onMonth: (n: number) => void }) {
  const cells = useMemo(() => {
    const first = toDate(`${month}-01`), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const count = Math.ceil((first.getDay() + days) / 7) * 7, start = shift(`${month}-01`, -first.getDay()), last = shift(start, count - 1), byDay = new Map<string, Ev[]>()
    for (const e of events) for (let d = e.start < start ? start : e.start; d <= (e.end ?? e.start) && d <= last; d = shift(d, 1)) byDay.get(d)?.push(e) ?? byDay.set(d, [e])
    return Array.from({ length: count }, (_, n) => {
      const d = shift(start, n) // each day lists what starts that day first, then the biggest
      return { d, inMonth: d.startsWith(month), list: (byDay.get(d) ?? []).sort((a, b) => +(b.start === d) - +(a.start === d) || b.pop - a.pop) }
    })
  }, [month, events])
  const nav = 'btn btn-sm btn-line w-9 px-0'

  return (
    <div className="overflow-hidden rounded-panel bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <h3 className="display text-[34px]">{monthLabel(month)}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonth(-1)} aria-label="Previous month" className={nav}><Icon name="left" /></button>
          <button type="button" onClick={() => onSelect(today)} className="btn btn-sm btn-line">Today</button>
          <button type="button" onClick={() => onMonth(1)} aria-label="Next month" className={nav}><Icon name="right" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-y border-line/10 text-[13px] font-medium text-dim">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => <div key={x} className="px-2 py-2.5 text-center sm:px-3 sm:text-left"><span className="sm:hidden">{x[0]}</span><span className="hidden sm:inline">{x}</span></div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ d, inMonth, list }, n) => (
          <button key={d} type="button" onClick={() => onSelect(d)} aria-pressed={d === selected} aria-label={`${longDate(d)}: ${list.length ? plural(list.length, 'event') : 'nothing scheduled'}`}
            className={`relative flex min-h-[64px] flex-col items-stretch gap-1 border-line/[0.07] p-1.5 text-left transition sm:min-h-[118px] sm:p-2 ${n % 7 ? 'border-l' : ''} ${n >= 7 ? 'border-t' : ''} ${d === selected ? 'bg-raised ring-2 ring-fg ring-inset' : inMonth ? 'hover:bg-raised/60' : 'bg-black/35'}`}>
            <span className={`relative grid h-7 w-7 place-items-center text-[13px] font-semibold ${d === today ? 'text-mark' : inMonth ? 'text-fg' : 'text-dim'}`}>{d === today && <Circled className="-inset-1.5" />}{+d.slice(8)}</span>
            <span className="hidden flex-col gap-1 sm:flex">
              {list.slice(0, 3).map((e) => <span key={e.id} className={`truncate rounded-[5px] px-1.5 py-0.5 text-[12px] leading-[1.35] font-medium ${e.kind === 'tournament' ? 'bg-arena/12 text-arena' : 'bg-white/[0.07] text-fg/90'} ${inMonth ? '' : 'opacity-50'}`}>{e.title}</span>)}
              {list.length > 3 && <span className="px-1.5 text-[12px] font-semibold text-muted">{list.length - 3} more</span>}
            </span>
            {list.length > 0 && <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 4).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.kind === 'tournament' ? 'bg-arena' : 'bg-fg/60'}`} />)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
