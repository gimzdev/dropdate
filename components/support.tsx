'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { PATREON } from '@/lib/core'
import { Heart, Icon } from './icons'

// A quiet note asking for support on Patreon, where Dropdate has just been useful: between the home page's sections, in a
// game's side column, on the profile. "Not now" hides every note on this device for four months; the header link stays.

const KEY = 'dropdate:support-hidden', QUIET = 120 * 864e5

export function SupportNote({ children, className = '', small = false }: { children: ReactNode; className?: string; small?: boolean }) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try { const at = Number(localStorage.getItem(KEY)); if (at && Date.now() - at < QUIET) setHidden(true) } catch { /* storage blocked: the note stays */ }
  }, [])
  if (hidden) return null
  const hide = () => {
    setHidden(true)
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* storage blocked: hidden until the next visit */ }
  }
  return (
    <div className={className}>
      <aside aria-label="Support Dropdate" className={`flex items-start gap-3 rounded-panel border border-dashed border-line/15 text-muted ${small ? 'p-4 text-[14px]' : 'px-5 py-4 text-[15px] md:px-6'}`}>
        <span className="mt-[3px] shrink-0 text-mark"><Heart on className="h-4 w-4" /></span>
        <p className="min-w-0 flex-1 leading-relaxed text-pretty">
          {children}{' '}
          <a href={PATREON} target="_blank" rel="noopener noreferrer" className="font-semibold whitespace-nowrap text-fg underline decoration-mark/50 underline-offset-4 transition hover:decoration-mark">Support on Patreon</a>
        </p>
        <button type="button" onClick={hide} title="Not now" aria-label="Hide this note" className="-mt-1 -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-dim transition hover:bg-raised hover:text-fg"><Icon name="close" className="h-3.5 w-3.5" /></button>
      </aside>
    </div>
  )
}
