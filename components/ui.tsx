'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type AnchorHTMLAttributes, type ReactNode, type SyntheticEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Ev, type Platform, ago, googleUrl, href, iso, longDate, monthLabel, monthShort, scoreTone, srcSet, status, toDate, weekday } from '@/lib/core'
import { Logo } from './logo'

// ── Icons ───────────────────────────────────────────────────────────────

const PATHS = {
  search: 'M20 20l-4.2-4.2M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M8 3v3M16 3v3M4 9.5h16M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  external: 'M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 01-1 1H6a1 1 0 01-1-1V8a1 1 0 011-1h4',
  copy: 'M9 9h10v10H9zM15 9V5H5v10h4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M9 5.5v13M15 5.5v13',
  trophy: 'M8 20h8M12 16v4M7 4h10v4a5 5 0 01-10 0zM17 5h3v1a3 3 0 01-3 3M7 5H4v1a3 3 0 003 3',
} as const
export type IconName = keyof typeof PATHS

export const Icon = ({ name, className = 'h-4 w-4', stroke = 2 }: { name: IconName; className?: string; stroke?: number }) => (
  <svg className={className} fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>
)
export const Heart = ({ on, className = 'h-[18px] w-[18px]' }: { on: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.5-9.2C1.2 8.1 3 4.5 6.5 4.5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3 3.5 0 5.3 3.6 4 6.8-2 4.6-9.5 9.2-9.5 9.2z" /></svg>
)
/** The loop you draw around a date on a wall calendar. It marks today, and nothing else. */
export const Circled = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute text-mark ${className}`}>
    <path d="M58 6C30 3 6 17 6 39c0 22 22 36 48 35 26-1 41-17 40-36C93 19 77 6 47 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>
)

// ── My list: kept in this browser, shared by every heart on the page and across tabs ──

const KEY = 'dropdate:saved', NONE: string[] = [], subs = new Set<() => void>()
let raw: string | null = null, saved = NONE
const read = () => {
  try {
    const r = localStorage.getItem(KEY)
    if (r !== raw) { raw = r; const v: unknown = r ? JSON.parse(r) : null; saved = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : NONE }
  } catch {}
  return saved
}
const subscribe = (fn: () => void) => {
  const other = (e: StorageEvent) => e.key === KEY && fn()
  subs.add(fn)
  addEventListener('storage', other)
  return () => { subs.delete(fn); removeEventListener('storage', other) }
}
export function useSaved() {
  const ids = useSyncExternalStore(subscribe, read, () => NONE)
  const toggle = (id: string) => {
    const now = read()
    saved = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
    raw = JSON.stringify(saved)
    try { localStorage.setItem(KEY, raw) } catch {}
    subs.forEach((fn) => fn())
  }
  return { ids, has: (id: string) => ids.includes(id), toggle }
}

/** Pages are rendered on the server with its date; the browser then switches to the visitor's own today. */
export function useToday(server: string) {
  const [today, setToday] = useState(server)
  useEffect(() => setToday(iso(new Date())), [])
  return today
}

// ── Jumping to the calendar section from anywhere: search, my list, a given day ──

export interface ExploreIntent { list?: boolean; day?: string; focus?: boolean }
export const EXPLORE_EVENT = 'dropdate:explore'

export function useExplore() {
  const router = useRouter()
  return (intent: ExploreIntent) => {
    const section = document.getElementById('explore')
    if (!section) {
      const p = new URLSearchParams()
      if (intent.list) p.set('list', '1')
      if (intent.day) p.set('day', intent.day)
      if (intent.focus) p.set('focus', '1')
      const qs = p.toString()
      router.push(`/${qs ? `?${qs}` : ''}#explore`)
      return
    }
    dispatchEvent(new CustomEvent<ExploreIntent>(EXPLORE_EVENT, { detail: intent }))
    const input = intent.focus ? document.getElementById('search-input') : null
    if (input) {
      input.scrollIntoView({ block: 'center', behavior: 'smooth' })
      input.focus({ preventScroll: true })
    } else section.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
}

// ── Small pieces ────────────────────────────────────────────────────────

type OpenProps = { e: Pick<Ev, 'slug' | 'url'>; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>
/** A game opens its page here; a tournament opens its own page in a new tab. */
export const Open = ({ e, className, children, ...rest }: OpenProps) =>
  e.slug ? <Link href={href(e)} className={className} {...rest}>{children}</Link>
    : <a href={e.url ?? '#'} target="_blank" rel="noopener noreferrer" className={className} {...rest}>{children}</a>

/** A resized image that fails falls back to the original; anything else hides. */
export const fallback = (ev: SyntheticEvent<HTMLImageElement>) => {
  const img = ev.currentTarget, original = img.src.replace(/\/resize\/\d+\/-\//, '/')
  if (original !== img.src) img.src = original
  else img.style.visibility = 'hidden'
}

/** Artwork for a game, a league logo on a cyan glow for a tournament. */
export function Thumb({ e, className = '' }: { e: Pick<Ev, 'thumb' | 'kind'>; className?: string }) {
  if (e.kind === 'tournament') return (
    <span className={`tile-arena grid shrink-0 place-items-center overflow-hidden ${className}`}>
      {e.thumb ? <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className="h-[66%] w-[66%] object-contain" /> : <Icon name="trophy" className="h-1/2 w-1/2 text-arena/70" stroke={1.5} />}
    </span>
  )
  return e.thumb ? <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className={`block shrink-0 bg-raised object-cover ${className}`} /> : <span className={`block shrink-0 bg-raised ${className}`} />
}

const DATE = {
  sm: { box: 'min-w-7', num: 'text-[23px]', tba: 'text-[15px]', mon: 'mt-0.5 text-[10.5px]' },
  md: { box: 'min-w-9', num: 'text-[30px]', tba: 'text-[19px]', mon: 'mt-0.5 text-[11.5px]' },
  lg: { box: 'min-w-14', num: 'text-[52px]', tba: 'text-[30px]', mon: 'mt-1 text-[13px]' },
} as const
/** How every event on Dropdate is dated: the day as a big condensed numeral over its month, like a calendar page. */
export function DateBlock({ start, tba, size = 'md', className = '' }: { start: string; tba?: boolean; size?: keyof typeof DATE; className?: string }) {
  const s = DATE[size]
  return (
    <span className={`flex shrink-0 flex-col items-center leading-none ${s.box} ${className}`}>
      <span className="sr-only">{tba ? `${monthLabel(start.slice(0, 7))}, exact date not announced` : longDate(start)}</span>
      <span aria-hidden className={`display ${tba ? s.tba : s.num}`}>{tba ? 'TBA' : +start.slice(8)}</span>
      <span aria-hidden className={`font-semibold text-muted ${s.mon}`}>{monthShort(start)}</span>
    </span>
  )
}

const TONE = { live: 'text-go', soon: 'text-mark', future: 'text-muted', past: 'text-dim' } as const
/** Out today in green (a live tournament in red), the coming week in yellow, later in grey. */
export const toneText = (e: Pick<Ev, 'kind'>, tone: keyof typeof TONE) => (tone === 'live' && e.kind === 'tournament' ? 'text-live' : TONE[tone])
export const SHORT: Record<Platform, string> = { PC: 'PC', PlayStation: 'PS', Xbox: 'Xbox', Nintendo: 'Nintendo', Mobile: 'Mobile' }

/** A heart on artwork, a quiet heart in lists, or a labelled button. Saving shows in the header count. */
export function SaveButton({ id, title, label, variant = 'art' }: { id: string; title: string; label?: boolean; variant?: 'art' | 'glass' | 'line' | 'plain' }) {
  const { has, toggle } = useSaved()
  const on = has(id)
  const [bump, setBump] = useState(0)
  const click = (ev: { preventDefault(): void; stopPropagation(): void }) => { ev.preventDefault(); ev.stopPropagation(); toggle(id); setBump((n) => n + 1) }
  const heart = <span key={bump} className={`inline-flex ${bump ? 'animate-pop' : ''} ${on ? 'text-mark' : ''}`}><Heart on={on} /></span>
  if (label) return <button type="button" onClick={click} aria-pressed={on} className={`btn ${variant === 'glass' ? 'btn-glass' : 'btn-line'}`}>{heart}{on ? 'Saved' : 'Save'}</button>
  const name = `Save ${title}`, hint = on ? 'Saved to my list' : 'Save to my list'
  if (variant === 'plain') return (
    <button type="button" onClick={click} aria-pressed={on} aria-label={name} title={hint} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-raised ${on ? 'text-mark' : 'text-dim hover:text-fg'}`}>{heart}</button>
  )
  return (
    <button type="button" onClick={click} aria-pressed={on} aria-label={name} title={hint}
      className={`grid h-9 w-9 place-items-center rounded-full backdrop-blur-md transition ${on ? 'bg-black/75' : 'bg-black/55 text-white opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 touch:opacity-100'}`}>
      {heart}
    </button>
  )
}

export function Updated({ at }: { at: string }) {
  const [text, setText] = useState('recently')
  useEffect(() => {
    const tick = () => setText(ago(at))
    tick()
    const t = setInterval(tick, 6e4)
    return () => clearInterval(t)
  }, [at])
  return <>{text}</>
}

export function SectionHead({ id, title, lede, action }: { id?: string; title: string; lede?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 md:mb-10">
      <div className="min-w-0">
        <h2 id={id} className="h-section">{title}</h2>
        {lede && <p className="lede">{lede}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────

/** The logo: on the home page it scrolls to the very top (clearing any #section or ?search); anywhere else it goes home. */
export function HomeLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link href="/" aria-label="Dropdate, home" className={className} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || location.pathname !== '/') return
      e.preventDefault()
      history.replaceState(null, '', '/')
      scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }}>{children}</Link>
  )
}

const NAV: [string, string][] = [['This week', '/#week'], ['Upcoming', '/#upcoming'], ['Esports', '/#esports'], ['Calendar', '/#explore'], ['API', '/docs']]

export function Header({ overHero = false }: { overHero?: boolean }) {
  const explore = useExplore()
  const { ids } = useSaved()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 12)
    const onKey = (e: KeyboardEvent) => { // "/" or Ctrl/Cmd+K jumps to search, unless you're typing somewhere
      const el = document.activeElement as HTMLElement | null, typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); setOpen(false); explore({ focus: true }) }
      else if (e.key === 'Escape') setOpen(false)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('keydown', onKey)
    return () => { removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const clear = overHero && !scrolled && !open // see-through over the hero artwork
  const ctl = `btn btn-sm ${clear ? 'btn-glass' : 'btn-line'}`
  const go = (intent: ExploreIntent) => { setOpen(false); explore(intent) }

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${clear ? 'border-transparent bg-linear-to-b from-black/55 to-transparent bg-origin-border' : 'border-line/10 bg-black/85 backdrop-blur-xl'}`}>
      <div className="wrap flex h-16 items-center gap-2">
        <HomeLink className="flex shrink-0 items-center gap-2 rounded-lg pr-2">
          <Logo size={30} />
          <span className="display text-[23px] text-white">Dropdate</span>
        </HomeLink>
        <nav aria-label="Main" className="ml-5 hidden items-center lg:flex">
          {NAV.map(([name, to]) => <Link key={name} href={to} className={`rounded-full px-3.5 py-2 text-[15px] font-medium transition ${clear ? 'text-white/80 hover:text-white' : 'text-muted hover:text-fg'}`}>{name}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => go({ focus: true })} aria-label="Search games and tournaments" className={`${ctl} w-9 px-0 sm:w-auto sm:px-4`}>
            <Icon name="search" />
            <span className="hidden sm:inline">Search</span>
            <span className="kbd hidden opacity-70 md:inline-grid">/</span>
          </button>
          <button type="button" onClick={() => go({ list: true })} aria-label={`My list, ${ids.length} saved`} className={`${ctl} relative w-9 px-0 sm:w-auto sm:px-4`}>
            <span className={ids.length ? 'text-mark' : ''}><Heart on={ids.length > 0} className="h-4 w-4" /></span>
            <span className="hidden sm:inline">My list</span>
            {ids.length > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-mark px-1 text-[11px] font-bold text-black sm:static sm:-mr-1.5">{ids.length}</span>}
          </button>
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="site-menu" className={`${ctl} w-9 px-0 lg:hidden`}>
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
      {open && (
        <nav id="site-menu" aria-label="Main" className="wrap pb-3 lg:hidden">
          <ul className="grid grid-cols-1 gap-0.5 border-t border-line/10 pt-2">
            {NAV.map(([name, to]) => <li key={name}><Link href={to} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-lg font-medium text-muted transition hover:bg-raised hover:text-fg">{name}</Link></li>)}
          </ul>
        </nav>
      )}
    </header>
  )
}

// ── Cards and rails ─────────────────────────────────────────────────────

/** An event as a card. With `row`, phones get a compact row (artwork beside the date) so long lists stay scannable. */
export function Card({ e, today, row }: { e: Ev; today: string; row?: boolean }) {
  const esport = e.kind === 'tournament', s = status(e, today), frames = !esport && e.thumb ? [e.thumb, ...e.shots] : []
  const [frame, setFrame] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  const play = () => { // hovering a game flips through its screenshots
    if (frames.length < 2 || timer.current) return
    setFrame(1)
    timer.current = setInterval(() => setFrame((n) => (n + 1) % frames.length), 1100)
  }
  const stop = () => { clearInterval(timer.current); timer.current = undefined; setFrame(0) }

  return (
    <article className="group relative" onMouseEnter={play} onMouseLeave={stop}>
      <Open e={e} className={row ? 'flex gap-3.5 rounded-art sm:block' : 'block rounded-art'} onFocus={play} onBlur={stop}>
        <div className={`relative aspect-[16/10] overflow-hidden rounded-art ${row ? 'w-[132px] shrink-0 self-start sm:w-full' : ''} ${esport ? 'tile-arena' : 'bg-raised'}`}>
          {esport ? (
            e.thumb ? <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className="absolute inset-0 m-auto h-[52%] w-[52%] object-contain drop-shadow-[0_10px_24px_rgb(0_0_0/0.5)]" />
              : <Icon name="trophy" className="absolute inset-0 m-auto h-12 w-12 text-arena/60" stroke={1.5} />
          ) : frames.length ? (
            <img src={frames[frame]} alt="" loading="lazy" decoding="async" onError={fallback} onLoad={(ev) => { ev.currentTarget.style.visibility = '' }} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : (
            <span className="display absolute inset-0 grid place-items-center p-6 text-center text-2xl text-dim">{e.genres[0] ?? 'Coming soon'}</span>
          )}
          {frames.length > 1 && (
            <span aria-hidden className="pointer-events-none absolute top-3 right-14 left-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {frames.map((f, k) => <span key={f} className={`h-[3px] flex-1 rounded-full ${k === frame ? 'bg-white' : 'bg-white/35'}`} />)}
            </span>
          )}
          {esport && e.prize ? <span className="tag absolute bottom-2.5 left-2.5 bg-black/70 text-white backdrop-blur-md">{e.prize}</span> : null}
          {!esport && e.metacritic ? <span title="Metacritic score" className={`tag absolute bottom-2.5 left-2.5 ${scoreTone(e.metacritic)}`}>{e.metacritic}</span> : null}
        </div>
        <div className={row ? 'flex min-w-0 flex-1 gap-3 sm:mt-3' : 'mt-3 flex gap-3'}>
          <DateBlock start={e.start} tba={e.tba} />
          <div className="min-w-0 pt-px">
            <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold decoration-line/40 underline-offset-[3px] group-hover:underline">{e.title}</h3>
            <p className="mt-1 flex flex-wrap gap-x-2.5 text-[13px] leading-snug">
              <span className={`font-semibold ${toneText(e, s.tone)}`}>{s.label}</span>
              <span className="text-muted">{esport ? e.genres[0] : e.platforms.map((p) => SHORT[p]).join(', ')}</span>
            </p>
          </div>
        </div>
      </Open>
      <div className={row ? 'absolute top-1.5 left-[94px] sm:top-2.5 sm:right-2.5 sm:left-auto' : 'absolute top-2.5 right-2.5'}><SaveButton id={e.id} title={e.title} /></div>
    </article>
  )
}

export function Rail({ title, lede, items, today }: { title: string; lede?: string; items: Ev[]; today: string }) {
  const row = useRef<HTMLDivElement>(null)
  if (!items.length) return null
  const scroll = (d: number) => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.85, behavior: 'smooth' })
  return (
    <section aria-label={title} className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap">
        <SectionHead title={title} lede={lede} action={
          <div className="hidden gap-2 sm:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label="Scroll back" className="btn btn-line w-11 px-0"><Icon name="left" /></button>
            <button type="button" onClick={() => scroll(1)} aria-label="Scroll forward" className="btn btn-line w-11 px-0"><Icon name="right" /></button>
          </div>
        } />
        <div ref={row} className="no-scrollbar bleed flex snap-x snap-mandatory gap-5 overflow-x-auto">
          {items.map((e) => <div key={e.id} className="w-[250px] shrink-0 snap-start sm:w-[280px]"><Card e={e} today={today} /></div>)}
        </div>
      </div>
    </section>
  )
}

// ── Countdown ───────────────────────────────────────────────────────────

export function Countdown({ start, today, className = '' }: { start: string; today: string; className?: string }) {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 3e4)
    return () => clearInterval(t)
  }, [])
  const day = now === undefined ? today : iso(new Date(now)) // flips to "Out today" at midnight without a reload
  if (start <= day) return <p className={`inline-flex items-center gap-2 text-[17px] font-semibold text-go ${className}`}><span className="h-2 w-2 rounded-full bg-go" />{start === day ? 'Out today' : 'Out now'}</p>
  const ms = Math.max(0, toDate(start).getTime() - (now ?? 0)), d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  const parts: [string, string][] = now === undefined
    ? [['--', 'days'], ['--', 'hours'], ['--', 'min']]
    : [...(d ? [[String(d), d === 1 ? 'day' : 'days'] as [string, string]] : []), [String(h).padStart(2, '0'), h === 1 ? 'hour' : 'hours'], [String(m).padStart(2, '0'), 'min']]
  return (
    <p role="timer" aria-label={now === undefined ? 'Countdown' : `${d ? `${d} days, ` : ''}${h} hours and ${m} minutes to go`} className={`flex items-baseline gap-4 ${className}`}>
      {parts.map(([v, unit], k) => (
        <span key={k} aria-hidden className="flex items-baseline gap-1.5">
          <span className="display text-[34px] text-mark">{v}</span>
          <span className="text-sm text-muted">{unit}</span>
        </span>
      ))}
    </p>
  )
}

// ── Hero: the biggest upcoming releases, one at a time ───────────────────

export function Hero({ slides, today: serverToday }: { slides: Ev[]; today: string }) {
  const today = useToday(serverToday)
  const [i, setI] = useState(0)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [loaded, setLoaded] = useState([0, 1]) // artwork in the page: slides shown so far, plus the next one
  const [settled, setSettled] = useState(false) // the first slide starts zoomed in and eases out once the page is up, like every later one
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true))); return () => cancelAnimationFrame(r) }, [])
  const touch = useRef<number | null>(null)
  const n = slides.length, paused = hover || focus || stopped
  const go = (k: number) => {
    const next = (k + n) % n
    setI(next)
    setLoaded((l) => [...new Set([...l, next, (next + 1) % n])])
  }
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) setStopped(true) }, [])
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
    <section aria-roledescription="carousel" aria-label="Biggest upcoming releases" className="relative isolate overflow-hidden text-white"
      // Rotation holds only while the pointer is over a link or button, or while keyboard focus is in the slide (not after a click, which leaves focus behind)
      onPointerOver={(ev) => setHover(ev.pointerType !== 'touch' && !!(ev.target as Element).closest('a,button'))} onPointerLeave={() => setHover(false)}
      onFocus={(ev) => setFocus(ev.target.matches(':focus-visible'))} onBlur={() => setFocus(false)}
      onTouchStart={(ev) => { touch.current = ev.touches[0].clientX }}
      onTouchEnd={(ev) => {
        if (touch.current === null) return
        const dx = ev.changedTouches[0].clientX - touch.current
        touch.current = null
        if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1))
      }}>
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
          <div className="flex items-end gap-4">
            <span aria-hidden className="display text-[clamp(5.5rem,5vw+3.25rem,9.5rem)] leading-[0.78]">{s.tba ? 'TBA' : +s.start.slice(8)}</span>
            <span aria-hidden className="pb-1 leading-tight">
              <span className="block text-xl font-semibold md:text-2xl">{monthLabel(s.start.slice(0, 7))}</span>
              <span className="block text-white/65 md:text-lg">{s.tba ? 'Exact date not announced' : weekday(s.start, true)}</span>
            </span>
          </div>
          <h2 className="display mt-6 max-w-[15ch] text-[clamp(2.75rem,3.4vw+1.6rem,5.25rem)]">
            <span className="sr-only">{s.tba ? `${monthLabel(s.start.slice(0, 7))}: ` : `${longDate(s.start)}: `}</span>{s.title}
          </h2>
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
                    <span className={`relative hidden aspect-video overflow-hidden rounded-art ring-2 transition md:block ${k === i ? 'ring-white' : 'opacity-55 ring-transparent group-hover/t:opacity-100'}`}>
                      <img src={x.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className="h-full w-full object-cover" />
                    </span>
                    <span className="block h-[3px] overflow-hidden rounded-full bg-white/20 md:mt-2.5">
                      {k === i && <span key={`${i}-${paused}`} className={`block h-full origin-left bg-mark ${paused ? '' : 'animate-bar'}`} />}
                    </span>
                    <span className={`mt-2 hidden truncate text-[13px] font-medium transition md:block ${k === i ? 'text-white' : 'text-white/55 group-hover/t:text-white/85'}`}>{x.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setStopped(!stopped)} aria-label={stopped ? 'Play slideshow' : 'Pause slideshow'} className="btn btn-glass mb-1 h-9 w-9 shrink-0 px-0 md:mb-8">
              <Icon name={stopped ? 'play' : 'pause'} className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
