'use client'

import { type TouchEvent, useCallback, useEffect, useRef, useState } from 'react'
import { srcSet } from '@/lib/core'
import { Icon } from './ui'

// Screenshot viewer: a big image with arrows and thumbnails, and a full-screen lightbox (keyboard, swipe, counter).
export function Gallery({ shots, name }: { shots: string[]; name: string }) {
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(false)
  const touch = useRef<number | null>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const n = shots.length
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    const prev = document.body.style.overflow, opener = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus({ preventScroll: true })
    addEventListener('keydown', onKey)
    return () => { removeEventListener('keydown', onKey); document.body.style.overflow = prev; opener?.focus({ preventScroll: true }) }
  }, [open, go])

  useEffect(() => { // keep the active thumbnail centred inside its strip only: never scroll the page itself
    if (i === 0 && !open) return
    document.querySelectorAll<HTMLElement>('[data-strip]').forEach((box) => {
      const el = box.querySelector<HTMLElement>('[data-thumb-active="true"]')
      if (el) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: 'smooth' })
    })
  }, [i, open])

  useEffect(() => { // warm up the neighbours
    if (n < 2) return
    for (const k of [1, -1]) { const img = new Image(); img.src = shots[(i + k + n) % n] }
  }, [i, n, shots])

  const swipe = {
    onTouchStart: (e: TouchEvent) => { touch.current = e.touches[0].clientX },
    onTouchEnd: (e: TouchEvent) => {
      if (touch.current === null) return
      const dx = e.changedTouches[0].clientX - touch.current
      touch.current = null
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
    },
  }
  const arrow = 'absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur-md transition hover:bg-black/85'
  const thumbs = () => (
    <div data-strip className="no-scrollbar relative flex gap-2 overflow-x-auto p-0.5">
      {shots.map((s, k) => (
        <button key={s} type="button" data-thumb-active={k === i} onClick={() => setI(k)} aria-label={`Screenshot ${k + 1}`} aria-current={k === i ? 'true' : undefined}
          className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-[7px] ring-2 transition sm:h-16 sm:w-28 ${k === i ? 'ring-fg' : 'opacity-55 ring-transparent hover:opacity-100'}`}>
          <img src={s} srcSet={srcSet(s)?.split(', ')[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="space-y-3">
        <div className="group relative overflow-hidden rounded-panel bg-black" {...swipe}>
          <button type="button" onClick={() => setOpen(true)} aria-label="Open full screen" className="block w-full cursor-zoom-in">
            <img key={shots[i]} src={shots[i]} srcSet={srcSet(shots[i])} sizes="(min-width: 1024px) 860px, 100vw" alt={`${name}, screenshot ${i + 1} of ${n}`} className="aspect-video w-full object-contain" />
          </button>
          {n > 1 && <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous screenshot" className={`${arrow} left-3`}><Icon name="left" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next screenshot" className={`${arrow} right-3`}><Icon name="right" /></button>
          </>}
          <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/65 px-2.5 py-1 text-[13px] font-semibold text-white backdrop-blur-md">{i + 1} of {n}</span>
        </div>
        {n > 1 && thumbs()}
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={`${name} screenshots`} className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white" onClick={() => setOpen(false)}>
          <div className="flex items-center justify-between px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
            <span className="font-semibold">{i + 1} of {n}</span>
            <span className="hidden text-white/55 sm:block">Arrow keys to browse, Esc to close</span>
            <button ref={closeBtn} type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><Icon name="close" /></button>
          </div>
          <div className="relative min-h-0 flex-1" {...swipe}>
            <img key={shots[i]} src={shots[i]} alt={`${name}, screenshot ${i + 1} of ${n}`} onClick={(e) => e.stopPropagation()} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
            {n > 1 && <>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="Previous screenshot" className={`${arrow} left-3 sm:left-6`}><Icon name="left" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="Next screenshot" className={`${arrow} right-3 sm:right-6`}><Icon name="right" /></button>
            </>}
          </div>
          {n > 1 && <div className="px-4 py-3" onClick={(e) => e.stopPropagation()}>{thumbs()}</div>}
        </div>
      )}
    </>
  )
}
