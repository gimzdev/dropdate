'use client'

import { useRouter } from 'next/navigation'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { type Chip, type Ev, type Kind, type Payload, type Platform, PLATFORMS, href, iso, longDate, monthLabel, range, removeChip, search, shift, toDate } from '@/lib/core'
import { Card, Updated, useSaved } from './ui'

const PAGE = 16
const SORTS = { date: 'Release date', hype: 'Most anticipated', score: 'Top rated' }
type Sort = keyof typeof SORTS
const EXAMPLES = ['ps5 releases next month', 'esports this weekend', 'switch in december', 'xbox shooters in october', 'pc games q4', 'past tournaments']
const score = (e: Ev) => e.metacritic ?? (e.rating ?? 0) * 20
const GRID = 'grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

function Segment<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border border-line/15 bg-surface p-0.5">
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} aria-pressed={value === id} className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${value === id ? 'bg-accent text-accent-fg shadow-card' : 'text-muted hover:text-fg'}`}>{label}</button>
      ))}
    </div>
  )
}
function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: string[][] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="h-10 rounded-lg border border-line/15 bg-surface px-3 text-sm font-medium outline-none transition hover:border-line/30 focus:border-accent">
      {options.map(([v, text = v]) => <option key={v} value={v}>{text}</option>)}
    </select>
  )
}

export function Explorer({ data }: { data: Payload }) {
  const saved = useSaved()
  const [today, setToday] = useState(data.today)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [genre, setGenre] = useState('all')
  const [sort, setSort] = useState<Sort>('date')
  const [view, setView] = useState<'grid' | 'calendar'>('grid')
  const [onlySaved, setOnlySaved] = useState(false)
  const [month, setMonth] = useState(data.today.slice(0, 7))
  const [day, setDay] = useState<string>()
  const [limit, setLimit] = useState(PAGE)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { // the page may be an hour old: use the visitor's own today, and their ?q=
    const t = iso(new Date()), p = new URLSearchParams(location.search)
    setToday(t)
    setMonth(t.slice(0, 7))
    setQ(p.get('q') ?? '')
    if (p.get('focus')) setTimeout(() => document.getElementById('search-input')?.focus(), 300)
    setReady(true)
  }, [])
  useEffect(() => {
    if (ready) history.replaceState(null, '', (q ? `?q=${encodeURIComponent(q)}` : location.pathname) + location.hash)
    setLimit(PAGE)
  }, [q, kind, platform, genre, sort, onlySaved, ready])

  const genres = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of data.events) if (e.kind === 'release') for (const g of e.genres) n.set(g, (n.get(g) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([g]) => [g])
  }, [data.events])

  const { list, parsed } = useMemo(() => {
    const span = view === 'calendar' ? { from: `${month}-01`, to: shift(`${month}-01`, new Date(+month.slice(0, 4), +month.slice(5), 0).getDate() - 1) } : {}
    const r = search(data.events, q, today, { kind, platform, genre, ...span })
    let l = r.list
    // just browsing: tournaments already under way have their own rail, so the grid starts with what's next
    if (view === 'grid' && kind === 'all' && !q.trim() && !onlySaved) l = l.filter((e) => e.kind === 'release' || e.start >= today)
    if (onlySaved) l = l.filter((e) => saved.has(e.id))
    if (view === 'grid' && sort !== 'date') l = [...l].sort((a, b) => (sort === 'hype' ? b.pop - a.pop : score(b) - score(a)))
    return { list: l, parsed: r.parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.events, q, today, kind, platform, genre, sort, view, onlySaved, saved.ids, month])

  const groups = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of list.slice(0, limit)) { const k = sort === 'date' ? e.start.slice(0, 7) : ''; m.set(k, [...(m.get(k) ?? []), e]) }
    return [...m]
  }, [list, limit, sort])

  const dayList = day ? list.filter((e) => e.start <= day && (e.end ?? e.start) >= day) : []
  const moveMonth = (n: number) => { setMonth(iso(new Date(+month.slice(0, 4), +month.slice(5) - 1 + n, 1)).slice(0, 7)); setDay(undefined) }
  const reset = () => { setQ(''); setKind('all'); setPlatform('all'); setGenre('all'); setOnlySaved(false) }
  const feed = (ids?: string[]) => { // the feed follows the filters on screen
    const p = Object.entries(ids ? { ids: ids.join(',') } : { q, type: kind, platform, genre }).filter(([, v]) => v && v !== 'all')
    return `${location.origin}/api/calendar.ics?${new URLSearchParams(p)}`
  }
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url) } catch { prompt('Calendar feed URL', url) }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <section id="explore" className="mt-6 border-y border-line/10 bg-surface/50 py-12 md:py-16">
      <div className="wrap">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow mb-2">Explore</p>
          <h2 className="h2 mb-3">Search the calendar</h2>
          <p className="text-muted">One search across every release and tournament, by game, platform or date, with your favorites a click away from your own calendar.</p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
            Live · updated <Updated at={data.updated} />
          </p>
        </div>
        {data.error && <div className="mx-auto mb-6 max-w-3xl rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><strong>Live data unavailable.</strong> {data.error} Check your environment variables and redeploy.</div>}
        {data.stale && !data.error && <div className="mx-auto mb-6 max-w-3xl rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm text-amber-300">Couldn&apos;t refresh just now. Showing the last good data.</div>}
        <div className="mx-auto mb-8 max-w-3xl"><SearchBox value={q} onChange={setQ} events={data.events} today={today} chips={parsed.chips} /></div>

        <div className="mb-8 flex flex-wrap items-center gap-3">
          <Segment value={kind} onChange={setKind} items={[['all', 'All'], ['release', 'Releases'], ...(data.events.some((e) => e.kind === 'tournament') ? [['tournament', 'Tournaments'] as [Kind, string]] : [])]} />
          <Select label="Platform" value={platform} onChange={setPlatform} options={[['all', 'All platforms'], ...PLATFORMS.map((p) => [p])]} />
          <Select label="Genre" value={genre} onChange={setGenre} options={[['all', 'All genres'], ...genres]} />
          {view === 'grid' && <Select label="Sort" value={sort} onChange={setSort} options={Object.entries(SORTS)} />}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <button onClick={() => setOnlySaved(!onlySaved)} aria-pressed={onlySaved} className={`btn-ghost h-10 ${onlySaved ? 'border-accent text-accent' : ''}`}>♥ My list{saved.ids.length ? ` · ${saved.ids.length}` : ''}</button>
            <Segment value={view} onChange={setView} items={[['grid', 'Grid'], ['calendar', 'Calendar']]} />
          </div>
        </div>

        {view === 'calendar' ? (
          <div className="space-y-8">
            <MonthGrid month={month} events={list} today={today} selected={day} onSelect={(d) => { setDay(d); setMonth(d.slice(0, 7)) }} onMonth={moveMonth} />
            {day ? (
              <div>
                <h3 className="mb-4 text-lg font-bold">{longDate(day)} <span className="ml-2 text-sm font-normal text-muted">{dayList.length} {dayList.length === 1 ? 'event' : 'events'}</span></h3>
                {dayList.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{dayList.map((e) => <Card key={e.id} e={e} today={today} />)}</div> : <p className="text-muted">Nothing on this day.</p>}
              </div>
            ) : <p className="text-center text-sm text-muted">{list.length} events in {monthLabel(month)}. Pick a day to see them.</p>}
          </div>
        ) : (
          <>
            {groups.map(([m, items]) => (
              <div key={m || 'all'} className="mb-12">
                {m && <h3 className="mb-5 flex items-center gap-4 text-sm font-semibold tracking-[0.16em] text-muted uppercase"><span>{monthLabel(m)}</span><span className="h-px flex-1 bg-line/10" /></h3>}
                <div className={GRID}>{items.map((e) => <Card key={e.id} e={e} today={today} />)}</div>
              </div>
            ))}
            {list.length > limit && <div className="text-center"><button onClick={() => setLimit((l) => l + PAGE)} className="btn-ghost px-8">Show more · {list.length - limit} left</button></div>}
            {!data.error && !list.length && (
              <div className="py-20 text-center">
                <p className="mb-2 text-lg font-semibold">{onlySaved ? 'Your list is empty' : 'Nothing matches that'}</p>
                <p className="mb-6 text-muted">{onlySaved ? 'Tap the heart on any card to save it here.' : 'Try fewer words or clear the filters.'}</p>
                <button className="btn-primary" onClick={reset}>Reset filters</button>
              </div>
            )}
          </>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3 border-t border-line/10 pt-8 text-sm">
          <button onClick={() => copy(feed())} className="btn-ghost">📅 {copied ? 'Feed URL copied' : 'Subscribe to this view'}</button>
          {saved.ids.length > 0 && <button onClick={() => copy(feed(saved.ids))} className="btn-ghost">♥ Subscribe to my list</button>}
          <span className="text-muted">Paste into Google Calendar, Apple Calendar or Outlook. It stays in sync.</span>
        </div>
      </div>
    </section>
  )
}

// ── Search box: suggestions as you type, and the filters it understood ──

function SearchBox({ value, onChange, events, today, chips }: { value: string; onChange: (v: string) => void; events: Ev[]; today: string; chips: Chip[] }) {
  const router = useRouter()
  const [focus, setFocus] = useState(false)
  const [active, setActive] = useState(-1)
  const [example, setExample] = useState(0)
  const hits = useMemo(() => (value.trim() ? search(events, value, today, { from: '0000-01-01', to: '9999-12-31' }).list.sort((a, b) => b.pop - a.pop).slice(0, 6) : []), [events, value, today])
  useEffect(() => setActive(-1), [value])
  useEffect(() => {
    const t = setInterval(() => setExample((n) => (n + 1) % EXAMPLES.length), 3500)
    return () => clearInterval(t)
  }, [])
  const open = (e: Ev) => (e.slug ? router.push(href(e)) : e.url && window.open(e.url, '_blank', 'noopener'))
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(-1, Math.min(hits.length - 1, a + (ev.key === 'ArrowDown' ? 1 : -1)))) }
    else if (ev.key === 'Enter' && hits[active]) open(hits[active])
    else if (ev.key === 'Escape') { if (value) onChange(''); else ev.currentTarget.blur() }
  }

  return (
    <div className="relative">
      <div className="relative">
        <svg className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-4.3-4.3M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
        <input id="search-input" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          role="combobox" aria-expanded={focus && hits.length > 0} aria-controls="search-results" aria-label="Search events" autoComplete="off" placeholder={`Search a game, or try “${EXAMPLES[example]}”`}
          className="h-16 w-full rounded-2xl border border-line/20 bg-bg pr-24 pl-12 text-base shadow-lift outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/20" />
        <div className="absolute top-1/2 right-3 -translate-y-1/2">
          {value ? <button onClick={() => onChange('')} className="rounded-md px-2 py-1 text-sm text-muted hover:text-fg">Clear</button> : <span className="kbd hidden sm:inline-flex">/</span>}
        </div>
      </div>
      {focus && hits.length > 0 && (
        <ul id="search-results" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line/15 bg-surface shadow-lift">
          {hits.map((e, n) => (
            <li key={e.id} role="option" aria-selected={n === active} onMouseDown={(ev) => { ev.preventDefault(); open(e) }} onMouseEnter={() => setActive(n)} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${n === active ? 'bg-surface2' : ''}`}>
              {e.thumb ? <img src={e.thumb} alt="" className={`h-10 w-16 shrink-0 rounded-md bg-surface2 ${e.kind === 'tournament' ? 'object-contain p-1' : 'object-cover'}`} /> : <span className="h-10 w-16 shrink-0 rounded-md bg-surface2" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{e.title}</span>
                <span className="block truncate text-xs text-muted">{range(e.start, e.end)} · {(e.platforms.length ? e.platforms : e.genres).join(', ')}</span>
              </span>
              <span className="chip shrink-0">{e.kind === 'tournament' ? 'Tournament' : 'Release'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex min-h-[30px] flex-wrap items-center gap-2">
        {chips.length ? (
          <>
            <span className="text-xs text-muted">Understood:</span>
            {chips.map((c, n) => <button key={n} onClick={() => onChange(removeChip(value, c))} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">{c.label} <span aria-hidden>×</span></button>)}
          </>
        ) : EXAMPLES.slice(0, 5).map((x) => <button key={x} onClick={() => onChange(x)} className="chip transition hover:border-accent/50 hover:text-fg">{x}</button>)}
      </div>
    </div>
  )
}

// ── Month calendar ──────────────────────────────────────────────────────

function MonthGrid({ month, events, today, selected, onSelect, onMonth }: { month: string; events: Ev[]; today: string; selected?: string; onSelect: (d: string) => void; onMonth: (n: number) => void }) {
  const cells = useMemo(() => {
    const first = toDate(`${month}-01`), start = shift(`${month}-01`, -first.getDay()), last = shift(start, 41), byDay = new Map<string, Ev[]>()
    for (const e of events) for (let d = e.start < start ? start : e.start; d <= (e.end ?? e.start) && d <= last; d = shift(d, 1)) byDay.set(d, [...(byDay.get(d) ?? []), e])
    return Array.from({ length: 42 }, (_, n) => {
      const d = shift(start, n) // each day lists what starts that day first, then the biggest
      return { d, inMonth: d.startsWith(month), list: (byDay.get(d) ?? []).sort((a, b) => +(b.start === d) - +(a.start === d) || b.pop - a.pop) }
    })
  }, [month, events])

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/10 px-4 py-3 sm:px-5">
        <h3 className="text-lg font-bold">{monthLabel(month)}</h3>
        <div className="flex gap-2">
          <button onClick={() => onMonth(-1)} aria-label="Previous month" className="btn-ghost h-9 w-9 p-0">‹</button>
          <button onClick={() => onSelect(today)} className="btn-ghost h-9">Today</button>
          <button onClick={() => onMonth(1)} aria-label="Next month" className="btn-ghost h-9 w-9 p-0">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line/10 text-center text-[11px] font-semibold tracking-wider text-muted uppercase">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => <div key={x} className="py-2">{x}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ d, inMonth, list }, n) => (
          <button key={d} onClick={() => onSelect(d)} aria-label={`${d}: ${list.length} events`} aria-pressed={d === selected}
            className={`relative flex min-h-[64px] flex-col items-stretch gap-1 border-r border-b border-line/[0.07] p-1.5 text-left transition sm:min-h-[118px] sm:p-2 ${n % 7 === 6 ? 'border-r-0' : ''} ${inMonth ? 'hover:bg-surface2' : 'opacity-35'} ${d === selected ? 'bg-accent/10 ring-1 ring-accent ring-inset' : ''}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${d === today ? 'bg-accent text-accent-fg' : 'text-muted'}`}>{Number(d.slice(8))}</span>
            <span className="hidden flex-col gap-1 sm:flex">
              {list.slice(0, 3).map((e) => (
                <span key={e.id} className="flex items-center gap-1.5 truncate rounded-sm bg-surface2 py-0.5 pr-1.5 pl-0.5 text-[11px] font-medium">
                  {e.thumb ? <img src={e.thumb} alt="" loading="lazy" className={`h-4 w-6 shrink-0 rounded-xs ${e.kind === 'tournament' ? 'object-contain' : 'object-cover'}`} /> : <span className="h-4 w-6 shrink-0 rounded-xs bg-line/10" />}
                  <span className="truncate">{e.title}</span>
                </span>
              ))}
              {list.length > 3 && <span className="px-1 text-[11px] font-medium text-accent">+{list.length - 3} more</span>}
            </span>
            {list.length > 0 && <span className="mt-auto flex gap-0.5 sm:hidden">{list.slice(0, 3).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.kind === 'tournament' ? 'bg-fg/70' : 'bg-accent'}`} />)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
