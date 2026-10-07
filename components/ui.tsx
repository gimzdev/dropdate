'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type AnchorHTMLAttributes, type ReactNode, type SyntheticEvent, type TouchEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Ev, ago, href, iso, longDate, monthLabel, monthShort, scoreTone, status, toDate, weekday } from '@/lib/core'
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
}

export const Icon = ({ name, className = 'h-4 w-4', stroke = 2 }: { name: keyof typeof PATHS; className?: string; stroke?: number }) => (
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

// ── State shared across the page ───────────────────────────────────────

// My list: kept in this browser, shared by every heart on the page and across tabs
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

/** The time in the browser, refreshed every `ms` (undefined while rendering on the server). */
function useNow(ms: number) {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** Touch handlers that call `go(1)` or `go(-1)` on a horizontal swipe longer than `min` pixels. */
export function useSwipe(go: (d: number) => void, min: number) {
  const x = useRef<number | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => { x.current = e.touches[0].clientX },
    onTouchEnd: (e: TouchEvent) => {
      if (x.current === null) return
      const dx = e.changedTouches[0].clientX - x.current
      x.current = null
      if (Math.abs(dx) > min) go(dx < 0 ? 1 : -1)
    },
  }
}

// Jumping to the calendar section from anywhere: search, my list, a given day
export interface ExploreIntent { list?: boolean; day?: string; focus?: boolean }
export const EXPLORE_EVENT = 'dropdate:explore'

export function useExplore() {
  const router = useRouter()
  return (intent: ExploreIntent) => {
    const section = document.getElementById('explore')
    if (!section) {
      const qs = new URLSearchParams(Object.entries({ list: intent.list && '1', day: intent.day, focus: intent.focus && '1' }).filter((x): x is [string, string] => !!x[1])).toString()
      return router.push(`/${qs ? `?${qs}` : ''}#explore`)
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
/** Artwork, loaded lazily, with the fallback above. */
export const Img = ({ src, className }: { src: string; className: string }) => <img src={src} alt="" loading="lazy" decoding="async" onError={fallback} className={className} />

/** Artwork for a game, a league logo on a cyan glow for a tournament. */
export const Thumb = ({ e, className = '' }: { e: Pick<Ev, 'thumb' | 'kind'>; className?: string }) =>
  e.kind === 'tournament' ? (
    <span className={`tile-arena grid shrink-0 place-items-center overflow-hidden ${className}`}>
      {e.thumb ? <Img src={e.thumb} className="h-[66%] w-[66%] object-contain" /> : <Icon name="trophy" className="h-1/2 w-1/2 text-arena/70" stroke={1.5} />}
    </span>
  ) : e.thumb ? <Img src={e.thumb} className={`block shrink-0 bg-raised object-cover ${className}`} /> : <span className={`block shrink-0 bg-raised ${className}`} />

// [box, day, TBA, month] for each size
const DATE = { sm: ['min-w-7', 'text-[23px]', 'text-[15px]', 'mt-0.5 text-[10.5px]'], md: ['min-w-9', 'text-[30px]', 'text-[19px]', 'mt-0.5 text-[11.5px]'], lg: ['min-w-14', 'text-[52px]', 'text-[30px]', 'mt-1 text-[13px]'] }
/** How every event on Dropdate is dated: the day as a big condensed numeral over its month, like a calendar page. */
export function DateBlock({ start, tba, size = 'md' }: { start: string; tba?: boolean; size?: keyof typeof DATE }) {
  const [box, num, tbaSize, mon] = DATE[size]
  return (
    <span className={`flex shrink-0 flex-col items-center leading-none ${box}`}>
      <span className="sr-only">{tba ? `${monthLabel(start.slice(0, 7))}, exact date not announced` : longDate(start)}</span>
      <span aria-hidden className={`display ${tba ? tbaSize : num}`}>{tba ? 'TBA' : +start.slice(8)}</span>
      <span aria-hidden className={`font-semibold text-muted ${mon}`}>{monthShort(start)}</span>
    </span>
  )
}

/** The day as a huge numeral beside its month and weekday, over hero artwork. With a label for screen readers, it's a paragraph. */
export function BigDate({ date, tba, size, unknown, label }: { date: string; tba?: boolean; size: string; unknown: string; label?: string }) {
  const Tag = label ? 'p' : 'div'
  return (
    <Tag className="flex items-end gap-4">
      {label && <span className="sr-only">{label}</span>}
      <span aria-hidden className={`display ${size} leading-[0.78]`}>{tba ? 'TBA' : +date.slice(8)}</span>
      <span aria-hidden className="pb-1 leading-tight"><span className="block text-xl font-semibold md:text-2xl">{monthLabel(date.slice(0, 7))}</span><span className="block text-white/65 md:text-lg">{tba ? unknown : weekday(date)}</span></span>
    </Tag>
  )
}

/** A heart on artwork, a quiet heart in lists, or a labelled button. Saving shows in the header count. */
export function SaveButton({ id, title, label, variant = 'art' }: { id: string; title: string; label?: boolean; variant?: 'art' | 'glass' | 'plain' }) {
  const { has, toggle } = useSaved()
  const on = has(id), [bump, setBump] = useState(0)
  const props = {
    type: 'button' as const, 'aria-pressed': on, ...(!label && { 'aria-label': `Save ${title}`, title: on ? 'Saved to my list' : 'Save to my list' }),
    onClick: (ev: { preventDefault(): void; stopPropagation(): void }) => { ev.preventDefault(); ev.stopPropagation(); toggle(id); setBump((n) => n + 1) },
  }
  const heart = <span key={bump} className={`inline-flex ${bump ? 'animate-pop' : ''} ${on ? 'text-mark' : ''}`}><Heart on={on} /></span>
  if (label) return <button {...props} className={`btn ${variant === 'glass' ? 'btn-glass' : 'btn-line'}`}>{heart}{on ? 'Saved' : 'Save'}</button>
  return (
    <button {...props} className={variant === 'plain' ? `grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-raised ${on ? 'text-mark' : 'text-dim hover:text-fg'}`
      : `grid h-9 w-9 place-items-center rounded-full backdrop-blur-md transition ${on ? 'bg-black/75' : 'bg-black/55 text-white opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/80 focus-visible:opacity-100 touch:opacity-100'}`}>
      {heart}
    </button>
  )
}

export function Updated({ at }: { at: string }) {
  const now = useNow(6e4)
  return <>{now === undefined ? 'recently' : ago(at)}</>
}

/** A page section: a big title, a lede and an optional action on the right, over its content. Titled by id, or labelled by its title. */
export function Section({ id, title, lede, action, className = 'border-t border-line/10 py-14 md:py-20', children }: { id?: string; title: string; lede?: ReactNode; action?: ReactNode; className?: string; children: ReactNode }) {
  const head = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={head} aria-label={head ? undefined : title} className={className}>
      <div className="wrap">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 md:mb-10">
          <div className="min-w-0"><h2 id={head} className="h-section">{title}</h2>{lede && <p className="lede">{lede}</p>}</div>
          {action}
        </div>
        {children}
      </div>
    </section>
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

const NAV = [['This week', '/#week'], ['Upcoming', '/#upcoming'], ['Esports', '/#esports'], ['Calendar', '/#explore'], ['API', '/docs']]

export function Header({ overHero = false }: { overHero?: boolean }) {
  const explore = useExplore(), { ids } = useSaved()
  const [scrolled, setScrolled] = useState(false), [open, setOpen] = useState(false)
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
        <HomeLink className="flex shrink-0 items-center gap-2 rounded-lg pr-2"><Logo size={30} /><span className="display text-[23px] text-white">Dropdate</span></HomeLink>
        <nav aria-label="Main" className="ml-5 hidden items-center lg:flex">
          {NAV.map(([name, to]) => <Link key={name} href={to} className={`rounded-full px-3.5 py-2 text-[15px] font-medium transition ${clear ? 'text-white/80 hover:text-white' : 'text-muted hover:text-fg'}`}>{name}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => go({ focus: true })} aria-label="Search games and tournaments" className={`${ctl} w-9 px-0 sm:w-auto sm:px-4`}>
            <Icon name="search" /><span className="hidden sm:inline">Search</span><span className="kbd hidden opacity-70 md:inline-grid">/</span>
          </button>
          <button type="button" onClick={() => go({ list: true })} aria-label={`My list, ${ids.length} saved`} className={`${ctl} relative w-9 px-0 sm:w-auto sm:px-4`}>
            <span className={ids.length ? 'text-mark' : ''}><Heart on={ids.length > 0} className="h-4 w-4" /></span>
            <span className="hidden sm:inline">My list</span>
            {ids.length > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-mark px-1 text-[11px] font-bold text-black sm:static sm:-mr-1.5">{ids.length}</span>}
          </button>
          <button type="button" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="site-menu" className={`${ctl} w-9 px-0 lg:hidden`}><Icon name={open ? 'close' : 'menu'} /></button>
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

// ── Card ────────────────────────────────────────────────────────────────

// Out today in green (a live tournament in red), the coming week in yellow, later in grey
const TONE = { live: 'text-go', soon: 'text-mark', future: 'text-muted', past: 'text-dim' }

/** An event as a card. With `row`, phones get a compact row (artwork beside the date) so long lists stay scannable. */
export function Card({ e, today, row }: { e: Ev; today: string; row?: boolean }) {
  const esport = e.kind === 'tournament', s = status(e, today), frames = !esport && e.thumb ? [e.thumb, ...e.shots] : []
  const [frame, setFrame] = useState(0), timer = useRef<ReturnType<typeof setInterval>>(undefined)
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
            e.thumb ? <Img src={e.thumb} className="absolute inset-0 m-auto h-[52%] w-[52%] object-contain drop-shadow-[0_10px_24px_rgb(0_0_0/0.5)]" />
              : <Icon name="trophy" className="absolute inset-0 m-auto h-12 w-12 text-arena/60" stroke={1.5} />
          ) : frames.length ? (
            <img src={frames[frame]} alt="" loading="lazy" decoding="async" onError={fallback} onLoad={(ev) => { ev.currentTarget.style.visibility = '' }} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          ) : <span className="display absolute inset-0 grid place-items-center p-6 text-center text-2xl text-dim">{e.genres[0] ?? 'Coming soon'}</span>}
          {frames.length > 1 && (
            <span aria-hidden className="pointer-events-none absolute top-3 right-14 left-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {frames.map((f, k) => <span key={f} className={`h-[3px] flex-1 rounded-full ${k === frame ? 'bg-white' : 'bg-white/35'}`} />)}
            </span>
          )}
          {esport ? !!e.prize && <span className="tag absolute bottom-2.5 left-2.5 bg-black/70 text-white backdrop-blur-md">{e.prize}</span>
            : !!e.metacritic && <span title="Metacritic score" className={`tag absolute bottom-2.5 left-2.5 ${scoreTone(e.metacritic)}`}>{e.metacritic}</span>}
        </div>
        <div className={row ? 'flex min-w-0 flex-1 gap-3 sm:mt-3' : 'mt-3 flex gap-3'}>
          <DateBlock start={e.start} tba={e.tba} />
          <div className="min-w-0 pt-px">
            <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold decoration-line/40 underline-offset-[3px] group-hover:underline">{e.title}</h3>
            <p className="mt-1 flex flex-wrap gap-x-2.5 text-[13px] leading-snug">
              <span className={`font-semibold ${s.tone === 'live' && esport ? 'text-live' : TONE[s.tone]}`}>{s.label}</span>
              <span className="text-muted">{esport ? e.genres[0] : e.platforms.map((p) => (p === 'PlayStation' ? 'PS' : p)).join(', ')}</span>
            </p>
          </div>
        </div>
      </Open>
      <div className={row ? 'absolute top-1.5 left-[94px] sm:top-2.5 sm:right-2.5 sm:left-auto' : 'absolute top-2.5 right-2.5'}><SaveButton id={e.id} title={e.title} /></div>
    </article>
  )
}

// ── Countdown ───────────────────────────────────────────────────────────

export function Countdown({ start, today, className = '' }: { start: string; today: string; className?: string }) {
  const now = useNow(3e4), day = now === undefined ? today : iso(new Date(now)) // flips to "Out today" at midnight without a reload
  if (start <= day) return <p className={`inline-flex items-center gap-2 text-[17px] font-semibold text-go ${className}`}><span className="h-2 w-2 rounded-full bg-go" />{start === day ? 'Out today' : 'Out now'}</p>
  const ms = Math.max(0, toDate(start).getTime() - (now ?? 0)), d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  const parts: [string, string][] = now === undefined
    ? [['--', 'days'], ['--', 'hours'], ['--', 'min']]
    : [...(d ? [[String(d), d === 1 ? 'day' : 'days'] as [string, string]] : []), [String(h).padStart(2, '0'), h === 1 ? 'hour' : 'hours'], [String(m).padStart(2, '0'), 'min']]
  return (
    <p role="timer" aria-label={now === undefined ? 'Countdown' : `${d ? `${d} days, ` : ''}${h} hours and ${m} minutes to go`} className={`flex items-baseline gap-4 ${className}`}>
      {parts.map(([v, unit], k) => <span key={k} aria-hidden className="flex items-baseline gap-1.5"><span className="display text-[34px] text-mark">{v}</span><span className="text-sm text-muted">{unit}</span></span>)}
    </p>
  )
}
