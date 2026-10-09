'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import { BROWSE_SORTS, type BrowseQuery, FIRST_YEAR, GENRES, browseHref } from '@/lib/core'
import { FilterBar, Icon, PlatformPills, Select, Sep } from './ui'

// The browse page's controls. The server makes the list for the address in the bar: these only change the address.

/** The search box and the filters; what the page found goes inside, and dims while a new answer is on its way. */
export function BrowseShell({ query, thisYear, children }: { query: BrowseQuery; thisYear: number; children: ReactNode }) {
  const router = useRouter(), [pending, start] = useTransition(), [text, setText] = useState(query.q)
  // the controls show where the page is heading: an answer can take a second, and the next change builds on the last
  const [shown, setShown] = useState(query), ahead = useRef(query), sent = useRef(query.q)
  const go = (next: Partial<BrowseQuery>, replace = false) => {
    const to = { ...ahead.current, page: 1, ...next }
    ahead.current = to
    if (next.q !== undefined) sent.current = to.q
    setShown(to)
    start(() => { if (replace) router.replace(browseHref(to), { scroll: false }); else router.push(browseHref(to), { scroll: false }) })
  }
  useEffect(() => { if (!pending) { ahead.current = query; setShown(query) } }, [query, pending]) // arrived (or not): the page is the truth again
  useEffect(() => { if (query.q !== sent.current) { sent.current = query.q; setText(query.q) } }, [query.q]) // back, forward or a link, not this box
  useEffect(() => { // typing searches after a short pause
    if (text.trim() === ahead.current.q) return
    const t = setTimeout(() => { if (text.trim() !== ahead.current.q) go({ q: text.trim() }, true) }, 400) // (Enter may have searched already)
    return () => clearTimeout(t)
  }, [text])
  const years = Array.from({ length: thisYear + 2 - FIRST_YEAR + 1 }, (_, i) => [String(thisYear + 2 - i)])

  return (
    <>
      <form role="search" onSubmit={(e) => { e.preventDefault(); go({ q: text.trim() }) }} className="relative mt-8 max-w-3xl">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-5 h-5 w-5 -translate-y-1/2 text-muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} type="search" name="q" aria-label="Search every game by name" placeholder="Search every game" autoComplete="off" spellCheck={false} enterKeyHint="search" maxLength={60}
          className={`h-14 w-full rounded-full bg-panel ${text ? 'pr-24' : 'pr-5'} pl-14 text-base text-fg ring-1 ring-line/12 transition outline-none ring-inset placeholder:text-dim hover:ring-line/25 focus:ring-2 focus:ring-mark sm:h-16 sm:text-[17px] [&::-webkit-search-cancel-button]:hidden`} />
        {text && <button type="button" onClick={() => { setText(''); go({ q: '' }) }} className="btn btn-sm absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-fg">Clear</button>}
      </form>

      <FilterBar end={<Select label="Sort by" value={shown.sort} onChange={(v) => go({ sort: v })} options={Object.entries(BROWSE_SORTS)} />}>
        <Select label="Year" value={shown.year || 'any'} onChange={(v) => go({ year: v === 'any' ? '' : v })} options={[['any', 'Any year'], ...years]} className="w-[122px]" />
        <Sep />
        <PlatformPills value={shown.platform} onChange={(platform) => go({ platform })} />
        <Sep />
        <Select label="Genre" value={shown.genre || 'any'} onChange={(v) => go({ genre: v === 'any' ? '' : v })} options={[['any', 'All genres'], ...GENRES.map(([slug, name]) => [slug, name])]} className="w-[168px]" />
      </FilterBar>

      <div aria-busy={pending} className={`transition-opacity duration-200 ${pending ? 'opacity-50' : ''}`}>{children}</div>
    </>
  )
}

/** Previous and next, as links: each page has an address of its own. */
export function Pager({ query, pages }: { query: BrowseQuery; pages: number }) {
  const jump = () => document.getElementById('results')?.scrollIntoView({ block: 'start' })
  const part = (to: number, label: string, rel: 'prev' | 'next', on: boolean) => {
    const inner = rel === 'prev' ? <><Icon name="left" />{label}</> : <>{label}<Icon name="right" /></>
    return on
      ? <Link href={browseHref({ ...query, page: to })} prefetch={false} scroll={false} onClick={jump} rel={rel} className="btn btn-line">{inner}</Link>
      : <span aria-hidden className="btn btn-line pointer-events-none opacity-40">{inner}</span>
  }
  return (
    <nav aria-label="Pages" className="mt-12 flex items-center justify-center gap-3">
      {part(query.page - 1, 'Previous', 'prev', query.page > 1)}
      <span aria-current="page" className="px-2 text-[15px] text-muted">Page {query.page} of {pages}</span>
      {part(query.page + 1, 'Next', 'next', query.page < pages)}
    </nav>
  )
}
