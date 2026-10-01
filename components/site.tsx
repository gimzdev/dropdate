import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE } from '@/lib/core'
import { Logo } from './logo'
import { Header } from './ui'

export const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/gimzdev/dropdate'
// [endpoint, one-liner for the home page, docs description, docs example]
export const ENDPOINTS = [
  ['GET /api/events', 'Releases and tournaments with smart ?q= search', 'Releases and tournaments, sorted by date. Smart search, filters and pagination.', '?q=ps5 releases next month&limit=10'],
  ['GET /api/tournaments', 'Esports tournaments with prize pools', 'Esports tournaments with prize pools. Same filters as /api/events.', '?q=this week'],
  ['GET /api/games', 'Full details for one game', 'Full details for one game: description, developers, trailer, screenshots, stores.', '?slug=cyberpunk-2077'],
  ['GET /api/calendar.ics', 'Subscribable calendar feed', 'Subscribable iCalendar feed. Same filters as /api/events, or ?ids=a,b for specific events.', '?type=release&q=xbox'],
]

/** A link: new tab for other sites, plain for the API, client-side for pages. */
export const A = ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
  to.startsWith('/') && !to.startsWith('/api/') ? <Link href={to} className={className}>{children}</Link>
    : <a href={to} className={className} {...(to.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>
export const Code = ({ children }: { children: string }) => <pre className="code"><code>{children}</code></pre>

const COLUMNS: [string, [string, string][]][] = [
  ['Product', [['Releases', '/#releases'], ['Calendar', '/#explore'], ['Subscribe (.ics)', '/api/calendar.ics']]],
  ['Developers', [['API docs', '/docs'], ['Events endpoint', '/api/events?limit=5'], ['Status of data', '/docs#freshness']]],
  ['Project', [['GitHub ↗', REPO], ['Terms & privacy', '/legal'], ['CC0 license ↗', 'https://creativecommons.org/publicdomain/zero/1.0/']]],
]
const credit = 'underline hover:text-fg'

export function Footer() {
  return (
    <footer className="border-t border-line/10 bg-surface/40 pt-14 pb-10">
      <div className="wrap">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="mb-4 flex items-center gap-2.5"><Logo size={32} id="dd-logo-footer" /><span className="text-lg font-extrabold">Dropdate</span></div>
            <p className="max-w-xs text-sm leading-relaxed text-muted">Every release and tournament refreshed hourly from live sources.</p>
          </div>
          {COLUMNS.map(([title, links]) => (
            <div key={title}>
              <h3 className="mb-4 text-sm font-semibold">{title}</h3>
              <ul className="space-y-2.5 text-sm text-muted">{links.map(([name, to]) => <li key={name}><A to={to} className="hover:text-fg">{name}</A></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-line/10 pt-6 text-xs text-muted sm:flex-row">
          <p>Game data and artwork by <A to="https://rawg.io" className={credit}>RAWG</A> and <A to="https://store.steampowered.com" className={credit}>Steam</A>. Esports data by <A to="https://pandascore.co" className={credit}>PandaScore</A>. Names and images belong to their owners.</p>
          <p>© {new Date().getFullYear()} Dropdate</p>
        </div>
      </div>
    </footer>
  )
}

export function ApiSection() {
  return (
    <section id="api" className="py-20">
      <div className="wrap">
        <div className="card grid items-center gap-10 overflow-hidden p-8 md:grid-cols-2 md:p-12">
          <div>
            <p className="eyebrow mb-2">Developers</p>
            <h2 className="h2 mb-3">Build on Dropdate</h2>
            <p className="mb-6 text-muted">A free, CORS-enabled JSON API and live calendar feed. Same data as this site, no keys, no sign-up.</p>
            <ul className="mb-8 space-y-3 text-sm">{ENDPOINTS.map(([a, b]) => <li key={a} className="flex flex-wrap items-baseline gap-x-3"><code className="font-mono text-accent">{a}</code><span className="text-muted">{b}</span></li>)}</ul>
            <div className="flex gap-3"><Link href="/docs" className="btn-primary">Read the docs</Link><A to={REPO} className="btn-ghost">GitHub ↗</A></div>
          </div>
          <Code>{`$ curl "${SITE}/api/events\\
    ?q=ps5 releases next month&limit=1"

{
  "data": [{
    "title": "Hollow Peaks II",
    "start": "2026-11-10",
    "platforms": ["PlayStation"],
    "metacritic": 88
  }],
  "meta": {
    "total": 14,
    "understood": ["Next month",
                   "Releases", "PlayStation"]
  }
}`}</Code>
        </div>
      </div>
    </section>
  )
}

/** Text pages (docs, legal): header, a titled column of cards, footer. */
export function Doc({ eyebrow, title, intro, wide, children }: { eyebrow: string; title: string; intro: string; wide?: boolean; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className={`wrap pt-32 pb-20 ${wide ? 'max-w-4xl' : 'max-w-3xl'}`}>
        <Link href="/" className="text-sm text-muted hover:text-fg">← Back to Dropdate</Link>
        <p className="eyebrow mt-8 mb-2">{eyebrow}</p>
        <h1 className="h1 mb-4">{title}</h1>
        <p className="mb-12 text-lg text-muted">{intro}</p>
        <div className="space-y-10">{children}</div>
      </main>
      <Footer />
    </>
  )
}
export const Box = ({ title, id, gap = 'mb-4', children }: { title: string; id?: string; gap?: string; children: ReactNode }) => <section id={id} className="card p-6 md:p-8"><h2 className={`h2 ${gap}`}>{title}</h2>{children}</section>
