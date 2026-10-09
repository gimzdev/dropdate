'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { dismiss, ready, setList, signOut, signedInNow, useAccount, useNotice } from '@/lib/account'
import { Icon } from './icons'

// What the browser shows of an account: the header control, the Played and Completed buttons of a game, and the short messages.

const signInHref = (path: string) => (path.startsWith('/signin') ? '/signin' : `/signin?next=${encodeURIComponent(path)}`)

/**
 * Sign in, or the account menu. Before the browser knows who is there, both a "Sign in" link and a placeholder are in the page and
 * the stylesheet shows the right one (the page head marks signed-in browsers before the first paint), so nothing flashes or moves.
 */
export function AccountMenu({ className }: { className: string }) {
  const account = useAccount(), path = usePathname()
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [open])

  const slim = `${className} w-9 px-0 sm:w-auto sm:px-4`
  const link = <><Icon name="user" /><span className="hidden sm:inline">Sign in</span></>
  if (account.phase === 'idle' || account.phase === 'loading') {
    return (
      <>
        <Link href={signInHref(path)} className={`${slim} signed:hidden`}>{link}</Link>
        <span aria-hidden className={`${className} pointer-events-none hidden w-9 px-0 opacity-60 signed:inline-flex`}><Icon name="user" /></span>
      </>
    )
  }
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

/**
 * Marks a game as played, and as completed once it is, or undoes either. Completed is a mark on a played game, so the two sit together:
 * Completed on its own marks both, and un-marking Played clears both. They live on the game page, not on cards, which stay light.
 * Signed out, they send you to sign in and bring you back here.
 */
export function Progress({ id, title }: { id: string; title: string }) {
  const account = useAccount(), router = useRouter(), path = usePathname()
  const played = account.played.includes(id), done = account.completed.includes(id), settled = account.phase === 'out' || account.phase === 'in'
  const click = async (list: 'played' | 'completed', on: boolean) => {
    await ready()
    if (!signedInNow()) return router.push(signInHref(path))
    void setList(list, id, on)
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
        <Icon name={done ? 'check' : 'flag'} />Completed
      </button>
    </div>
  )
}

/** A short message at the bottom of the screen. The region is always in the page so screen readers announce what appears in it. */
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
