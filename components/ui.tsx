'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, type SyntheticEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { type Ev, ago, googleUrl, href, range, scoreTone, srcSet, status, toDate } from '@/lib/core'
import { Logo } from './logo'

const Icon = ({ d, children, w = 2 }: { d?: string; children?: ReactNode; w?: number }) => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">{d ? <path d={d} /> : children}</svg>
)

// ── My list: kept in this browser, shared by every heart on the page and across tabs ──
const KEY = 'dropdate:saved', NONE: string[] = [], subs = new Set<() => void>()
let raw: string | null = null, saved = NONE
const read = () => {
  try { const r = localStorage.getItem(KEY); if (r !== raw) { raw = r; const v = r && JSON.parse(r); saved = Array.isArray(v) ? v : NONE } } catch {}
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
    saved = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    raw = JSON.stringify(saved)
    try { localStorage.setItem(KEY, raw) } catch {}
    subs.forEach((fn) => fn())
  }
  return { ids, has: (id: string) => ids.includes(id), toggle }
}

const Heart = ({ on }: { on: boolean }) => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c2 0 3.5 1 5.5 3 2-2 3.5-3 5.5-3C21 5 22.8 8.6 21.5 11.8 19.5 16.4 12 21 12 21z" /></svg>
)

/** A heart on cards; a labelled button on game pages. */
export function SaveButton({ id, label, art }: { id: string; label?: boolean; art?: boolean }) {
  const { has, toggle } = useSaved()
  const on = has(id)
  if (label) return <button onClick={() => toggle(id)} aria-pressed={on} className={art ? 'btn-art btn-hero' : 'btn-ghost'}><span className={on ? 'text-rose-500' : ''}><Heart on={on} /></span>{on ? 'Saved' : 'Save to my list'}</button>
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id) }} aria-pressed={on} aria-label={on ? 'Remove from my list' : 'Save to my list'}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition hover:bg-black/80 ${on ? 'text-rose-500' : 'text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100'}`}>
      <Heart on={on} />
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

// ── Header ──────────────────────────────────────────────────────────────

const NAV = [['Releases', '/#releases'], ['Calendar', '/#explore'], ['API', '/#api'], ['Docs', '/docs']]

export function Header({ overHero = false }: { overHero?: boolean }) {
  const router = useRouter()
  const [solid, setSolid] = useState(false)
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(true)
  const focusSearch = () => {
    const input = document.getElementById('search-input')
    if (!input) return router.push('/?focus=1#explore')
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
    input.focus({ preventScroll: true })
  }
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    const onScroll = () => setSolid(scrollY > 24)
    const onKey = (e: KeyboardEvent) => { // "/" or Ctrl/Cmd+K jumps to search, unless you're typing somewhere
      const el = document.activeElement as HTMLElement | null, typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); focusSearch() }
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('keydown', onKey)
    return () => { removeEventListener('scroll', onScroll); removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const flipTheme = () => {
    const quiet = document.createElement('style') // no colour fades while the whole page switches
    quiet.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.append(quiet)
    document.documentElement.classList.toggle('dark', !dark)
    try { localStorage.setItem('theme', dark ? 'light' : 'dark') } catch {}
    setDark(!dark)
    getComputedStyle(document.body).color
    setTimeout(() => quiet.remove(), 1)
  }
  const onDark = overHero && !solid && !open // transparent header over the (always dark) hero artwork
  const ghost = `btn-ghost ${onDark ? 'border-white/25 bg-black/30 text-white hover:bg-black/50' : ''}`
  const links = (cls: string) => NAV.map(([name, to]) => <Link key={name} href={to} onClick={() => setOpen(false)} className={cls}>{name}</Link>)

  return (
    <header className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${solid || open ? 'border-line/10 bg-bg/80 backdrop-blur-xl' : 'border-transparent'}`}>
      <div className="wrap flex h-16 items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Dropdate home"><Logo /><span className={`text-xl font-extrabold tracking-tight ${onDark ? 'text-white' : 'text-fg'}`}>Dropdate</span></Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">{links(`rounded-lg px-3 py-2 text-sm font-medium transition ${onDark ? 'text-white/80 hover:text-white' : 'text-muted hover:text-fg'}`)}</nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={focusSearch} className={`${ghost} hidden px-3 sm:inline-flex`} aria-label="Search">
            <Icon d="M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /><span className={onDark ? 'text-white/80' : 'text-muted'}>Search</span><span className="kbd">/</span>
          </button>
          <button onClick={flipTheme} className={`${ghost} px-2.5`} aria-label="Toggle theme">
            {dark ? <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon> : <Icon d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />}
          </button>
          <button onClick={() => setOpen(!open)} className={`${ghost} px-2.5 md:hidden`} aria-label="Menu" aria-expanded={open}><Icon d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} /></button>
        </div>
      </div>
      {open && <div className="wrap space-y-1 pb-4 md:hidden">{links('block rounded-lg px-3 py-3 text-base font-medium text-muted hover:bg-surface2 hover:text-fg')}</div>}
    </header>
  )
}

// ── Cards and rails ─────────────────────────────────────────────────────

const TONE = { live: 'bg-rose-500 text-white', soon: 'bg-amber-400 text-black', future: 'bg-black/65 text-white', past: 'bg-black/65 text-white/80' }
export const fallback = (ev: SyntheticEvent<HTMLImageElement>) => { // a resized image that fails falls back to the original; anything else hides
  const img = ev.currentTarget, original = img.src.replace(/\/resize\/\d+\/-\//, '/')
  if (original !== img.src) img.src = original
  else img.style.visibility = 'hidden'
}

export function Card({ e, today }: { e: Ev; today: string }) {
  const esport = e.kind === 'tournament', s = status(e, today), frames = e.thumb ? [e.thumb, ...e.shots] : []
  const [frame, setFrame] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  const play = () => { // hovering cycles through screenshots
    if (frames.length < 2 || timer.current) return
    setFrame(1)
    timer.current = setInterval(() => setFrame((n) => (n + 1) % frames.length), 1100)
  }
  const stop = () => { clearInterval(timer.current); timer.current = undefined; setFrame(0) }
  const chip = `rounded-sm px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm ${esport ? 'bg-bg/80 text-fg/80' : 'bg-black/65 text-white/90'}`

  const body = (
    <>
      <div className={`relative aspect-[16/10] overflow-hidden rounded-xl bg-surface2 ring-1 transition duration-300 group-hover:shadow-lift ${esport ? 'dots ring-line/20 group-hover:ring-fg/40' : 'ring-line/10 group-hover:ring-accent/50'}`}>
        {frames.length ? (
          <img src={frames[frame]} alt={e.title} loading="lazy" decoding="async" onError={fallback} onLoad={(ev) => { ev.currentTarget.style.visibility = '' }}
            className={`h-full w-full transition duration-500 ${esport ? 'object-contain p-10' : 'object-cover group-hover:scale-[1.04]'}`} />
        ) : <span className="absolute inset-0 grid place-items-center p-8 text-center text-lg font-bold text-muted">{e.genres[0]}</span>}
        {!esport && <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-black/20" />}
        <span className={`absolute top-2.5 left-2.5 rounded-md px-2 py-1 text-[11px] font-semibold backdrop-blur-sm ${TONE[s.tone]}`}>{s.label}</span>
        {!esport && (e.metacritic || e.rating) ? (
          <span title={e.metacritic ? 'Metacritic' : 'RAWG rating'} className={`absolute top-2.5 right-2.5 rounded-md px-1.5 py-1 text-[11px] font-bold ${e.metacritic ? scoreTone(e.metacritic) : 'bg-black/65 text-white'}`}>{e.metacritic ?? e.rating?.toFixed(1)}</span>
        ) : null}
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {esport && <span className="rounded-sm bg-fg px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-bg uppercase">Esports</span>}
            {(esport ? e.genres.slice(0, 1) : e.platforms.slice(0, 4)).map((p) => <span key={p} className={chip}>{p}</span>)}
          </div>
          <SaveButton id={e.id} />
        </div>
      </div>
      <div className="px-0.5 pt-3">
        <h3 className="line-clamp-1 text-[15px] leading-snug font-semibold transition group-hover:text-accent">{e.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{range(e.start, e.end)}{e.tba ? ' · TBA' : ''}{e.prize ? ` · ${e.prize}` : ''}{!esport && e.genres.length ? ` · ${e.genres.slice(0, 2).join(', ')}` : ''}</p>
      </div>
    </>
  )
  return (
    <article className="group animate-rise" onMouseEnter={play} onMouseLeave={stop} onFocus={play} onBlur={stop}>
      {e.slug ? <Link href={href(e)} className="block rounded-xl">{body}</Link> : <a href={e.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block rounded-xl">{body}</a>}
    </article>
  )
}

export function Rail({ eyebrow, title, items, today }: { eyebrow: string; title: string; items: Ev[]; today: string }) {
  const row = useRef<HTMLDivElement>(null)
  if (!items.length) return null
  return (
    <section className="py-8 md:py-10">
      <div className="wrap">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><p className="eyebrow mb-1.5">{eyebrow}</p><h2 className="h2">{title}</h2></div>
          <div className="hidden gap-2 sm:flex">
            {[-1, 1].map((d) => (
              <button key={d} onClick={() => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.85, behavior: 'smooth' })} aria-label={d < 0 ? 'Scroll left' : 'Scroll right'} className="btn-ghost h-9 w-9 p-0">
                <Icon d={d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} w={2.2} />
              </button>
            ))}
          </div>
        </div>
        <div ref={row} className="no-scrollbar -mr-5 flex snap-x snap-mandatory gap-4 overflow-x-auto pr-5 pb-2 sm:-mr-8 sm:pr-8">
          {items.map((e) => <div key={e.id} className="w-[260px] shrink-0 snap-start sm:w-[300px]"><Card e={e} today={today} /></div>)}
        </div>
      </div>
    </section>
  )
}

// ── Hero carousel ───────────────────────────────────────────────────────

function Countdown({ start, today }: { start: string; today: string }) {
  const [now, setNow] = useState<number>()
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 3e4)
    return () => clearInterval(t)
  }, [])
  if (start <= today) return <span className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-bold text-black">Out now</span>
  const ms = Math.max(0, toDate(start).getTime() - (now ?? 0)), pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  const parts = now === undefined ? ['--', '--', '--'] : [String(Math.floor(ms / 864e5)), pad((ms % 864e5) / 36e5), pad((ms % 36e5) / 6e4)]
  return (
    <div className="flex gap-2">
      {parts.map((v, i) => (
        <div key={i} className="min-w-[64px] rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-center backdrop-blur-sm">
          <div className="text-2xl font-extrabold tabular-nums">{v}</div>
          <div className="text-[10px] tracking-widest text-white/60 uppercase">{['days', 'hrs', 'min'][i]}</div>
        </div>
      ))}
    </div>
  )
}

export function Hero({ slides, today }: { slides: Ev[]; today: string }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loaded, setLoaded] = useState([0, 1]) // artwork in the page: slides shown so far, plus the next one
  const go = (n: number) => { setI(n); setLoaded((l) => [...new Set([...l, n, (n + 1) % slides.length])]) }
  useEffect(() => {
    if (paused || slides.length < 2) return
    const t = setTimeout(() => go((i + 1) % slides.length), 7000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, slides.length])
  if (!slides.length) return <section className="relative flex min-h-[60vh] items-end pt-32 pb-16"><div className="wrap"><p className="eyebrow mb-3">Dropdate</p><h1 className="h1 max-w-3xl">Every game drop. One calendar.</h1></div></section>
  const s = slides[i]

  return (
    <section className="relative isolate overflow-hidden text-white" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel">
      <div className="relative min-h-svh">
        {slides.map((x, n) => loaded.includes(n) && (
          <img key={x.id} src={x.image ?? x.thumb} srcSet={srcSet(x.image)} sizes="100vw" alt="" fetchPriority={n ? 'low' : 'high'} onError={fallback}
            className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-1000 ${n === i ? 'opacity-100' : 'opacity-0'}`} />
        ))}
        <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/45 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-t from-[#06080e] via-transparent to-black/50" />
        <div className="wrap relative flex min-h-svh flex-col pt-[6rem] pb-6 md:pb-9">
          <div key={s.id} className="flex max-w-2xl flex-1 animate-rise flex-col justify-center">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-bold tracking-wider text-white uppercase">{i === 0 ? 'Most anticipated' : 'Featured'}</span>
              {s.metacritic ? <span className={`rounded-md px-2 py-1 text-xs font-bold ${scoreTone(s.metacritic)}`}>{s.metacritic} Metacritic</span> : null}
            </div>
            <h1 className="text-[clamp(2.25rem,min(3.6vw+2.5svh,9svh),4.75rem)] leading-[1.03] font-extrabold tracking-tight">{s.title}</h1>
            <p className="mt-4 text-base text-white/80 md:text-lg">{range(s.start, s.end)}{s.genres.length ? ` · ${s.genres.slice(0, 3).join(' · ')}` : ''} · {s.platforms.join(' · ')}</p>
            <div className="mt-[clamp(.75rem,2.2svh,1.25rem)] tiny:hidden"><Countdown start={s.start} today={today} /></div>
            <div className="mt-[clamp(1rem,2.6svh,1.5rem)] flex flex-wrap gap-3">
              <Link href={href(s)} className="btn-primary btn-hero">View details</Link>
              <a href={googleUrl(s)} target="_blank" rel="noopener noreferrer" className="btn-art btn-hero">+ Add to calendar</a>
            </div>
          </div>
          <div className="mt-[clamp(1rem,3svh,2rem)] grid max-w-3xl gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${slides.length}, minmax(0, 1fr))` }}>
            {slides.map((x, n) => (
              <button key={x.id} onClick={() => go(n)} aria-label={`Show ${x.title}`} aria-current={n === i} className="group text-left">
                <div className="h-1 overflow-hidden rounded-full bg-white/25">
                  {n === i && <div key={`${i}-${paused}`} className={`h-full origin-left bg-white ${paused ? '' : 'animate-bar'}`} />}
                  {n < i && <div className="h-full bg-white" />}
                </div>
                <p className={`mt-2 line-clamp-1 text-xs font-medium transition ${n === i ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>{x.title}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
