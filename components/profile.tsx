'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteAccount, drop, notify, seed, setList, signOut, useAccount } from '@/lib/account'
import { type Ev, type LibItem, TABS, type TabName, monthLabel, monthYear, status, webcal } from '@/lib/core'
import { Heart, Icon } from './icons'
import { Img, Open, Score, TONE, Thumb, useToday } from './ui'

// The profile: the wishlist and the games you have played, each with its Metacritic score, a tick on a played game to say you completed it, and your data.

const PAGE = 60
const CELLS = 'grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[86px_minmax(0,1fr)_auto] md:grid-cols-[86px_minmax(0,1fr)_88px_92px] md:gap-x-5'
const round = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-dim transition hover:bg-raised'
const platforms = (e: Ev) => e.platforms.map((p) => (p === 'PlayStation' ? 'PS' : p)).join(', ')

/** Upcoming by date, then undated and "to be announced", then what is already out (newest first). */
function wishlistOrder(list: Ev[], today: string) {
  const rank = (e: Ev) => ((e.end ?? e.start) && (e.end ?? e.start) < today && !e.tba ? 2 : !e.start || e.tba ? 1 : 0)
  return [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.start.localeCompare(a.start) : (a.start || '9').localeCompare(b.start || '9') || a.title.localeCompare(b.title)))
}

function Row({ e, list, today, done }: { e: Ev; list: TabName; today: string; done: boolean }) {
  const esport = e.kind === 'tournament', out = !esport && !!e.start && e.start <= today, played = list === 'played'
  const s = e.start ? status(e, today) : null
  const when = !e.start ? 'No date yet' : e.tba && e.start > today ? `${monthLabel(e.start.slice(0, 7))}, date to be announced` : s!.label
  const meta = (played ? [e.start ? e.start.slice(0, 4) : '', platforms(e)] : [platforms(e) || e.genres[0]]).filter(Boolean) // separate items: a narrow row wraps between them, never in the middle of one
  const remove = played ? 'Remove from the games you have played' : 'Remove from your wishlist'
  return (
    <li className={`${CELLS} py-3.5`}>
      <Open e={e} className="block rounded-art"><Thumb e={e} className="aspect-[16/10] w-full rounded-lg" /></Open>
      <div className="min-w-0">
        <Open e={e} className="block"><h3 className="line-clamp-2 text-[15px] leading-snug font-semibold decoration-line/40 underline-offset-[3px] hover:underline">{e.title}</h3></Open>
        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-snug">
          {!played && <span className={`font-semibold ${s?.tone === 'live' && esport ? 'text-live' : TONE[s?.tone ?? 'future']}`}>{when}</span>}
          {played && done && <span className="inline-flex items-center gap-1 font-semibold text-go"><Icon name="check" className="h-3.5 w-3.5" />Completed</span>}
          {meta.map((m, i) => <span key={i} className="text-muted">{m}</span>)}
          {!!e.metacritic && <span className="md:hidden"><Score n={e.metacritic} className="text-[13px]" /></span>}
        </p>
      </div>
      <span className="hidden justify-center md:flex">{e.metacritic ? <Score n={e.metacritic} className="text-[13px]" /> : !esport && <><span aria-hidden className="text-dim">—</span><span className="sr-only">No Metacritic score</span></>}</span>
      <div className="flex items-center justify-end">
        {!played && out && (
          <button type="button" title="I have played this" aria-label={`Mark ${e.title} as played`} className={`${round} hover:text-go`}
            onClick={async () => { if (await setList('played', e.id, true)) notify(`${e.title} moved to the games you have played.`) }}><Icon name="pad" /></button>
        )}
        {played && !esport && (
          <button type="button" aria-pressed={done} title={done ? 'Completed. Tap to undo' : 'Mark as completed'} aria-label={`Completed: ${e.title}`}
            className={done ? 'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-go/15 text-go ring-1 ring-go/40 transition ring-inset hover:bg-go/25' : `${round} hover:text-go`}
            onClick={() => void setList('completed', e.id, !done)}><Icon name={done ? 'check' : 'flag'} /></button>
        )}
        <button type="button" title={remove} aria-label={`${remove}: ${e.title}`} className={`${round} hover:text-fg`} onClick={() => void setList(played ? 'played' : 'wishlist', e.id, false)}><Icon name="close" /></button>
      </div>
    </li>
  )
}

/** What the search box and its button say, for each list. */
const ADD: Record<TabName, { label: string; placeholder: string; button: string }> = {
  wishlist: { label: 'Search for a game to put on your wishlist', placeholder: 'Search a game to wishlist', button: 'Wishlist' },
  played: { label: 'Search for a game you have played', placeholder: 'Search a game you played', button: 'Played' },
}

interface Found { key: string; slug: string; title: string; released?: string; thumb: string; metacritic?: number }

/** Search every game and put one on a list: the way to add what the calendar does not hold (older games, mostly). */
function AddGame({ list, today, has, onAdded }: { list: TabName; today: string; has: (key: string) => boolean; onAdded: (e: Ev) => void }) {
  const [q, setQ] = useState(''), [found, setFound] = useState<Found[] | null>(null), [failed, setFailed] = useState(false), [adding, setAdding] = useState('')
  useEffect(() => {
    const term = q.trim()
    setFailed(false)
    if (term.length < 2) return setFound(null)
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        if (!res.ok) { drop(res); throw new Error(String(res.status)) }
        setFound(((await res.json()) as { data: Found[] }).data.slice(0, 8))
      } catch { if (!ctl.signal.aborted) { setFound(null); setFailed(true) } }
    }, 250)
    return () => { clearTimeout(t); ctl.abort() }
  }, [q])

  async function add(f: Found) {
    setAdding(f.key)
    onAdded({ id: f.key, title: f.title, kind: 'release', start: f.released ?? '', thumb: f.thumb, shots: [], pop: 0, platforms: [], genres: [], slug: f.slug, ...(f.metacritic && { metacritic: f.metacritic }) }) // the row shows at once
    const saved = await setList(list, f.key, true)
    if (saved?.ev) onAdded(saved.ev) // and takes the server's copy of the details when it arrives
    setAdding('')
  }
  const term = q.trim()
  return (
    <div className="mt-8">
      <label htmlFor="add-game" className="sr-only">{ADD[list].label}</label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-dim" />
        <input id="add-game" type="search" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ('') }}
          placeholder={ADD[list].placeholder}
          className="h-12 w-full rounded-full bg-panel pr-4 pl-11 text-[16px] ring-1 ring-line/12 ring-inset transition placeholder:text-dim" />
      </div>
      <div aria-live="polite">
        {failed && <p className="mt-3 px-2 text-[15px] text-muted">The search is unavailable right now. Try again in a moment.</p>}
        {found && !found.length && <p className="mt-3 px-2 text-[15px] text-muted">No game found for “{term}”.</p>}
        {found && found.length > 0 && (
          <ul className="mt-3 divide-y divide-line/10 overflow-hidden rounded-2xl bg-panel ring-1 ring-line/10 ring-inset">
            {found.map((f) => {
              const here = has(f.key), unreleased = list !== 'wishlist' && (!f.released || f.released > today)
              return (
                <li key={f.key} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                  {f.thumb ? <Img src={f.thumb} className="aspect-[16/10] w-16 rounded-md" /> : <span className="block aspect-[16/10] w-16 shrink-0 rounded-md bg-raised" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{f.title}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">{f.released ? f.released.slice(0, 4) : 'Not announced'}{!!f.metacritic && <Score n={f.metacritic} />}</p>
                  </div>
                  {here ? <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-go"><Icon name="check" />Added</span>
                    : unreleased ? <span className="shrink-0 text-sm text-dim">Not out yet</span>
                      : <button type="button" disabled={adding === f.key} onClick={() => void add(f)} aria-label={`${ADD[list].button}: ${f.title}`} className="btn btn-line btn-sm shrink-0">{adding === f.key ? 'Adding…' : ADD[list].button}</button>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Download everything held about the account as a file. */
async function download() {
  try {
    const res = await fetch('/api/me/export', { cache: 'no-store' })
    if (!res.ok) drop(res)
    if (res.status === 401) return notify('You were signed out. Sign in again to download your data.')
    if (res.status === 429) return notify('That is a lot of downloads. Try again in an hour.')
    if (!res.ok) throw new Error(String(res.status))
    const url = URL.createObjectURL(await res.blob()), a = Object.assign(document.createElement('a'), { href: url, download: 'dropdate-my-data.json' })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch { notify('Could not download your data. Try again.') }
}

function DeleteAccount() {
  const [step, setStep] = useState<'closed' | 'ask' | 'busy'>('closed'), [failed, setFailed] = useState(false), keep = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (step === 'ask') keep.current?.focus() }, [step])
  if (step === 'closed') return <button type="button" onClick={() => setStep('ask')} className="mt-8 text-[15px] font-medium text-muted underline decoration-line/30 underline-offset-4 transition hover:text-fg hover:decoration-live">Delete my account</button>
  return (
    <div role="group" aria-labelledby="delete-title" className="mt-8 max-w-xl rounded-panel bg-live/10 p-5 ring-1 ring-live/30 ring-inset md:p-6">
      <h3 id="delete-title" className="text-lg font-semibold">Delete your account?</h3>
      <p className="mt-2 text-[15px] text-[#ffd0d4]">This erases your email address, your wishlist and the games you have played, with the ones you completed, for good. It cannot be undone and we cannot bring it back. Download your data first if you want a copy.</p>
      {failed && <p role="alert" className="mt-3 text-[15px] font-semibold text-[#ffb7be]">Could not delete the account. Check your connection and try again.</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={step === 'busy'} onClick={async () => { setStep('busy'); setFailed(false); if (!(await deleteAccount())) { setFailed(true); setStep('ask') } }} className="btn bg-live text-black hover:bg-[#ff6e7e]">{step === 'busy' ? 'Deleting…' : 'Delete everything'}</button>
        <button ref={keep} type="button" disabled={step === 'busy'} onClick={() => { setStep('closed'); setFailed(false) }} className="btn btn-line">Keep my account</button>
      </div>
    </div>
  )
}

export function Profile({ user, items, today: serverToday }: { user: { email: string; since: string }; items: LibItem[]; today: string }) {
  const router = useRouter(), params = useSearchParams(), today = useToday(serverToday), account = useAccount()
  const wanted: TabName = TABS.find((l) => l === params.get('tab')) ?? 'wishlist'
  const [tab, setTab] = useState<TabName>(wanted), [limit, setLimit] = useState(PAGE), [added, setAdded] = useState<Ev[]>([]), [origin, setOrigin] = useState(''), [copied, setCopied] = useState(false)
  useEffect(() => setTab(wanted), [wanted])
  useEffect(() => setOrigin(location.origin), [])

  // What the server rendered, newest first; the account store takes over once it has this (seed), and then follows every change on the page
  const first = useMemo(() => {
    const keys = (f: 'wishlisted' | 'played' | 'completed') => items.filter((i) => i[f]).sort((a, b) => b[f]!.localeCompare(a[f]!)).map((i) => i.ev.id)
    return { wishlist: keys('wishlisted'), played: keys('played'), completed: keys('completed') }
  }, [items])
  useEffect(() => seed({ email: user.email, since: user.since, ...first }), [first, user.email, user.since])

  const keys = account.phase === 'in' ? account : first
  const known = useMemo(() => new Map([...items.map((i) => i.ev), ...added].map((e) => [e.id, e])), [items, added])
  const missing = keys[tab].some((k) => !known.has(k)), asked = useRef(false)
  useEffect(() => { if (missing && !asked.current) { asked.current = true; router.refresh() } }, [missing, router]) // something was added elsewhere (a merged list): ask the server for the details

  const rows = useMemo(() => {
    const list = keys[tab].flatMap((k) => known.get(k) ?? [])
    return tab === 'wishlist' ? wishlistOrder(list, today) : list
  }, [keys, tab, known, today])
  const counts = { wishlist: keys.wishlist.length, played: keys.played.length, completed: keys.completed.length }
  const finished = useMemo(() => new Set(keys.completed), [keys.completed])

  const pick = (t: TabName) => { setTab(t); setLimit(PAGE); history.replaceState(null, '', t === 'wishlist' ? '/profile' : `/profile?tab=${t}`) }
  const feed = origin && keys.wishlist.length ? `${origin}/api/calendar.ics?ids=${keys.wishlist.slice(0, 300).join(',')}` : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(feed) } catch { return prompt('Calendar feed link', feed) as unknown as void }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }
  const empty = {
    wishlist: ['Your wishlist is empty', 'Tap the heart on any game or tournament to keep it here, or search for a game above.'],
    played: ['No games marked as played yet', 'Open a game and press “Played”, or search for the ones you have played above.'],
  }[tab]

  if (account.phase === 'out') {
    return (
      <div className="mt-14 rounded-panel border border-dashed border-line/12 px-6 py-16 text-center">
        <p className="text-lg font-semibold">You were signed out</p>
        <p className="mx-auto mt-2 max-w-sm text-muted">Sign in again to see your wishlist and the games you have played.</p>
        <Link href="/signin?next=/profile" className="btn btn-mark mt-7">Sign in</Link>
      </div>
    )
  }

  return (
    <>
      <p className="mt-5 text-lg text-muted"><span className="font-semibold break-words text-fg">{user.email}</span><span className="mx-2 text-dim" aria-hidden>·</span>Member since {monthYear(user.since)}</p>

      <div role="group" aria-label="Your lists" className="mt-10 flex flex-wrap gap-2">
        <button type="button" onClick={() => pick('wishlist')} aria-pressed={tab === 'wishlist'} className="pill h-11 px-5 text-[15px]"><Heart on={tab === 'wishlist'} className="h-4 w-4" />Wishlist<span className="opacity-70">{counts.wishlist}</span></button>
        <button type="button" onClick={() => pick('played')} aria-pressed={tab === 'played'} className="pill h-11 px-5 text-[15px]"><Icon name="pad" />Played<span className="opacity-70">{counts.played}</span></button>
      </div>

      <AddGame key={tab} list={tab} today={today} has={(k) => keys[tab].includes(k)} onAdded={(e) => setAdded((a) => [...a, e])} />

      <section aria-label={{ wishlist: 'Your wishlist', played: 'Games you have played' }[tab]} className="mt-10">
        {rows.length > 0 ? (
          <>
            {tab === 'played' && (counts.completed
              ? <p className="mb-4 text-[14px] text-dim">{counts.completed} of {counts.played} completed</p>
              : <p className="mb-4 text-[14px] text-dim">Finished one? Tap the <Icon name="flag" className="inline h-3.5 w-3.5 align-[-2px]" /><span className="sr-only"> flag</span> on its row to mark it completed.</p>)}
            <div className={`${CELLS} hidden border-b border-line/10 pb-2.5 text-[13px] font-medium text-dim md:grid`}>
              <span className="col-span-2">Game</span><span className="text-center">Metacritic</span><span />
            </div>
            <ul className="divide-y divide-line/10">
              {rows.slice(0, limit).map((e) => <Row key={`${tab}-${e.id}`} e={e} list={tab} today={today} done={finished.has(e.id)} />)}
            </ul>
            {rows.length > limit && <div className="mt-8 text-center"><button type="button" onClick={() => setLimit((l) => l + PAGE * 2)} className="btn btn-line px-7">Show more<span className="text-muted">{rows.length - limit} left</span></button></div>}
          </>
        ) : (
          <div className="rounded-panel border border-dashed border-line/12 px-6 py-14 text-center">
            <p className="text-lg font-semibold">{empty[0]}</p>
            <p className="mx-auto mt-2 max-w-sm text-muted">{empty[1]}</p>
            <Link href="/#explore" className="btn btn-mark mt-7">Browse the calendar</Link>
          </div>
        )}
      </section>

      {tab === 'wishlist' && counts.wishlist > 0 && (
        <div className="mt-14 grid grid-cols-1 gap-6 rounded-panel bg-panel p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-8">
          <div className="flex gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-mark text-black"><Icon name="calendar" className="h-6 w-6" /></span>
            <div>
              <h2 className="text-lg font-semibold">Add your wishlist to your calendar</h2>
              <p className="mt-1 max-w-xl text-[15px] text-muted">Your calendar keeps the dates up to date when a release moves. Games you add to your wishlist later need a fresh link.</p>
              <p className="mt-1 max-w-xl text-[13px] text-dim">The link holds the list of games on your wishlist (up to 300), so share it only with calendars you trust.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={feed ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal(feed))}` : undefined} target="_blank" rel="noopener noreferrer" className="btn btn-mark">Google Calendar</a>
            <a href={feed ? webcal(feed) : undefined} className="btn btn-line">Apple or Outlook</a>
            <button type="button" onClick={copy} disabled={!feed} className="btn btn-line"><Icon name={copied ? 'check' : 'copy'} />{copied ? 'Link copied' : 'Copy link'}</button>
          </div>
        </div>
      )}

      <section id="data" aria-labelledby="data-title" className="mt-20 border-t border-line/10 pt-12">
        <h2 id="data-title" className="display text-[2.1rem] md:text-[2.5rem]">Your data</h2>
        <p className="prose-dd mt-4 max-w-2xl">
          Dropdate keeps your email address, your wishlist and played games with the date and time you added each one (and when you completed it), and the dates you were signed in. No name, no photo, no IP address, no device details.
          You can take it all with you or erase it at any time. <Link href="/legal#privacy">Read how your data is handled</Link>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void download()} className="btn btn-line"><Icon name="download" />Download my data</button>
          <button type="button" onClick={() => void signOut()} className="btn btn-line"><Icon name="logout" />Sign out</button>
        </div>
        <DeleteAccount />
      </section>
    </>
  )
}
