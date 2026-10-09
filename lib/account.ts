// The signed-in state in the browser, shared by every button on the page, and the list kept for visitors who are not signed in.
// A module, not a context: hearts all over the site read and change the same state. A visitor who never signed in makes no request.
import { useEffect, useSyncExternalStore } from 'react'
import { ACCOUNTS, type Ev, type Flags, type ListName, afterChange } from './core'

// ── Storage (it can be blocked or full: nothing here may throw) ──

const FLAG = 'dropdate:session', SAVED = 'dropdate:saved', NOTICE = 'dropdate:notice'
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k) } catch {} },
}

/** An answer we do not read: close it, so the browser does not wait for a body nobody will use. */
export const drop = (res: Response) => { void res.body?.cancel().catch(() => {}) }

const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const subscribe = (f: () => void) => {
  const other = (e: StorageEvent) => (e.key === SAVED) && f() // the saved list changed in another tab
  subs.add(f)
  addEventListener('storage', other)
  return () => { subs.delete(f); removeEventListener('storage', other) }
}

/** The "signed in" marker: set by signing in, cleared by a 401, read by the page head before paint (no flash of the wrong button). */
export function setSession(on: boolean) {
  if (on) store.set(FLAG, '1'); else store.del(FLAG)
  document.documentElement.toggleAttribute('data-signed', on)
}

// ── One-off messages ──

let notice = ''
/** A short message at the bottom of the screen for a few seconds. */
export function notify(message: string) {
  notice = message
  emit()
  setTimeout(() => { if (notice === message) dismiss() }, 6500)
}
export function dismiss() { notice = ''; emit() }
/** A message to show after the next full page load (deleting the account ends in one). */
export const notifyNext = (message: string) => { try { sessionStorage.setItem(NOTICE, message) } catch {} }
export function useNotice() {
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(NOTICE)
      if (m) { sessionStorage.removeItem(NOTICE); notify(m) }
    } catch {}
  }, [])
  return useSyncExternalStore(subscribe, () => notice, () => '')
}

// ── The account ──

/** idle: not asked yet (server render, first paint). loading: signed in before, asking again. out, in: answered. */
export interface Account { phase: 'idle' | 'loading' | 'out' | 'in'; email: string; since: string; wishlist: string[]; played: string[]; completed: string[] }
type Lists = Pick<Account, 'wishlist' | 'played' | 'completed'>
const IDLE: Account = { phase: 'idle', email: '', since: '', wishlist: [], played: [], completed: [] }
const OUT: Account = { ...IDLE, phase: 'out' }
let state = IDLE
const put = (next: Partial<Account>) => { state = { ...state, ...next }; emit() }
const out = () => { setSession(false); put({ ...OUT }) }

let loading: Promise<void> | null = null
/** Asks who is signed in and what they have marked. Everyone waiting shares one request. */
export function refresh(): Promise<void> {
  if (!ACCOUNTS) return Promise.resolve()
  return (loading ??= load().finally(() => { loading = null }))
}

async function load() {
  if (store.get(FLAG) !== '1') return put({ ...OUT })
  if (state.phase !== 'in') put({ phase: 'loading' })
  try {
    const res = await fetch('/api/me', { cache: 'no-store' })
    if (res.status === 401) { drop(res); return out() }
    if (!res.ok) { drop(res); throw new Error(String(res.status)) }
    const me = (await res.json()) as { email: string; since: string } & Lists
    settled.clear()
    put({ phase: 'in', email: me.email, since: me.since, wishlist: me.wishlist, played: me.played, completed: me.completed ?? [] })
    await mergeSaved()
  } catch {
    if (state.phase === 'loading') put({ ...OUT }) // unreachable now: signed out until the next page asks again
  }
}

let started = false
/** The first component on a page to need the account starts the one request. */
export function start() {
  if (started) return
  started = true
  void refresh()
}

/** The profile page already knows who is signed in (the server just checked). */
export function seed(me: { email: string; since: string } & Lists) {
  setSession(true)
  settled.clear()
  put({ phase: 'in', ...me })
}

export function useAccount(): Account {
  const account = useSyncExternalStore(subscribe, () => state, () => IDLE)
  useEffect(start, [])
  return account
}

const flagsOf = (key: string): Flags => ({ wishlist: state.wishlist.includes(key), played: state.played.includes(key), completed: state.completed.includes(key) })
const place = (list: string[], key: string, on: boolean) => (on ? (list.includes(key) ? list : [key, ...list]) : list.filter((k) => k !== key))
const apply = (key: string, f: Flags) => put({ wishlist: place(state.wishlist, key, f.wishlist), played: place(state.played, key, f.played), completed: place(state.completed, key, f.completed) })

/** Whether someone is signed in at this moment (read when asked, not when the page last rendered). */
export const signedInNow = () => state.phase === 'in'
/** Resolves once we know whether someone is signed in (at once when we already do). */
export const ready = () => (ACCOUNTS && (state.phase === 'idle' || state.phase === 'loading') ? refresh() : Promise.resolve())

const latest = new Map<string, number>() // the newest change per game: a late older answer is ignored
const settled = new Map<string, Flags>() // what the server last said per game: where a failed change goes back to
const chains = new Map<string, Promise<void>>()
/** Changes to one game go to the server one after the other, in the order they were made. */
function inOrder<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(job)
  const tail = run.then(() => undefined, () => undefined)
  chains.set(key, tail)
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key) })
  return run
}

/** Turns a list on or off for a game: shown at once, then saved; a failure goes back and says why. Null when it did not happen. */
export interface Saved { flags: Flags; ev?: Ev }
export async function setList(list: ListName, key: string, on: boolean): Promise<Saved | null> {
  await ready()
  if (state.phase !== 'in') return null
  const before = flagsOf(key), n = (latest.get(key) ?? 0) + 1
  if (!settled.has(key)) settled.set(key, before)
  latest.set(key, n)
  apply(key, afterChange(before, list, on)) // by the same rules as the server
  return inOrder(key, async () => {
    if (state.phase !== 'in') return null // signed out while waiting its turn
    let message = 'Could not save that. Check your connection and try again.'
    try {
      const res = await fetch('/api/library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, list, on }) })
      if (res.status === 401) {
        drop(res)
        out()
        notify('You were signed out. Sign in again to keep going.')
        return null
      }
      const body = (await res.json().catch(() => null)) as { flags?: Flags; ev?: Ev; error?: string } | null
      if (res.ok && body?.flags) {
        settled.set(key, body.flags)
        if (latest.get(key) === n) apply(key, body.flags)
        return { flags: body.flags, ...(body.ev && { ev: body.ev }) }
      }
      message = body?.error ?? message
    } catch {}
    if (latest.get(key) === n) { // the newest change failed: back to what the server holds
      apply(key, settled.get(key) ?? before)
      notify(message)
    }
    return null
  })
}

// ── The list of a visitor who is not signed in: kept in this browser ──

const NONE: string[] = []
let raw: string | null = null, saved = NONE
function readSaved() {
  const r = store.get(SAVED)
  if (r !== raw) {
    raw = r
    let v: unknown = null
    try { v = r ? JSON.parse(r) : null } catch {}
    saved = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : NONE
  }
  return saved
}
/** Keeps exactly `list` in this browser (none: forgets it). */
function keepSaved(list: string[]) {
  if (list.length) { raw = JSON.stringify(list); saved = list; store.set(SAVED, raw) } else { store.del(SAVED); raw = null; saved = NONE }
  emit()
}
const toggleLocal = (id: string) => { const now = readSaved(); keepSaved(now.includes(id) ? now.filter((x) => x !== id) : [...now, id]) }

const TRIED = 'dropdate:merge-at' // sessionStorage: when this tab last tried
/** Signing in turns this browser's hearts into wishlist entries. What could not be added yet stays, and is retried at most every five minutes. */
async function mergeSaved() {
  const keys = readSaved()
  if (!keys.length) return
  try {
    if (Date.now() - Number(sessionStorage.getItem(TRIED) ?? 0) < 5 * 60_000) return
    sessionStorage.setItem(TRIED, String(Date.now()))
  } catch {}
  try {
    const res = await fetch('/api/library/merge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keys }) })
    if (!res.ok) return drop(res)
    const j = (await res.json()) as { added: number; done: string[]; wishlist: string[]; played: string[]; completed?: string[] }
    const left = readSaved().filter((k) => !j.done.includes(k))
    keepSaved(left)
    settled.clear()
    put({ wishlist: j.wishlist, played: j.played, completed: j.completed ?? state.completed })
    if (j.added) notify(`Added ${j.added} ${j.added === 1 ? 'game' : 'games'} you saved on this device to your wishlist.${left.length ? ` ${left.length} could not be added yet and will be tried again.` : ''}`)
  } catch {}
}

/** The wishlist: the account's when signed in, this browser's otherwise. */
export function useSaved() {
  const account = useAccount(), local = useSyncExternalStore(subscribe, readSaved, () => NONE)
  const ids = account.phase === 'in' ? account.wishlist : local
  return {
    ids, phase: account.phase, signedIn: account.phase === 'in', has: (id: string) => ids.includes(id),
    /** Adds or removes. False: nothing happened (the game needs an account and nobody is signed in). */
    toggle: async (id: string, needsAccount = false) => {
      await ready()
      if (state.phase === 'in') await setList('wishlist', id, !state.wishlist.includes(id))
      else if (needsAccount) return false
      else toggleLocal(id)
      return true
    },
  }
}

// ── Signing in and out ──

/** An answer from the sign-in service, with its machine-readable code. */
export class AuthError extends Error {
  constructor(public code: string, message: string, public status = 0) { super(message) }
}
async function call(path: string, body: unknown) {
  let res: Response
  try { res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) } catch { throw new AuthError('NETWORK', 'No connection.') }
  const j = (await res.json().catch(() => null)) as { code?: string; message?: string; error?: string; url?: string } | null
  if (!res.ok) throw new AuthError(j?.code ?? String(res.status), j?.message ?? j?.error ?? '', res.status)
  return j
}

/** Emails a six-digit code. */
export const requestCode = (email: string) => call('/api/signin/code', { email })

/** Checks the code; when right, the browser is signed in and the saved list moves to the account. */
export async function confirmCode(email: string, otp: string) {
  await call('/api/auth/sign-in/email-otp', { email, otp })
  setSession(true)
  await refresh()
}

/** Goes to Google or Discord, and comes back to `next` signed in. */
export async function startProvider(provider: 'google' | 'discord', next: string) {
  const j = await call('/api/auth/sign-in/social', { provider, callbackURL: next, errorCallbackURL: `/signin?error=provider&next=${encodeURIComponent(next)}` })
  if (!j?.url) throw new AuthError('NO_URL', '')
  setSession(true) // a 401 on the way back clears it again
  location.assign(j.url)
}

/** Ends the session and starts over from home. If the server is unreachable the session is still open: say so, forget nothing. */
export async function signOut() {
  try { await call('/api/auth/sign-out', {}) } catch (e) {
    if (!(e instanceof AuthError) || e.code === 'NETWORK' || e.status >= 500) return notify('Could not sign out. Check your connection and try again.')
  }
  setSession(false)
  location.assign('/')
}

/** Deletes the account for good; everything tied to it is gone when this returns true. */
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await fetch('/api/me', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })
    drop(res)
    if (!res.ok) return false
  } catch { return false }
  setSession(false)
  keepSaved([])
  notifyNext('Your account and everything in it were deleted.')
  location.assign('/')
  return true
}
