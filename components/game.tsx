'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type Dated, type Ev, type Game, period, range, srcSet } from '@/lib/core'
import { Card, Icon, Section, useSwipe } from './ui'

// The client side of a game page: the description, the trailer, the screenshot viewer and the rail of nearby releases.

const REGION = 'dropdate:region'
/**
 * A game's release dates by region and platform, as IGDB lists them. The site does not know where a visitor is, so it shows them all;
 * a visitor can say which region is theirs (kept in this browser only, for every game): its dates, and worldwide ones, then come first
 * and are marked. The other lines stay as readable as before.
 */
export function Dates({ dates }: { dates: Dated[] }) {
  const [mine, setMine] = useState('')
  useEffect(() => { try { setMine(localStorage.getItem(REGION) ?? '') } catch { /* storage blocked: no region */ } }, [])
  const regions = useMemo(() => [...new Set([...dates.flatMap((d) => d.regions), ...(mine ? [mine] : [])])].filter((r) => r !== 'Worldwide').sort(), [dates, mine])
  const pick = (r: string) => { setMine(r); try { if (r) localStorage.setItem(REGION, r); else localStorage.removeItem(REGION) } catch { /* storage blocked: for this page only */ } }
  const here = (d: Dated) => !!mine && (d.regions.includes(mine) || d.regions.includes('Worldwide'))
  const rows = mine ? [...dates.filter(here), ...dates.filter((d) => !here(d))] : dates
  return (
    <>
      <dl className="-my-1 divide-y divide-line/10">
        {rows.map((d) => (
          <div key={`${d.start}|${d.span ?? d.tba ?? ''}|${d.regions.join()}|${d.platforms.join()}`} className="py-3">
            <dt className="text-[15px] font-semibold">{d.tba ? period(d) : range(d.start)}{here(d) && <span className="tag ml-2 bg-mark align-[2px] text-black">Your region</span>}</dt>
            <dd className="mt-0.5 text-[14px] leading-snug text-muted">{[d.regions.join(', '), d.platforms.join(', ')].filter(Boolean).join(' · ')}</dd>
          </div>
        ))}
      </dl>
      {regions.length > 0 && (
        <label className="mt-4 flex items-center justify-between gap-3 text-[14px] text-muted">Your region
          <span className="relative">
            <select value={mine} onChange={(e) => pick(e.target.value)} className="h-9 appearance-none rounded-full bg-transparent pr-8 pl-3.5 text-sm font-semibold text-fg ring-1 ring-line/15 transition ring-inset hover:ring-line/30">
              <option value="" className="bg-panel text-fg">Not set</option>
              {regions.map((r) => <option key={r} value={r} className="bg-panel text-fg">{r}</option>)}
            </select>
            <Icon name="down" className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          </span>
        </label>
      )}
      <p className="mt-3 text-[13px] text-dim">By region and platform, as IGDB lists them. The calendar goes by the first release.{mine ? ' Your region is kept in this browser only.' : ''}</p>
    </>
  )
}

type Block = { t: 'lead' | 'p' | 'h' | 'ul'; text?: string; items?: string[] }
const BULLET = /^\s*(?:[•·▪●◦*]|-\s)\s*/

function blocks(raw: string): Block[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (/^about( (this|the) game)?:?$/i.test(lines[0] ?? '')) lines.shift() // the section already says "About"
  const out: Block[] = []
  lines.forEach((line, n) => {
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '').trim(), last = out[out.length - 1]
      return last?.t === 'ul' ? last.items?.push(item) : out.push({ t: 'ul', items: [item] })
    }
    const hasLead = out.some((b) => b.t === 'lead')
    const label = /:$/.test(line) || (line.replace(/[^A-Za-z]/g, '').length > 3 && line === line.toUpperCase()) // "Features:" or "KEY FEATURES"
    const title = hasLead && n < lines.length - 1 && !/[.!?,;]$/.test(line) && line.split(' ').length <= 7 // a short unpunctuated line between paragraphs
    out.push(line.length <= 60 && (label || title) ? { t: 'h', text: line.replace(/:$/, '') } : { t: hasLead ? 'p' : 'lead', text: line })
  })
  // long paragraphs read better split at sentence boundaries
  return out.flatMap((b): Block[] => {
    if ((b.t !== 'p' && b.t !== 'lead') || !b.text || b.text.length < 420) return [b]
    const parts: string[] = []
    let cur = ''
    for (const s of b.text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [b.text]) {
      if (cur && cur.length + s.length > 320) { parts.push(cur.trim()); cur = '' }
      cur += s
    }
    if (cur.trim()) parts.push(cur.trim())
    return parts.map((text, k) => ({ t: b.t === 'lead' && k === 0 ? 'lead' : 'p', text }))
  })
}
const sentence = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s) // "KEY FEATURES" reads as "Key features"

export function About({ text, title }: { text: string; title: string }) {
  const all = useMemo(() => blocks(text), [text]), [open, setOpen] = useState(false)
  // the preview is whole blocks: the lead and, if short, the next paragraph. Never a half-cut line.
  let cut = 0, chars = 0
  while (cut < all.length && cut < 3 && (chars < 380 || all[cut - 1]?.t === 'h')) { chars += all[cut].text?.length ?? (all[cut].items?.join('').length ?? 0); cut++ }
  if (all[cut - 1]?.t === 'h') cut--
  const long = all.length > cut && text.length > 700
  return (
    <div className="max-w-[68ch]">
      <div className="space-y-5">
        {(open || !long ? all : all.slice(0, cut)).map((b, n) =>
          b.t === 'lead' ? <p key={n} className="text-[19px] leading-relaxed text-fg md:text-xl">{b.text}</p>
            : b.t === 'h' ? <h3 key={n} className="pt-4 text-[17px] font-semibold text-fg">{sentence(b.text ?? '')}</h3>
              : b.t === 'ul' ? <ul key={n} className="space-y-2.5">{b.items?.map((it, k) => <li key={k} className="flex gap-3 leading-relaxed text-muted"><span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-fg/50" />{it}</li>)}</ul>
                : <p key={n} className="leading-relaxed text-muted">{b.text}</p>)}
      </div>
      {long && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Show less about ${title}` : `Read more about ${title}`} className="btn btn-line mt-6">{open ? 'Show less' : 'Read more'}</button>}
    </div>
  )
}

/**
 * A video file plays as it is; a YouTube trailer loads (from youtube-nocookie) only once play is pressed. Until then the frame shows
 * `poster`, one of the game's own pictures, so the page asks YouTube for nothing, not even a preview picture.
 */
export function Trailer({ trailer, title, poster }: { trailer: NonNullable<Game['trailer']>; title: string; poster?: string }) {
  const [play, setPlay] = useState(false), box = 'aspect-video w-full rounded-panel bg-black'
  if (trailer.src) return <video controls preload="none" poster={trailer.preview} src={trailer.src} className={box} />
  if (!trailer.youtube) return null
  return play
    ? <iframe src={`https://www.youtube-nocookie.com/embed/${trailer.youtube}?autoplay=1&rel=0`} title={`${title} trailer`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className={`${box} border-0`} />
    : (
      <button type="button" onClick={() => setPlay(true)} aria-label={`Play the ${title} trailer`} className={`group relative block overflow-hidden ${box}`}>
        {poster && <img src={poster} srcSet={srcSet(poster)} sizes="(min-width: 1024px) 860px, 100vw" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-85 transition group-hover:opacity-100" />}
        <span className="absolute inset-0 grid place-items-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-black/65 text-white backdrop-blur-md transition group-hover:scale-105"><Icon name="play" className="h-7 w-7" /></span></span>
      </button>
    )
}

export function Gallery({ shots, name }: { shots: string[]; name: string }) {
  const [i, setI] = useState(0), [open, setOpen] = useState(false), closeBtn = useRef<HTMLButtonElement>(null), n = shots.length
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]), swipe = useSwipe(go, 50)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); else if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1) }
    const prev = document.body.style.overflow, opener = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus({ preventScroll: true })
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = prev; opener?.focus({ preventScroll: true }) }
  }, [open, go])
  useEffect(() => { // the active thumbnail is centred inside its strip only: the page itself never scrolls
    if (i === 0 && !open) return
    document.querySelectorAll<HTMLElement>('[data-strip]').forEach((box) => {
      const el = box.querySelector<HTMLElement>('[data-thumb-active="true"]')
      if (el) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: 'smooth' })
    })
  }, [i, open])
  useEffect(() => { if (n > 1) for (const k of [1, -1]) new Image().src = shots[(i + k + n) % n] }, [i, n, shots]) // warm up the neighbours

  const stop = (e: { stopPropagation(): void }) => e.stopPropagation()
  const arrow = 'absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/85'
  const arrows = (wide: boolean) => n > 1 && <>
    <button type="button" onClick={(e) => { stop(e); go(-1) }} aria-label="Previous screenshot" className={`${arrow} left-3${wide ? ' sm:left-6' : ''}`}><Icon name="left" /></button>
    <button type="button" onClick={(e) => { stop(e); go(1) }} aria-label="Next screenshot" className={`${arrow} right-3${wide ? ' sm:right-6' : ''}`}><Icon name="right" /></button>
  </>
  const thumbs = (
    <div data-strip className="no-scrollbar relative flex gap-2 overflow-x-auto p-0.5">
      {shots.map((s, k) => (
        <button key={s} type="button" data-thumb-active={k === i} onClick={() => setI(k)} aria-label={`Screenshot ${k + 1}`} aria-current={k === i ? 'true' : undefined}
          className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-[7px] ring-2 transition sm:h-16 sm:w-28 ${k === i ? 'ring-fg' : 'opacity-55 ring-transparent hover:opacity-100'}`}>
          <img src={s} srcSet={srcSet(s)?.split(', ')[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  )
  const alt = `${name}, screenshot ${i + 1} of ${n}`
  return (
    <>
      <div className="space-y-3">
        <div className="group relative overflow-hidden rounded-panel bg-black" {...swipe}>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open full screen" className="block w-full cursor-zoom-in">
            <img key={shots[i]} src={shots[i]} srcSet={srcSet(shots[i])} sizes="(min-width: 1024px) 860px, 100vw" alt={alt} className="aspect-video w-full object-contain" />
          </button>
          {arrows(false)}
          <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/65 px-2.5 py-1 text-[13px] font-semibold text-white backdrop-blur-md">{i + 1} of {n}</span>
        </div>
        {n > 1 && thumbs}
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${name} screenshots`} className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white" onClick={() => setOpen(false)}>
          <div className="flex items-center justify-between px-4 py-3 text-sm" onClick={stop}>
            <span className="font-semibold">{i + 1} of {n}</span>
            <span className="hidden text-white/55 sm:block">Arrow keys to browse, Esc to close</span>
            <button ref={closeBtn} type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Icon name="close" /></button>
          </div>
          <div className="relative min-h-0 flex-1" {...swipe}>
            <img key={shots[i]} src={shots[i]} alt={alt} onClick={stop} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
            {arrows(true)}
          </div>
          {n > 1 && <div className="px-4 py-3" onClick={stop}>{thumbs}</div>}
        </div>
      )}
    </>
  )
}

export function Rail({ title, lede, items, today }: { title: string; lede?: string; items: Ev[]; today: string }) {
  const row = useRef<HTMLDivElement>(null)
  if (!items.length) return null
  const button = (d: number) => <button type="button" onClick={() => row.current?.scrollBy({ left: d * row.current.clientWidth * 0.85, behavior: 'smooth' })} aria-label={d < 0 ? 'Scroll back' : 'Scroll forward'} className="btn btn-line w-11 px-0"><Icon name={d < 0 ? 'left' : 'right'} /></button>
  return (
    <Section title={title} lede={lede} action={<div className="hidden gap-2 sm:flex">{button(-1)}{button(1)}</div>}>
      <div ref={row} className="no-scrollbar bleed flex snap-x snap-mandatory gap-5 overflow-x-auto">
        {items.map((e) => <div key={e.id} className="w-[250px] shrink-0 snap-start sm:w-[280px]"><Card e={e} today={today} /></div>)}
      </div>
    </Section>
  )
}
