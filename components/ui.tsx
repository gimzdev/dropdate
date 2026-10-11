'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { type AnchorHTMLAttributes, type ReactNode, type RefObject, type SyntheticEvent, type TouchEvent, useEffect, useRef, useState } from 'react'
import { dismiss, drop, notify, ready, setList, signOut, signedInNow, useAccount, useNotice, useSaved } from '@/lib/account'
import { ACCOUNTS, type Ev, type Found, PLATFORMS, type Platform, ago, href, iso, longDate, monthLabel, monthShort, scoreTone, status, toDate, webcal, weekday } from '@/lib/core'
import { Heart, Icon, Logo } from './icons'

export { Heart, Icon, useSaved }

export const Circled = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 100 80" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute text-mark ${className}`}>
    <path d="M58 6C30 3 6 17 6 39c0 22 22 36 48 35 26-1 41-17 40-36C93 19 77 6 47 9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>
)


/** Pages render on the server with its date; the browser then switches to the visitor's own today. */
export function useToday(server: string) {
  const [today, setToday] = useState(server)
  useEffect(() => setToday(iso(new Date())), [])
  return today
}
function useNow(ms: number) {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
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
/** While `on`, a press (and with `focus`, the keyboard landing) anywhere outside `box` calls `away`. */
export function useOutside(box: RefObject<HTMLElement | null>, on: boolean, away: () => void, focus = false) {
  useEffect(() => {
    if (!on) return
    const f = (e: Event) => { if (!box.current?.contains(e.target as Node)) away() }
    document.addEventListener('pointerdown', f)
    if (focus) document.addEventListener('focusin', f)
    return () => { document.removeEventListener('pointerdown', f); document.removeEventListener('focusin', f) }
  }, [on])
}
export function useLookup(q: string) {
  const [found, setFound] = useState<Found[] | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    if (!q) return setFound(null)
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        if (!res.ok) { drop(res); throw new Error(String(res.status)) }
        setFound(((await res.json()) as { data: Found[] }).data)
      } catch { if (!ctl.signal.aborted) { setFound(null); setFailed(true) } }
    }, 350)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])
  return { found, failed }
}

// Jumping to the calendar section from anywhere: search, the wishlist, a given day
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


type OpenProps = { e: Pick<Ev, 'slug' | 'url'>; className?: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>
export const Open = ({ e, className, children, ...rest }: OpenProps) =>
  e.slug ? <Link href={href(e)} className={className} {...rest}>{children}</Link>
    : <a href={e.url ?? '#'} target="_blank" rel="noopener noreferrer" className={className} {...rest}>{children}</a>

/** A resized image that fails falls back to the original; anything else hides. */
export const fallback = (ev: SyntheticEvent<HTMLImageElement>) => {
  const img = ev.currentTarget, original = img.src.replace(/\/resize\/\d+\/-\//, '/')
  if (original !== img.src) img.src = original
  else img.style.visibility = 'hidden'
}
export const Img = ({ src, className }: { src: string; className: string }) => <img src={src} alt="" loading="lazy" decoding="async" onError={fallback} className={className} />

export const Thumb = ({ e, className = '' }: { e: Pick<Ev, 'thumb' | 'kind'>; className?: string }) =>
  e.kind === 'tournament' ? (
    <span className={`tile-arena grid shrink-0 place-items-center overflow-hidden ${className}`}>
      {e.thumb ? <Img src={e.thumb} className="h-[66%] w-[66%] object-contain" /> : <Icon name="trophy" className="h-1/2 w-1/2 text-arena/70" stroke={1.5} />}
    </span>
  ) : e.thumb ? <Img src={e.thumb} className={`block shrink-0 bg-raised object-cover ${className}`} /> : <span className={`block shrink-0 bg-raised ${className}`} />

// [box, day, TBA, month] per size
const DATE = { sm: ['min-w-7', 'text-[23px]', 'text-[15px]', 'mt-0.5 text-[10.5px]'], md: ['min-w-9', 'text-[30px]', 'text-[19px]', 'mt-0.5 text-[11.5px]'], lg: ['min-w-14', 'text-[52px]', 'text-[30px]', 'mt-1 text-[13px]'] }
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

const signInHref = (path: string) => (path.startsWith('/signin') ? '/signin' : `/signin?next=${encodeURIComponent(path)}`)

export function SaveButton({ id, title, label, variant = 'art', needsAccount }: { id: string; title: string; label?: boolean; variant?: 'art' | 'glass' | 'plain'; needsAccount?: boolean }) {
  const { has, toggle, signedIn, phase } = useSaved(), router = useRouter()
  const on = has(id), [bump, setBump] = useState(0)
  const props = {
    type: 'button' as const, 'aria-pressed': on, ...(!label && { 'aria-label': `Add ${title} to your wishlist`, title: on ? 'On your wishlist' : 'Add to your wishlist' }),
    onClick: (ev: { preventDefault(): void; stopPropagation(): void }) => {
      ev.preventDefault()
      ev.stopPropagation()
      const signIn = () => router.push(signInHref(location.pathname + location.search)) // back to the same filters, not only the same page
      if (needsAccount && !signedIn && phase !== 'loading') return signIn() // a game the calendar does not hold can only be kept in an account
      setBump((n) => n + 1)
      void toggle(id, needsAccount).then((done) => { if (!done) signIn() })
    },
  }
  const heart = <span key={bump} className={`inline-flex ${bump ? 'animate-pop' : ''} ${on ? 'text-mark' : ''}`}><Heart on={on} /></span>
  if (label) return <button {...props} className={`btn ${variant === 'glass' ? 'btn-glass' : 'btn-line'}`}>{heart}{on ? 'Wishlisted' : 'Wishlist'}</button>
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

export function Select<T extends string>({ label, value, onChange, options, className = '' }: { label: string; value: T; onChange: (v: T) => void; options: string[][]; className?: string }) {
  return (
    <span className="relative shrink-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
        className={`h-10 appearance-none truncate rounded-full bg-transparent pr-9 pl-4 text-sm font-semibold ring-1 transition ring-inset hover:ring-line/30 ${value !== options[0][0] ? 'text-fg ring-fg' : 'text-muted ring-line/12'} ${className}`}>
        {options.map(([v, text = v]) => <option key={v} value={v} className="bg-panel text-fg">{text}</option>)}
      </select>
      <Icon name="down" className="pointer-events-none absolute top-1/2 right-3.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </span>
  )
}

export const FilterBar = ({ children, end }: { children: ReactNode; end: ReactNode }) => (
  <div className="sticky top-[65px] z-30 -mx-4 mt-8 border-y border-line/10 bg-black/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-[76px] lg:mx-0 lg:rounded-full lg:border lg:px-2.5 lg:py-2">
    <div className="flex items-center gap-3">
      <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] xl:[mask-image:none]">{children}</div>
      {end}
    </div>
  </div>
)
export const Sep = () => <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line/12" />
export const PlatformPills = ({ value, onChange }: { value: string; onChange: (p: Platform | '') => void }) => (
  <div role="group" aria-label="Platform" className="flex shrink-0 gap-1.5">
    {PLATFORMS.map((p) => <button key={p} type="button" onClick={() => onChange(value === p ? '' : p)} aria-pressed={value === p} className="pill">{p}</button>)}
  </div>
)

export function FeedPanel({ feed, title, as: H = 'h3', className, children }: { feed: string; title: ReactNode; as?: 'h2' | 'h3'; className: string; children: ReactNode }) {
  const [copied, setCopied] = useState(''), done = !!copied && copied === feed
  const copy = async () => {
    try { await navigator.clipboard.writeText(feed) } catch { return void prompt('Calendar feed link', feed) }
    setCopied(feed)
    setTimeout(() => setCopied(''), 2200)
  }
  return (
    <div className={`${className} grid grid-cols-1 gap-6 rounded-panel bg-panel p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8`}>
      <div className="flex gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-mark text-black"><Icon name="calendar" className="h-6 w-6" /></span>
        <div><H className="text-lg font-semibold">{title}</H>{children}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={feed ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(feed))}` : undefined} target="_blank" rel="noopener noreferrer" className="btn btn-mark">Google Calendar</a>
        <a href={feed ? webcal(feed) : undefined} className="btn btn-line">Apple or Outlook</a>
        <button type="button" onClick={copy} disabled={!feed} className="btn btn-line"><Icon name={done ? 'check' : 'copy'} />{done ? 'Link copied' : 'Copy link'}</button>
      </div>
    </div>
  )
}

// ── Header ──

/** On the home page the logo scrolls to the very top (clearing any #section or ?search); elsewhere it goes home. */
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

const NAV = [['This week', '/#week'], ['Upcoming', '/#upcoming'], ['Esports', '/#esports'], ['Calendar', '/#explore'], ['Browse', '/browse']]

function WishlistButton({ className, onClick }: { className: string; onClick: () => void }) {
  const { ids } = useSaved()
  return (
    <button type="button" onClick={onClick} aria-label={`Your wishlist, ${ids.length} saved`} className={`${className} relative w-9 px-0 sm:w-auto sm:px-4`}>
      <span className={ids.length ? 'text-mark' : ''}><Heart on={ids.length > 0} className="h-4 w-4" /></span>
      <span className="hidden sm:inline">Wishlist</span>
      {ids.length > 0 && <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-mark px-1 text-[11px] font-bold text-black sm:static sm:-mr-1.5">{ids.length}</span>}
    </button>
  )
}

/** Sign in, or the account menu. Until the browser knows, both are in the page and the CSS shows the right one (no flash). */
function AccountMenu({ className }: { className: string }) {
  const account = useAccount(), path = usePathname()
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [path])
  useOutside(box, open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus() } }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open])

  const slim = `${className} w-9 px-0 sm:w-auto sm:px-4`, link = <><Icon name="user" /><span className="hidden sm:inline">Sign in</span></>
  if (account.phase === 'idle' || account.phase === 'loading') return (
    <>
      <Link href={signInHref(path)} className={`${slim} signed:hidden`}>{link}</Link>
      <span aria-hidden className={`${className} pointer-events-none hidden w-9 px-0 opacity-60 signed:inline-flex`}><Icon name="user" /></span>
    </>
  )
  if (account.phase === 'out') return <Link href={signInHref(path)} className={slim}>{link}</Link>
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-muted transition hover:bg-raised hover:text-fg'
  return (
    <div ref={box} className="relative" onBlur={(e) => { if (open && !box.current?.contains(e.relatedTarget as Node | null)) setOpen(false) }}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="account-menu" aria-label={`Account, ${account.email}`} className={`${className} w-9 px-0`}>
        <span aria-hidden className="text-[15px] font-bold uppercase">{account.email.slice(0, 1)}</span>
      </button>
      {open && (
        <div id="account-menu" className="absolute top-full right-0 z-50 mt-2 w-64 rounded-2xl bg-panel p-1.5 text-fg shadow-2xl ring-1 ring-line/12 ring-inset">
          <p className="truncate px-3 pt-2 pb-2.5 text-[13px] text-dim" title={account.email}>{account.email}</p>
          <Link href="/profile" onClick={() => setOpen(false)} className={item}><Icon name="pad" />Your games</Link>
          <div className="my-1.5 border-t border-line/10" />
          <button type="button" onClick={() => void signOut()} className={item}><Icon name="logout" />Sign out</button>
        </div>
      )}
    </div>
  )
}

export function Header({ overHero = false }: { overHero?: boolean }) {
  const explore = useExplore()
  const [scrolled, setScrolled] = useState(false), [open, setOpen] = useState(false), bar = useRef<HTMLElement>(null)
  useOutside(bar, open, () => setOpen(false))
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 12)
    const onKey = (e: KeyboardEvent) => { // "/" or Ctrl/Cmd+K jumps to search, unless you are typing somewhere
      const el = document.activeElement as HTMLElement | null, typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); setOpen(false); explore({ focus: true }) }
      else if (e.key === 'Escape') setOpen(false)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('keydown', onKey)
    return () => { removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey) }
  }, [])
  const clear = overHero && !scrolled && !open // see-through over the hero artwork
  const ctl = `btn btn-sm ${clear ? 'btn-glass' : 'btn-line'}`
  const go = (intent: ExploreIntent) => { setOpen(false); explore(intent) }
  return (
    <header ref={bar} className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${clear ? 'border-transparent bg-linear-to-b from-black/55 to-transparent bg-origin-border' : 'border-line/10 bg-black/85 backdrop-blur-xl'}`}>
      <div className="wrap flex h-16 items-center gap-2">
        <HomeLink className="flex shrink-0 items-center gap-2 rounded-lg pr-2"><Logo size={30} /><span className="display text-[23px] text-white max-[339px]:hidden">Dropdate</span></HomeLink>
        <nav aria-label="Main" className="ml-5 hidden items-center lg:flex">
          {NAV.map(([name, to]) => <Link key={name} href={to} className={`rounded-full px-3.5 py-2 text-[15px] font-medium transition ${clear ? 'text-white/80 hover:text-white' : 'text-muted hover:text-fg'}`}>{name}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => go({ focus: true })} aria-label="Search games and tournaments" className={`${ctl} w-9 px-0 sm:w-auto sm:px-4`}>
            <Icon name="search" /><span className="hidden sm:inline">Search</span><span className="kbd hidden opacity-70 md:inline-grid">/</span>
          </button>
          {ACCOUNTS ? <AccountMenu className={ctl} /> : <WishlistButton className={ctl} onClick={() => go({ list: true })} />}
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


/** Played and Completed (completing marks both, un-playing clears both); signed out, they go to sign in and back. */
export function Progress({ id, title }: { id: string; title: string }) {
  const account = useAccount(), router = useRouter(), path = usePathname()
  const played = account.played.includes(id), done = account.completed.includes(id), settled = account.phase === 'out' || account.phase === 'in'
  const click = async (list: 'played' | 'completed', on: boolean) => {
    await ready()
    if (!signedInNow()) return router.push(signInHref(path))
    if ((await setList(list, id, on)) && list === 'completed' && on) notify(`${title} completed.`)
  }
  const part = (on: boolean) => `btn ${on ? 'bg-go/20 text-go ring-1 ring-go/50 ring-inset hover:bg-go/30' : 'btn-glass'}`
  return (
    <div role="group" aria-label="Your progress" className={`inline-flex ${settled ? '' : 'invisible'}`}>
      <button type="button" onClick={() => void click('played', !played)} aria-pressed={played} title={played ? 'You have played this' : 'Add to the games you have played'} aria-label={`Played: ${title}`}
        className={`${part(played)} rounded-r-none pr-4`}>
        <Icon name={played ? 'check' : 'pad'} />Played
      </button>
      <button type="button" onClick={() => void click('completed', !done)} aria-pressed={done} title={done ? 'You have completed this' : 'Mark as completed'} aria-label={`Completed: ${title}`}
        className={`${part(done)} -ml-px rounded-l-none pl-4`}>
        <span key={String(done)} className={`inline-flex ${done ? 'animate-pop' : ''}`}><Icon name={done ? 'check' : 'flag'} /></span>Completed
      </button>
    </div>
  )
}

/** A short message at the bottom of the screen; the region stays in the page so screen readers announce it. */
export function Notice() {
  const message = useNotice()
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      {message && (
        <div className="pointer-events-auto flex max-w-md animate-enter items-center gap-3 rounded-2xl bg-fg py-2.5 pr-2.5 pl-5 text-[15px] leading-snug font-medium text-black shadow-2xl">
          <span>{message}</span>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-black/10"><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  )
}


export const Score = ({ n, className = '' }: { n: number; className?: string }) => (
  <span title={`Critic score: ${n} out of 100`} className={`tag ${scoreTone(n)} ${className}`}>{n}<span className="sr-only"> critic score</span></span>
)

// Out today in green (a live tournament in red), the coming week in yellow, later in grey
export const TONE = { live: 'text-go', soon: 'text-mark', future: 'text-muted', past: 'text-dim' }

type Shots = Record<string, string[]>
let shotMap: Promise<Shots> | undefined
/** The home page leaves screenshots out (most of its weight): they come in one go when the page is idle, on screens that hover. */
const loadShots = () => (shotMap ??= fetch('/api/shots').then((r): Promise<Shots> | Shots => (r.ok ? r.json() : {})).catch((): Shots => { shotMap = undefined; return {} }))
export const warmShots = () => { if (matchMedia('(hover: hover)').matches) (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500)))(() => void loadShots()) }

/**
 * An event as a card. `row`: a compact row on phones. `when` replaces the status ("2015", not "Out now"). `outside`: a game the calendar
 * does not hold, kept only in an account. `lazy`: its screenshots were left out of the page and load on first hover.
 */
export function Card({ e, today, row, when, outside, lazy }: { e: Ev; today: string; row?: boolean; when?: string; outside?: boolean; lazy?: boolean }) {
  const esport = e.kind === 'tournament', s = status(e, today)
  const [shots, setShots] = useState<string[]>(), [on, setOn] = useState(false), [frame, setFrame] = useState(0)
  const frames = !esport && e.thumb ? [e.thumb, ...(shots ?? e.shots ?? [])] : []
  useEffect(() => {
    if (!on || frames.length < 2) return setFrame(0)
    setFrame(1)
    const t = setInterval(() => setFrame((n) => (n + 1) % frames.length), 1100)
    return () => clearInterval(t)
  }, [on, frames.length])
  const play = () => { setOn(true); if (lazy && !shots && frames.length) void loadShots().then((m) => setShots(m[e.id] ?? [])) }
  const stop = () => setOn(false)
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
            : !!e.metacritic && <Score n={e.metacritic} className="absolute bottom-2.5 left-2.5" />}
        </div>
        <div className={row ? 'flex min-w-0 flex-1 gap-3 sm:mt-3' : 'mt-3 flex gap-3'}>
          <DateBlock start={e.start} tba={e.tba} />
          <div className="min-w-0 pt-px">
            <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold decoration-line/40 underline-offset-[3px] group-hover:underline">{e.title}</h3>
            <p className="mt-1 flex flex-wrap gap-x-2.5 text-[13px] leading-snug">
              <span className={`font-semibold ${when ? 'text-muted' : s.tone === 'live' && esport ? 'text-live' : TONE[s.tone]}`}>{when ?? s.label}</span>
              <span className="text-muted">{esport ? e.genres[0] : e.platforms.map((p) => (p === 'PlayStation' ? 'PS' : p)).join(', ')}</span>
            </p>
          </div>
        </div>
      </Open>
      {(!outside || ACCOUNTS) && <div className={row ? 'absolute top-1.5 left-[94px] sm:top-2.5 sm:right-2.5 sm:left-auto' : 'absolute top-2.5 right-2.5'}><SaveButton id={e.id} title={e.title} needsAccount={outside} /></div>}
    </article>
  )
}

export function Countdown({ start, today, className = '' }: { start: string; today: string; className?: string }) {
  const now = useNow(3e4), day = now === undefined ? today : iso(new Date(now)) // turns to "Out today" at midnight without a reload
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
