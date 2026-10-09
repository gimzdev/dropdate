// The signed-in state in the browser, shared by every button on the page, and the saved list kept for visitors who are not signed in.
// A module rather than a React context: hearts sit all over the site, and each one reads and changes the same state.
// Browser only. A visitor who never signed in never makes a request here: the "signed in" marker below is what says to ask.
import { useEffect, useSyncExternalStore } from 'react'
import { ACCOUNTS, type Ev, type Flags, type ListName } from './core'

// ── Storage (it can be blocked or full: nothing here may throw) ─────────

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

/** "Signed in" marker: the sign-in page sets it, a 401 clears it. The page head reads it before paint, so the header never flashes the wrong button. */
export function setSession(on: boolean) {
  if (on) store.set(FLAG, '1'); else store.del(FLAG)
  document.documentElement.toggleAttribute('data-signed', on)
}
const hasFlag = () => store.get(FLAG) === '1'

// ── One-off messages ────────────────────────────────────────────────────

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

// ── The account ─────────────────────────────────────────────────────────

/** idle: not asked yet (the server render, and the first paint). loading: signed in before, asking again. out and in: answered. */
export interface Account { phase: 'idle' | 'loading' | 'out' | 'in'; email: string; since: string; wishlist: string[]; played: string[] }
const IDLE: Account = { phase: 'idle', email: '', since: '', wishlist: [], played: [] }
const OUT: Account = { ...IDLE, phase: 'out' }
let state = IDLE
const put = (next: Partial<Account>) => { state = { ...state, ...next }; emit() }

let loading: Promise<void> | null = null
/** Asks who is signed in and what they have marked. Everyone waiting shares one request. */
export function refresh(): Promise<void> {
  if (!ACCOUNTS) return Promise.resolve()
  return (loading ??= load().finally(() => { loading = null }))
}

async function load() {
  if (!hasFlag()) return put({ ...OUT })
  if (state.phase !== 'in') put({ phase: 'loading' })
  try {
    const res = await fetch('/api/me', { cache: 'no-store' })
    if (res.status === 401) { drop(res); setSession(false); return put({ ...OUT }) }
    if (!res.ok) { drop(res); throw new Error(String(res.status)) }
    const me = (await res.json()) as { email: string; since: string; wishlist: string[]; played: string[] }
    settled.clear()
    put({ phase: 'in', email: me.email, since: me.since, wishlist: me.wishlist, played: me.played })
    await mergeSaved()
  } catch {
    if (state.phase === 'loading') put({ ...OUT }) // unreachable right now: behave as signed out, and ask again on the next page
  }
}

let started = false
/** The first component on a page to need the account starts the one request. */
export function start() {
  if (started) return
  started = true
  void refresh()
}

/** The profile page already knows who is signed in (the server just checked): no need to wait for the answer. */
export function seed(me: { email: string; since: string; wishlist: string[]; played: string[] }) {
  setSession(true)
  put({ phase: 'in', ...me })
}

export function useAccount(): Account {
  const account = useSyncExternalStore(subscribe, () => state, () => IDLE)
  useEffect(start, [])
  return account
}

const flagsOf = (key: string): Flags => ({ wishlist: state.wishlist.includes(key), played: state.played.includes(key) })
const place = (list: string[], key: string, on: boolean) => (on ? (list.includes(key) ? list : [key, ...list]) : list.filter((k) => k !== key))
const apply = (key: string, f: Flags) => put({ wishlist: place(state.wishlist, key, f.wishlist), played: place(state.played, key, f.played) })

/** Whether someone is signed in at this moment (read when asked, not when the page last rendered). */
export const signedInNow = () => state.phase === 'in'
/** Resolves once we know whether someone is signed in (at once when we already do). */
export const ready = () => (ACCOUNTS && (state.phase === 'idle' || state.phase === 'loading') ? refresh() : Promise.resolve())

const latest = new Map<string, number>() // the newest change per game: an older answer arriving late is ignored
const settled = new Map<string, Flags>() // what the server last said about each game touched on this page: where a failed change goes back to
const chains = new Map<string, Promise<void>>()
/** Changes to one game go to the server one after the other, in the order they were made. */
function inOrder<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(job)
  const tail = run.then(() => undefined, () => undefined)
  chains.set(key, tail)
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key) })
  return run
}

/**
 * Wishlists or marks a game as played (or undoes it). It shows at once, then saves; if saving fails it goes back and says why.
 * Returns the flags as saved (and the game's details when it was added), or null when it did not happen.
 */
export interface Saved { flags: Flags; ev?: Ev }
export async function setList(list: ListName, key: string, on: boolean): Promise<Saved | null> {
  await ready()
  if (state.phase !== 'in') return null
  const before = flagsOf(key), n = (latest.get(key) ?? 0) + 1
  if (!settled.has(key)) settled.set(key, before)
  latest.set(key, n)
  apply(key, list === 'wishlist' ? { ...before, wishlist: on } : { wishlist: on ? false : before.wishlist, played: on }) // marking played takes it off the wishlist, as the server will
  return inOrder(key, async () => {
    if (state.phase !== 'in') return null // signed out while this was waiting its turn
    let message = 'Could not save that. Check your connection and try again.'
    try {
      const res = await fetch('/api/library', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, list, on }) })
      if (res.status === 401) {
        drop(res)
        setSession(false)
        put({ ...OUT })
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
    if (latest.get(key) === n) { // the newest change failed: back to what the server holds (an older failed change is overtaken by the newer one)
      apply(key, settled.get(key) ?? before)
      notify(message)
    }
    return null
  })
}

// ── The list of a visitor who is not signed in: kept in this browser ────

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
function toggleLocal(id: string) {
  const now = readSaved()
  saved = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
  raw = JSON.stringify(saved)
  store.set(SAVED, raw)
  emit()
}
function clearSaved() {
  store.del(SAVED)
  raw = null
  saved = NONE
  emit()
}
/** Forgets the saved games the server has taken in; the others stay. */
function forgetSaved(done: string[]) {
  const rest = readSaved().filter((k) => !done.includes(k))
  if (!rest.length) return clearSaved()
  raw = JSON.stringify(rest)
  saved = rest
  store.set(SAVED, raw)
  emit()
}

const TRIED = 'dropdate:merge-at' // sessionStorage: when this tab last tried
/**
 * Signing in turns the hearts left in this browser into wishlist entries. What the server has taken in is forgotten here; what it could not
 * add yet (a data source was down, the library is full) stays, and is tried again later: not on every page, but at most every few minutes.
 */
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
    const j = (await res.json()) as { added: number; done: string[]; wishlist: string[]; played: string[] }
    forgetSaved(j.done)
    settled.clear()
    put({ wishlist: j.wishlist, played: j.played })
    const left = readSaved().length
    if (j.added) notify(`Added ${j.added} ${j.added === 1 ? 'game' : 'games'} you saved on this device to your wishlist.${left ? ` ${left} could not be added yet and will be tried again.` : ''}`)
  } catch {}
}

/** The wishlist, wherever it lives: the account when signed in, this browser otherwise. Same shape as it always had. */
export function useSaved() {
  const account = useAccount(), local = useSyncExternalStore(subscribe, readSaved, () => NONE)
  const ids = account.phase === 'in' ? account.wishlist : local
  return {
    ids, phase: account.phase, signedIn: account.phase === 'in', has: (id: string) => ids.includes(id),
    /** Adds or removes. False means nothing happened because the game can only be kept in an account and nobody is signed in. */
    toggle: async (id: string, needsAccount = false) => {
      await ready()
      if (state.phase === 'in') await setList('wishlist', id, !state.wishlist.includes(id))
      else if (needsAccount) return false
      else toggleLocal(id)
      return true
    },
  }
}

// ── Signing in and out ──────────────────────────────────────────────────

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

/** Checks the code. When it is right the browser is signed in, and the saved list moves to the account. */
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

/**
 * Ends the session on the server, forgets everything here, and starts over from the home page. If the server could not be reached the
 * session is still open, so nothing is forgotten: the person is told, instead of being left looking signed out on a shared computer.
 */
export async function signOut() {
  try { await call('/api/auth/sign-out', {}) } catch (e) {
    if (!(e instanceof AuthError) || e.code === 'NETWORK' || e.status >= 500) return notify('Could not sign out. Check your connection and try again.')
  }
  setSession(false)
  location.assign('/')
}

/** Deletes the account for good. Everything tied to it is gone when this returns true. */
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await fetch('/api/me', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' })
    drop(res)
    if (!res.ok) return false
  } catch { return false }
  setSession(false)
  clearSaved()
  notifyNext('Your account and everything in it were deleted.')
  location.assign('/')
  return true
}
