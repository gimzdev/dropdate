'use client'

import { useRouter } from 'next/navigation'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { type Chip, type Ev, type Kind, type Payload, type Platform, PLATFORMS, href, iso, longDate, monthLabel, range, removeChip, search, shift, toDate } from '@/lib/core'
import { Card, Circled, EXPLORE_EVENT, type ExploreIntent, Heart, Icon, SectionHead, Thumb, Updated, useSaved } from './ui'

const PAGE = 16
const SORTS = { date: 'Soonest first', hype: 'Most anticipated', score: 'Best reviewed' }
type Sort = keyof typeof SORTS
const EXAMPLES = ['ps5 games next month', 'esports this weekend', 'switch in december', 'xbox shooters in q4']
const KINDS: Record<Kind | 'all', string> = { all: 'releases and tournaments', release: 'releases', tournament: 'tournaments' }
const score = (e: Ev) => e.metacritic ?? (e.rating ?? 0) * 20
const GRID = 'grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-3 xl:grid-cols-4'
const DAY = /^\d{4}-\d{2}-\d{2}$/
const webcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://')

function Segment<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-full p-1 ring-1 ring-line/12 ring-inset">
      {items.map(([id, text]) => (
        <button key={id} type="button" onClick={() => onChange(id)} aria-pressed={value === id}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition ${value === id ? 'bg-fg text-black' : 'text-muted hover:text-fg'}`}>{text}</button>
      ))}
    </div>
  )
}

function Select<T extends string>({ label, value, onChange, options, on, className = '' }: { label: string; value: T; onChange: (v: T) => void; options: string[][]; on: boolean; className?: string }) {
  return (
    <span className="relative shrink-0">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
        className={`h-10 appearance-none truncate rounded-full bg-transparent pr-9 pl-4 text-sm font-semibold ring-1 transition ring-inset hover:ring-line/30 ${on ? 'text-fg ring-fg' : 'text-muted ring-line/12'} ${className}`}>
        {options.map(([v, text = v]) => <option key={v} value={v} className="bg-panel text-fg">{text}</option>)}
      </select>
      <Icon name="down" className="pointer-events-none absolute top-1/2 right-3.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </span>
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
  const [copied, setCopied] = useState('')
  const [origin, setOrigin] = useState('')

  useEffect(() => { // the page can be an hour old: use the visitor's own today, then ?q= and whatever the header or the week asked for
    const apply = ({ list, day: d }: ExploreIntent) => {
      if (list) { setOnlySaved(true); setView('grid') }
      if (d && DAY.test(d)) { setView('calendar'); setMonth(d.slice(0, 7)); setDay(d) }
    }
    const t = iso(new Date()), p = new URLSearchParams(location.search)
    setToday(t)
    setMonth(t.slice(0, 7))
    setOrigin(location.origin)
    setQ(p.get('q') ?? '')
    apply({ list: p.has('list'), day: p.get('day') ?? undefined })
    if (p.has('focus')) setTimeout(() => document.getElementById('search-input')?.focus(), 300)
    setReady(true)
    const on = (ev: Event) => apply((ev as CustomEvent<ExploreIntent>).detail ?? {})
    addEventListener(EXPLORE_EVENT, on)
    return () => removeEventListener(EXPLORE_EVENT, on)
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
  const hasTournaments = useMemo(() => data.events.some((e) => e.kind === 'tournament'), [data.events])

  const { list, parsed } = useMemo(() => {
    const span = view === 'calendar' ? { from: `${month}-01`, to: shift(`${month}-01`, new Date(+month.slice(0, 4), +month.slice(5), 0).getDate() - 1) } : {}
    const r = search(data.events, q, today, { kind, platform, genre, ...span })
    let l = r.list
    // just browsing: tournaments already under way are in the esports schedule, so the grid starts with what's next
    if (view === 'grid' && kind === 'all' && !q.trim() && !onlySaved) l = l.filter((e) => e.kind === 'release' || e.start >= today)
    if (onlySaved) l = l.filter((e) => saved.has(e.id))
    if (view === 'grid' && sort !== 'date') l = [...l].sort((a, b) => (sort === 'hype' ? b.pop - a.pop : score(b) - score(a)))
    return { list: l, parsed: r.parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.events, q, today, kind, platform, genre, sort, view, onlySaved, saved.ids, month])

  const groups = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of list.slice(0, limit)) {
      const k = sort === 'date' ? e.start.slice(0, 7) : '', g = m.get(k)
      if (g) g.push(e)
      else m.set(k, [e])
    }
    return [...m]
  }, [list, limit, sort])
  const perMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of list) m.set(e.start.slice(0, 7), (m.get(e.start.slice(0, 7)) ?? 0) + 1)
    return m
  }, [list])

  const dayList = day ? list.filter((e) => e.start <= day && (e.end ?? e.start) >= day) : []
  const filtered = !!q.trim() || kind !== 'all' || platform !== 'all' || genre !== 'all' || onlySaved
  const moveMonth = (n: number) => { setMonth(iso(new Date(+month.slice(0, 4), +month.slice(5) - 1 + n, 1)).slice(0, 7)); setDay(undefined) }
  const reset = () => { setQ(''); setKind('all'); setPlatform('all'); setGenre('all'); setOnlySaved(false) }

  // The calendar feed follows what is on screen, or the saved list
  const mine = onlySaved && saved.ids.length > 0
  const params = new URLSearchParams(Object.entries(mine ? { ids: saved.ids.join(',') } : { q: q.trim(), type: kind, platform, genre }).filter(([, v]) => v && v !== 'all')).toString()
  const feed = origin ? `${origin}/api/calendar.ics${params ? `?${params}` : ''}` : ''
  const describe = mine ? 'everything on your list' : `upcoming ${platform !== 'all' ? `${platform} ` : ''}${KINDS[kind]}${genre !== 'all' ? ` in ${genre}` : ''}${q.trim() ? ` matching “${q.trim()}”` : ''}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(feed) } catch { prompt('Calendar feed link', feed) }
    setCopied(feed)
    setTimeout(() => setCopied(''), 2200)
  }

  return (
    <section id="explore" aria-labelledby="explore-title" className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap">
        <SectionHead id="explore-title" title="Search the calendar"
          lede={<>Type a game, a platform or a date. Plain English works, like <q>switch games in december</q> or <q>esports this weekend</q>.</>}
          action={<p className="inline-flex items-center gap-2 text-sm text-muted"><span className="h-2 w-2 rounded-full bg-go" />Live data, updated <Updated at={data.updated} /></p>} />

        {data.error && <div role="alert" className="mb-6 rounded-[14px] bg-live/10 p-4 text-[15px] text-[#ffb7be] ring-1 ring-live/30 ring-inset"><strong className="font-semibold">Live data is unavailable.</strong> {data.error} Check the API keys in your environment, then redeploy.</div>}
        {data.stale && !data.error && <div role="status" className="mb-6 rounded-[14px] bg-mark/10 p-3.5 text-[15px] text-[#ffe8a3] ring-1 ring-mark/25 ring-inset">The data sources did not answer just now, so this is the last good data. It refreshes on its own.</div>}

        <SearchBox value={q} onChange={setQ} events={data.events} today={today} chips={parsed.chips} text={parsed.text} />

        <div className="sticky top-[65px] z-30 -mx-4 mt-8 border-y lg:top-[76px] border-line/10 bg-black/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-full lg:border lg:px-2.5 lg:py-2">
          <div className="flex items-center gap-3">
            <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] xl:[mask-image:none]">
              <Segment label="Show" value={kind} onChange={setKind} items={[['all', 'All'], ['release', 'Games'], ...(hasTournaments ? [['tournament', 'Esports'] as [Kind, ReactNode]] : [])]} />
              <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line/12" />
              <div role="group" aria-label="Platform" className="flex shrink-0 gap-1.5">
                {PLATFORMS.map((p) => <button key={p} type="button" onClick={() => setPlatform(platform === p ? 'all' : p)} aria-pressed={platform === p} className="pill">{p}</button>)}
              </div>
              <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-line/12" />
              <Select label="Genre" value={genre} onChange={setGenre} options={[['all', 'All genres'], ...genres]} on={genre !== 'all'} className="w-[150px]" />
              <button type="button" onClick={() => setOnlySaved(!onlySaved)} aria-pressed={onlySaved} className="pill">
                <Heart on={onlySaved} className="h-4 w-4" />My list{saved.ids.length ? <span className="opacity-70">{saved.ids.length}</span> : null}
              </button>
            </div>
            <Segment label="View" value={view} onChange={setView}
              items={[['grid', <><Icon name="grid" /><span className="sr-only sm:not-sr-only">Grid</span></>], ['calendar', <><Icon name="calendar" /><span className="sr-only sm:not-sr-only">Month</span></>]]} />
          </div>
        </div>

        <div className="mt-6 mb-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <p aria-live="polite" className="text-[15px] text-muted">
            <span className="font-semibold text-fg">{list.length.toLocaleString('en-US')}</span> {list.length === 1 ? 'result' : 'results'}{view === 'calendar' ? ` in ${monthLabel(month)}` : ''}
          </p>
          {filtered && <button type="button" onClick={reset} className="text-[15px] font-semibold underline decoration-line/30 underline-offset-4 transition hover:decoration-mark">Clear filters</button>}
          {view === 'grid' && <span className="ml-auto"><Select label="Sort by" value={sort} onChange={setSort} options={Object.entries(SORTS)} on={sort !== 'date'} /></span>}
        </div>

        {view === 'calendar' ? (
          <div>
            <MonthGrid month={month} events={list} today={today} selected={day} onSelect={(d) => { setDay(d); setMonth(d.slice(0, 7)) }} onMonth={moveMonth} />
            <div className="mt-10">
              {day ? (
                <>
                  <h3 className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="display text-[34px]">{longDate(day)}</span>
                    <span className="text-[15px] text-muted">{dayList.length} {dayList.length === 1 ? 'event' : 'events'}</span>
                  </h3>
                  {dayList.length ? <div className={GRID}>{dayList.map((e) => <Card key={e.id} e={e} today={today} row />)}</div>
                    : <p className="rounded-panel border border-dashed border-line/12 px-6 py-12 text-center text-muted">Nothing on this day. Pick another one in the calendar above.</p>}
                </>
              ) : <p className="text-center text-[15px] text-muted">Pick a day to see everything on it.</p>}
            </div>
          </div>
        ) : (
          <>
            {groups.map(([m, items]) => (
              <div key={m || 'all'} className="mb-14 last:mb-0">
                {m && (
                  <h3 className="mb-6 flex items-baseline gap-3 border-b border-line/10 pb-3">
                    <span className="display text-[34px]">{monthLabel(m)}</span>
                    <span className="text-[15px] text-muted">{perMonth.get(m)} {perMonth.get(m) === 1 ? 'event' : 'events'}</span>
                  </h3>
                )}
                <div className={GRID}>{items.map((e) => <Card key={e.id} e={e} today={today} row />)}</div>
              </div>
            ))}
            {list.length > limit && (
              <div className="mt-12 text-center">
                <button type="button" onClick={() => setLimit((l) => l + PAGE * 2)} className="btn btn-line px-7">Show more<span className="text-muted">{list.length - limit} left</span></button>
              </div>
            )}
            {!data.error && !list.length && (
              <div className="rounded-panel border border-dashed border-line/12 px-6 py-16 text-center">
                <p className="text-lg font-semibold">{onlySaved ? 'Nothing saved yet' : 'No matches'}</p>
                <p className="mx-auto mt-2 max-w-sm text-muted">{onlySaved ? 'Tap the heart on any game or tournament to keep it here. Then add your whole list to your calendar in one go.' : 'Try fewer words, another month, or clear the filters.'}</p>
                <button type="button" className="btn btn-mark mt-7" onClick={reset}>{onlySaved ? 'Browse the calendar' : 'Clear filters'}</button>
              </div>
            )}
          </>
        )}

        <div className="mt-16 grid grid-cols-1 gap-6 rounded-panel bg-panel p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
          <div className="flex gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-mark text-black"><Icon name="calendar" className="h-6 w-6" /></span>
            <div>
              <h3 className="text-lg font-semibold">Add {mine ? 'your list' : 'this view'} to your calendar</h3>
              <p className="mt-1 max-w-xl text-[15px] text-muted">A live feed of {describe}. When a date moves, your calendar follows.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={feed ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(feed))}` : undefined} target="_blank" rel="noopener noreferrer" className="btn btn-mark">Google Calendar</a>
            <a href={feed ? webcal(feed) : undefined} className="btn btn-line">Apple or Outlook</a>
            <button type="button" onClick={copy} disabled={!feed} className="btn btn-line"><Icon name={copied && copied === feed ? 'check' : 'copy'} />{copied && copied === feed ? 'Link copied' : 'Copy link'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Search box: suggestions as you type, and the filters it understood ──

function SearchBox({ value, onChange, events, today, chips, text }: { value: string; onChange: (v: string) => void; events: Ev[]; today: string; chips: Chip[]; text: string }) {
  const router = useRouter()
  const [focus, setFocus] = useState(false)
  const [active, setActive] = useState(-1)
  // Suggestions only when part of the query names a game: a pure filter ("ps5 next month") is answered by the grid, and its chips stay in view
  const local = useMemo(() => (text.trim() ? search(events, value, today, { from: '0000-01-01', to: '9999-12-31' }).list.sort((a, b) => b.pop - a.pop).slice(0, 6) : []), [events, value, today, text])
  // The calendar only holds what is out recently or coming, so titles it lacks (older and long-running games) are looked up by name
  const [found, setFound] = useState<Ev[]>([])
  useEffect(() => {
    const q = text.trim()
    if (q.length < 3 || local.length >= 6) { setFound([]); return }
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
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => Math.max(-1, Math.min(hits.length - 1, a + (ev.key === 'ArrowDown' ? 1 : -1)))) }
    else if (ev.key === 'Enter' && hits[active]) open(hits[active])
    else if (ev.key === 'Escape') { if (value) onChange(''); else ev.currentTarget.blur() }
  }
  const expanded = focus && hits.length > 0

  return (
    <div className="max-w-3xl">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-muted" />
        <input id="search-input" value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
          role="combobox" aria-expanded={expanded} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={expanded && active >= 0 ? `hit-${hits[active].id}` : undefined}
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
          </ul>
        )}
      </div>
      <div className="mt-4 flex min-h-8 flex-wrap items-center gap-2">
        {chips.length ? (
          <>
            <span className="text-sm text-muted">Searching for</span>
            {chips.map((c, n) => (
              <button key={n} type="button" onClick={() => onChange(removeChip(value, c))} aria-label={`Remove ${c.label}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 text-sm font-semibold text-black transition hover:bg-white">
                {c.label}<Icon name="close" className="h-3 w-3" />
              </button>
            ))}
          </>
        ) : (
          <>
            <span className="text-sm text-muted">Try</span>
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => onChange(x)} className="h-8 rounded-full px-3 text-sm text-fg ring-1 ring-line/12 transition ring-inset hover:ring-line/30">{x}</button>)}
          </>
        )}
      </div>
    </div>
  )
}

// ── Month view ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function MonthGrid({ month, events, today, selected, onSelect, onMonth }: { month: string; events: Ev[]; today: string; selected?: string; onSelect: (d: string) => void; onMonth: (n: number) => void }) {
  const cells = useMemo(() => {
    const first = toDate(`${month}-01`), days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const count = Math.ceil((first.getDay() + days) / 7) * 7, start = shift(`${month}-01`, -first.getDay()), last = shift(start, count - 1), byDay = new Map<string, Ev[]>()
    for (const e of events) for (let d = e.start < start ? start : e.start; d <= (e.end ?? e.start) && d <= last; d = shift(d, 1)) byDay.set(d, [...(byDay.get(d) ?? []), e])
    return Array.from({ length: count }, (_, n) => {
      const d = shift(start, n) // each day lists what starts that day first, then the biggest
      return { d, inMonth: d.startsWith(month), list: (byDay.get(d) ?? []).sort((a, b) => +(b.start === d) - +(a.start === d) || b.pop - a.pop) }
    })
  }, [month, events])

  return (
    <div className="overflow-hidden rounded-panel bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <h3 className="display text-[34px]">{monthLabel(month)}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onMonth(-1)} aria-label="Previous month" className="btn btn-sm btn-line w-9 px-0"><Icon name="left" /></button>
          <button type="button" onClick={() => onSelect(today)} className="btn btn-sm btn-line">Today</button>
          <button type="button" onClick={() => onMonth(1)} aria-label="Next month" className="btn btn-sm btn-line w-9 px-0"><Icon name="right" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-y border-line/10 text-[13px] font-medium text-dim">
        {WEEKDAYS.map((x) => <div key={x} className="px-2 py-2.5 text-center sm:px-3 sm:text-left"><span className="sm:hidden">{x[0]}</span><span className="hidden sm:inline">{x}</span></div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ d, inMonth, list }, n) => {
          const isToday = d === today, isSel = d === selected
          return (
            <button key={d} type="button" onClick={() => onSelect(d)} aria-pressed={isSel} aria-label={`${longDate(d)}: ${list.length ? `${list.length} ${list.length === 1 ? 'event' : 'events'}` : 'nothing scheduled'}`}
              className={`relative flex min-h-[64px] flex-col items-stretch gap-1 border-line/[0.07] p-1.5 text-left transition sm:min-h-[118px] sm:p-2 ${n % 7 ? 'border-l' : ''} ${n >= 7 ? 'border-t' : ''} ${isSel ? 'bg-raised ring-2 ring-fg ring-inset' : inMonth ? 'hover:bg-raised/60' : 'bg-black/35'}`}>
              <span className={`relative grid h-7 w-7 place-items-center text-[13px] font-semibold ${isToday ? 'text-mark' : inMonth ? 'text-fg' : 'text-dim'}`}>
                {isToday && <Circled className="-inset-1.5" />}
                {+d.slice(8)}
              </span>
              <span className="hidden flex-col gap-1 sm:flex">
                {list.slice(0, 3).map((e) => (
                  <span key={e.id} className={`truncate rounded-[5px] px-1.5 py-0.5 text-[12px] leading-[1.35] font-medium ${e.kind === 'tournament' ? 'bg-arena/12 text-arena' : 'bg-white/[0.07] text-fg/90'} ${inMonth ? '' : 'opacity-50'}`}>{e.title}</span>
                ))}
                {list.length > 3 && <span className="px-1.5 text-[12px] font-semibold text-muted">{list.length - 3} more</span>}
              </span>
              {list.length > 0 && <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">{list.slice(0, 4).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.kind === 'tournament' ? 'bg-arena' : 'bg-fg/60'}`} />)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
