'use client'

import { useMemo } from 'react'
import { type Ev, gap, longDate, monthShort, range, scoreTone, shift, srcSet, status, weekday } from '@/lib/core'
import { Circled, DateBlock, Open, SaveButton, SectionHead, Thumb, fallback, toneText, useExplore, useToday } from './ui'

// The home page under the hero: the week ahead as a wall calendar, the most anticipated games,
// the month's biggest launches and the esports schedule.

const underline = 'decoration-line/40 underline-offset-[3px] group-hover:underline'

/** The next seven days, one column each, today circled. */
export function WeekStrip({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday)
  const explore = useExplore()
  const days = useMemo(() => Array.from({ length: 7 }, (_, k) => {
    const d = shift(today, k)
    return { d, list: items.filter((e) => e.start === d).sort((a, b) => b.pop - a.pop) }
  }), [items, today])
  const total = days.reduce((sum, x) => sum + x.list.length, 0)
  return (
    <section id="week" aria-labelledby="week-title" className="pt-10 pb-14 md:pt-14 md:pb-20">
      <div className="wrap">
        <SectionHead id="week-title" title="This week"
          lede={total ? `${total} ${total === 1 ? 'release or tournament starts' : 'releases and tournaments start'} in the next seven days.` : 'Nothing starts in the next seven days. The full calendar has what comes after.'}
          action={<button type="button" onClick={() => explore({ day: today })} className="btn btn-line">Open the calendar</button>} />
        <ol className="no-scrollbar bleed -my-3 flex snap-x snap-mandatory gap-8 overflow-x-auto py-3 xl:mx-0 xl:grid xl:grid-cols-7 xl:overflow-visible xl:px-0">
          {days.map(({ d, list }) => <Day key={d} d={d} list={list} today={today} onOpen={() => explore({ day: d })} />)}
        </ol>
      </div>
    </section>
  )
}

function Day({ d, list, today, onOpen }: { d: string; list: Ev[]; today: string; onOpen: () => void }) {
  const isToday = d === today, label = isToday ? 'Today' : gap(today, d) === 1 ? 'Tomorrow' : weekday(d, true)
  const [lead, ...rest] = list, more = rest.slice(0, 3), extra = rest.length - more.length
  return ( // columns are ruled like a wall calendar: the line sits in the gap, so every day gets the same width
    <li className="relative flex w-[220px] shrink-0 snap-start flex-col before:absolute before:inset-y-0 before:-left-4 before:w-px before:bg-line/10 first:before:hidden xl:w-auto">
      <button type="button" onClick={onOpen} aria-label={`${label}, ${longDate(d)}: ${list.length} ${list.length === 1 ? 'event' : 'events'}. Open it in the calendar`}
        className="mb-4 flex items-end gap-3 rounded-lg text-left">
        <span className="relative grid h-[58px] min-w-[50px] place-items-center">
          {isToday && <Circled className="-inset-x-3 -inset-y-2" />}
          <span className="display text-[52px] leading-none">{+d.slice(8)}</span>
        </span>
        <span className="pb-1 leading-tight">
          <span className={`block text-[15px] font-semibold ${isToday ? 'text-mark' : ''}`}>{label}</span>
          <span className="block text-[13px] text-muted">{list.length ? `${list.length} ${list.length === 1 ? 'drop' : 'drops'}` : monthShort(d)}</span>
        </span>
      </button>
      {lead ? (
        <Open e={lead} className="group relative block aspect-[16/10] overflow-hidden rounded-art bg-raised">
          {lead.kind === 'tournament' ? <Thumb e={lead} className="absolute inset-0 h-full w-full" />
            : lead.thumb ? <img src={lead.thumb} alt="" loading="lazy" decoding="async" onError={fallback} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /> : null}
          <span className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent" />
          <span className="absolute inset-x-3 bottom-2.5">
            {lead.kind === 'tournament' && <span className="block text-[12px] font-semibold text-arena">Esports</span>}
            <span className="line-clamp-2 text-[14px] leading-tight font-semibold text-white">{lead.title}</span>
          </span>
        </Open>
      ) : (
        <div className="grid aspect-[16/10] place-items-center rounded-art border border-dashed border-line/12 px-4 text-center text-[13px] text-dim">Nothing starts this day</div>
      )}
      {more.length > 0 && (
        <ul className="mt-3">
          {more.map((e) => (
            <li key={e.id}>
              <Open e={e} className="flex items-center gap-2 rounded-md py-1 text-[14px] leading-snug text-muted transition hover:text-fg">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.kind === 'tournament' ? 'bg-arena' : 'bg-line/35'}`} />
                <span className="line-clamp-1">{e.title}</span>
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
  const [lead, ...rest] = items, tiles = rest.slice(0, 4), list = rest.slice(4, 10), full = tiles.length === 4
  return (
    <section id="upcoming" aria-labelledby="upcoming-title" className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap">
        <SectionHead id="upcoming-title" title="Most anticipated" lede="The upcoming games the most players are following." />
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-12">
          <div className={`grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[210px] sm:grid-cols-4 lg:auto-rows-[230px] ${list.length ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <Tile e={lead} today={today} big />
            {tiles.map((e) => <Tile key={e.id} e={e} today={today} className={full ? '' : 'sm:col-span-2'} />)}
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
      </div>
    </section>
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
    <section id="fresh" aria-labelledby="fresh-title" className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap">
        <SectionHead id="fresh-title" title="Just released" lede="The biggest launches of the past 30 days, ranked by how many players follow them." />
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
                  {e.metacritic ? <span title="Metacritic score" className={`tag text-[13px] ${scoreTone(e.metacritic)}`}>{e.metacritic}</span> : null}
                </Open>
                <SaveButton id={e.id} title={e.title} variant="plain" />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

const COLS = 'md:grid-cols-[170px_minmax(0,1fr)_200px_130px]'

/** Esports as a broadcast schedule: what is live, what is next, the game and the prize pool. */
export function Schedule({ items, today: serverToday }: { items: Ev[]; today: string }) {
  const today = useToday(serverToday)
  if (!items.length) return null
  const live = items.filter((e) => status(e, today).tone === 'live').length
  return (
    <section id="esports" aria-labelledby="esports-title" className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap">
        <SectionHead id="esports-title" title="Esports"
          lede={live ? `${live} ${live === 1 ? 'tournament is' : 'tournaments are'} live right now, and the biggest ones coming up.` : 'The biggest tournaments coming up, with their prize pools.'} />
        <div className="overflow-hidden rounded-panel bg-panel">
          <div className={`hidden gap-6 border-b border-line/10 px-6 py-3 text-[13px] font-medium text-dim md:grid ${COLS}`}><span>When</span><span>Tournament</span><span>Game</span><span className="text-right">Prize pool</span></div>
          <ul className="divide-y divide-line/[0.07]">
            {items.map((e) => {
              const s = status(e, today), on = s.tone === 'live'
              const when = (
                <span className={`inline-flex items-center gap-2 font-semibold ${on ? 'text-live' : toneText(e, s.tone) === 'text-muted' ? 'text-fg' : toneText(e, s.tone)}`}>
                  {on && <span className="h-2 w-2 animate-pulse rounded-full bg-live" />}{s.label}
                </span>
              )
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
      </div>
    </section>
  )
}
