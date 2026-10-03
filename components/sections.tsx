'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Ev, gap, href, range, scoreTone, srcSet, status, toDate } from '@/lib/core'
import { SaveButton, fallback } from './ui'

// The home page below the hero: a headline bento with an agenda, a ranked list, and an esports schedule.

const month = (s: string) => toDate(s).toLocaleDateString('en-US', { month: 'short' })
const Open = ({ e, className, children }: { e: Ev; className: string; children: ReactNode }) =>
  e.slug ? <Link href={href(e)} className={className}>{children}</Link> : <a href={e.url ?? '#'} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
const Head = ({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) => (
  <div className="mb-6 flex items-end justify-between gap-4 border-t border-line/15 pt-5 md:mb-8">
    <div><p className="eyebrow mb-1.5">{eyebrow}</p><h2 className="h2">{title}</h2></div>
    {note && <p className="hidden text-sm text-muted sm:block">{note}</p>}
  </div>
)
const Thumb = ({ e, className }: { e: Ev; className: string }) =>
  e.thumb ? <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className={className} /> : <span className={`${className} bg-surface2`} />
const DateBlock = ({ start, className = '' }: { start: string; className?: string }) => (
  <span className={`block text-center leading-none ${className}`}>
    <span className="block text-[10px] font-semibold tracking-wider uppercase opacity-70">{month(start)}</span>
    <span className="block text-xl font-extrabold tabular-nums">{+start.slice(8)}</span>
  </span>
)

function Tile({ e, today, big, className = '' }: { e: Ev; today: string; big?: boolean; className?: string }) {
  const src = big ? (e.image ?? e.thumb) : e.thumb
  return (
    <article className={`group relative overflow-hidden rounded-xl bg-surface2 text-white ring-1 ring-line/10 transition duration-300 hover:-translate-y-1 hover:shadow-glow hover:ring-white/50 ${big ? 'col-span-2 row-span-2' : ''} ${className}`}>
      <Open e={e} className="block h-full">
        {src && <img src={src} srcSet={big ? srcSet(e.image) : undefined} sizes="(min-width: 1024px) 440px, (min-width: 640px) 45vw, 100vw" alt={e.title} loading="lazy" decoding="async" onError={fallback} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
        <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/10 to-black/30" />
        <DateBlock start={e.start} className="absolute top-3 left-3 rounded-lg bg-black/55 px-2.5 py-1.5 backdrop-blur-md" />
        {e.metacritic ? <span className={`absolute top-3 right-3 rounded-md px-1.5 py-1 text-[11px] font-bold ${scoreTone(e.metacritic)}`}>{e.metacritic}</span> : null}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="mb-0.5 text-[11px] font-semibold text-white/70">{status(e, today).label}</p>
            <h3 className={`line-clamp-2 leading-tight font-bold ${big ? 'text-2xl md:text-3xl' : 'text-sm'}`}>{e.title}</h3>
            {big && <p className="mt-1.5 text-sm text-white/70">{[...e.genres.slice(0, 2), ...e.platforms].join(' · ')}</p>}
          </div>
          <SaveButton id={e.id} />
        </div>
      </Open>
    </article>
  )
}

/** The next two weeks: five headliners as artwork tiles, then the rest as a dated agenda. */
export function Radar({ items, total, today }: { items: Ev[]; total: number; today: string }) {
  if (!items.length) return null
  const top = [items[0], ...items.slice(1, 5).sort((a, b) => a.start.localeCompare(b.start))], bento = top.length === 5, rest = items.slice(5).sort((a, b) => a.start.localeCompare(b.start))
  return (
    <section className="py-12 md:py-16">
      <div className="wrap">
        <Head eyebrow="This fortnight" title="Coming up" note={`${total} ${total === 1 ? 'release' : 'releases'} in the next two weeks`} />
        <div className="grid gap-4 lg:grid-cols-12">
          <div className={`grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[190px] sm:grid-cols-4 sm:gap-4 lg:auto-rows-[235px] ${rest.length ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            {top.map((e, n) => <Tile key={e.id} e={e} today={today} big={bento && n === 0} className={bento ? '' : 'sm:col-span-2'} />)}
          </div>
          {rest.length > 0 && (
            <aside className="card flex flex-col overflow-hidden lg:col-span-4">
              <div className="flex items-center justify-between border-b border-line/10 px-5 py-4"><h3 className="text-sm font-semibold">Also on the calendar</h3><span className="text-xs text-muted">{rest.length} more</span></div>
              <ul className="flex-1 divide-y divide-line/10">
                {rest.map((e, n) => (
                  <li key={e.id}>
                    <Open e={e} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface2">
                      <span className="w-10 shrink-0">{(!n || rest[n - 1].start !== e.start) && <DateBlock start={e.start} />}</span>
                      <Thumb e={e} className="h-11 w-[70px] shrink-0 rounded-md object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold transition group-hover:text-accent">{e.title}</span>
                        <span className="block truncate text-xs text-muted">{(e.platforms.length ? e.platforms : e.genres).join(', ')}</span>
                      </span>
                      <SaveButton id={e.id} />
                    </Open>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
    </section>
  )
}

/** The biggest launches of the last month, ranked. */
export function Fresh({ items, today }: { items: Ev[]; today: string }) {
  const list = items.slice(0, 10)
  if (!list.length) return null
  return (
    <section className="border-y border-line/10 bg-surface/40 py-12 md:py-16">
      <div className="wrap">
        <Head eyebrow="Fresh drops" title="Just released" note="The biggest launches of the last 30 days" />
        <ol className="grid grid-cols-1 gap-x-12 md:grid-flow-col md:grid-cols-2 md:grid-rows-5">
          {list.map((e, n) => {
            const ago = gap(e.start, today)
            return (
              <li key={e.id} className={n % 5 ? 'border-t border-line/10' : ''}>
                <Open e={e} className="group flex items-center gap-4 py-3">
                  <span className="w-9 shrink-0 text-center text-3xl font-extrabold text-transparent tabular-nums transition [-webkit-text-stroke:1.5px_rgb(var(--muted)/0.55)] group-hover:[-webkit-text-stroke-color:rgb(var(--accent))]">{n + 1}</span>
                  <Thumb e={e} className="h-[60px] w-[104px] shrink-0 rounded-lg object-cover ring-1 ring-line/10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold transition group-hover:text-accent">{e.title}</span>
                    <span className="block truncate text-sm text-muted">{ago < 1 ? 'Out today' : ago === 1 ? 'Yesterday' : `${ago} days ago`} · {(e.genres.length ? e.genres.slice(0, 2) : e.platforms).join(', ')}</span>
                  </span>
                  {e.metacritic ? <span className={`rounded-md px-2 py-1 text-sm font-bold ${scoreTone(e.metacritic)}`}>{e.metacritic}</span>
                    : e.rating ? <span className="rounded-md bg-surface2 px-2 py-1 text-sm font-bold text-muted">{e.rating.toFixed(1)}</span> : null}
                  <SaveButton id={e.id} />
                </Open>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** A slow marquee of what is trending, right under the hero. */
export function Ticker({ items, today }: { items: Ev[]; today: string }) {
  if (items.length < 4) return null
  const row = (k: string) => items.map((e) => (
    <Open key={k + e.id} e={e} className="flex shrink-0 items-center gap-3 px-6 font-mono text-xs font-medium tracking-wide whitespace-nowrap uppercase transition hover:text-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${e.kind === 'tournament' ? 'bg-accent2' : 'bg-fg/40'}`} />
      {e.title}
      <span className="font-normal text-muted">{status(e, today).label}</span>
    </Open>
  ))
  return (
    <div aria-label="Trending now" className="group overflow-hidden border-y border-line/10 bg-surface py-3.5">
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">{row('a')}{row('b')}</div>
    </div>
  )
}

const COLS = 'md:grid-cols-[120px_minmax(0,1fr)_170px_190px_90px]'

/** Esports as a schedule: what is live, what is next, the game and the prize. */
export function Schedule({ items, today }: { items: Ev[]; today: string }) {
  if (!items.length) return null
  const live = items.filter((e) => e.start <= today).length
  return (
    <section className="py-12 md:py-16">
      <div className="wrap">
        <Head eyebrow="Esports" title="Tournaments" note={live ? `${live} live now` : 'The biggest events coming up'} />
        <div className="card overflow-hidden">
          <div className={`hidden gap-4 border-b border-line/10 px-5 py-3 text-[11px] font-semibold tracking-wider text-muted uppercase md:grid ${COLS}`}><span>Status</span><span>Tournament</span><span>Game</span><span>Dates</span><span className="text-right">Prize</span></div>
          <ul className="divide-y divide-line/10">
            {items.map((e) => {
              const s = status(e, today), on = s.tone === 'live'
              return (
                <li key={e.id}>
                  <Open e={e} className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3.5 transition hover:bg-surface2 md:px-5 ${COLS}`}>
                    <span className={`order-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold md:order-none ${on ? 'bg-rose-500 text-white' : 'border border-line/15 text-muted'}`}>
                      {on && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}{s.label}
                    </span>
                    <span className="order-1 flex min-w-0 items-center gap-3 md:order-none">
                      <span className="dots grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface2 ring-1 ring-line/15">
                        {e.thumb && <img src={e.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className="h-full w-full object-contain p-1.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold transition group-hover:text-accent">{e.title}</span>
                        <span className="block truncate text-xs text-muted md:hidden">{[e.genres[0], range(e.start, e.end)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    <span className="hidden truncate text-sm text-muted md:block">{e.genres[0]}</span>
                    <span className="hidden text-sm text-muted md:block">{range(e.start, e.end)}</span>
                    <span className="hidden text-right text-sm font-semibold md:block">{e.prize ?? <span className="font-normal text-muted">·</span>}</span>
                  </Open>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
