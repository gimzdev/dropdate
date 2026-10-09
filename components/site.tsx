import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE } from '@/lib/core'
import { Logo } from './logo'
import { Header, HomeLink, Icon } from './ui'

export const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/gimzdev/dropdate'
// [endpoint, one-liner for the home page, docs description, docs example]
export const ENDPOINTS = [
  ['/api/events', 'Releases and tournaments, with plain-English search', 'Releases and tournaments, sorted by date, with smart search, filters and pagination.', '?q=ps5 releases next month&limit=10'],
  ['/api/tournaments', 'Esports tournaments and prize pools', 'Esports tournaments with their prize pools. Takes the same filters as /api/events.', '?q=this week'],
  ['/api/games', 'Everything about one game', 'Everything about one game: description, developers, trailer, screenshots and stores.', '?slug=cyberpunk-2077'],
  ['/api/calendar.ics', 'A calendar feed you can subscribe to', 'An iCalendar feed to subscribe to. Takes the same filters as /api/events, or ?ids=a,b for specific events.', '?type=release&q=xbox'],
]

/** A link: a new tab for other sites, a plain link for the API, client-side for pages. */
export const A = ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
  to.startsWith('/') && !to.startsWith('/api/') ? <Link href={to} className={className}>{children}</Link>
    : <a href={to} className={className} {...(to.startsWith('http') && { target: '_blank', rel: 'noopener noreferrer' })}>{children}</a>

// Just enough highlighting for JSON and shell: keys, strings, numbers and the command.
const TOKEN = /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|(\$ \w+)|\b(true|false|null)\b/g
function highlight(code: string) {
  const out: ReactNode[] = []
  let last = 0, k = 0
  for (const m of code.matchAll(TOKEN)) {
    const at = m.index ?? 0, [all, str, colon, num, cmd, lit] = m
    if (at > last) out.push(code.slice(last, at))
    if (str) out.push(<span key={k++} className={colon ? 'text-muted' : 'text-fg'}>{str}</span>, colon ?? '')
    else out.push(<span key={k++} className={num ? 'text-mark' : 'text-arena'}>{num || cmd || lit}</span>)
    last = at + all.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}
export const Code = ({ children, label }: { children: string; label?: string }) => (
  <figure className="min-w-0 overflow-hidden rounded-panel bg-panel ring-1 ring-line/10 ring-inset">
    {label && <figcaption className="border-b border-line/10 px-5 py-3 text-[13px] font-medium text-dim">{label}</figcaption>}
    <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-[#cfcec8]"><code>{highlight(children)}</code></pre>
  </figure>
)

const COLUMNS: [string, string[][]][] = [
  ['Calendar', [['This week', '/#week'], ['Most anticipated', '/#upcoming'], ['Esports', '/#esports'], ['Search', '/#explore']]],
  ['Developers', [['API docs', '/docs'], ['Events endpoint', '/api/events?limit=5'], ['Calendar feed', '/api/calendar.ics'], ['Data freshness', '/docs#freshness']]],
  ['Project', [['Source on GitHub', REPO], ['Terms and privacy', '/legal'], ['CC0 license', 'https://creativecommons.org/publicdomain/zero/1.0/']]],
]
const credit = 'underline decoration-line/30 underline-offset-2 transition hover:text-fg'

export function Footer() {
  return (
    <footer className="border-t border-line/10">
      <div className="wrap grid grid-cols-1 gap-12 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)] md:py-16">
        <div>
          <HomeLink className="flex w-fit items-center gap-2"><Logo size={28} /><span className="display text-[22px]">Dropdate</span></HomeLink>
          <p className="mt-4 max-w-xs text-[15px] text-muted">Game releases and esports tournaments in one calendar, refreshed every hour.</p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <ul className="mt-4 space-y-3 text-[15px] text-muted">
              {links.map(([name, to]) => <li key={name}><A to={to} className="inline-flex items-center gap-1.5 transition hover:text-fg">{name}{to.startsWith('http') && <Icon name="external" className="h-3.5 w-3.5 opacity-60" />}</A></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wrap flex flex-col justify-between gap-3 border-t border-line/10 py-6 text-[13px] text-dim sm:flex-row">
        <p>Game data, artwork and Metacritic scores from <A to="https://rawg.io" className={credit}>RAWG</A> and <A to="https://store.steampowered.com" className={credit}>Steam</A>, esports from <A to="https://pandascore.co" className={credit}>PandaScore</A>. Names, scores and images belong to their owners.</p>
        <p className="shrink-0">© {new Date().getFullYear()} Dropdate</p>
      </div>
    </footer>
  )
}

export function ApiSection() {
  return (
    <section id="api" aria-labelledby="api-title" className="border-t border-line/10 py-14 md:py-20">
      <div className="wrap grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <h2 id="api-title" className="h-section">Build with the API</h2>
          <p className="lede">The same live data as free JSON and calendar feeds. No keys, no sign-up, and any website can call it.</p>
          <ul className="mt-8 divide-y divide-line/10 border-y border-line/10">
            {ENDPOINTS.map(([path, short]) => (
              <li key={path} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                <code className="font-mono text-[14px] text-fg">{path}</code>
                <span className="text-[14px] text-muted">{short}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/docs" className="btn btn-mark">Read the docs</Link>
            <A to={REPO} className="btn btn-line">Source on GitHub</A>
          </div>
        </div>
        <Code label="Example request">{`$ curl "${SITE}/api/events?q=ps5 next month&limit=1"

{
  "data": [{
    "title": "Hollow Peaks II",
    "start": "2026-11-10",
    "platforms": ["PlayStation"],
    "genres": ["Action", "RPG"]
  }],
  "meta": {
    "total": 14,
    "understood": ["Next month", "PlayStation"]
  }
}`}</Code>
      </div>
    </section>
  )
}

/** Text pages (docs, legal): a big title, an optional table of contents, sections. */
export function Doc({ title, intro, toc, children }: { title: string; intro: string; toc?: string[][]; children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-muted transition hover:text-fg"><Icon name="left" className="h-3.5 w-3.5" />Dropdate</Link>
        <h1 className="display mt-6 text-[clamp(3rem,4vw+1.75rem,5.5rem)]">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{intro}</p>
        <div className={`mt-14 md:mt-20 ${toc ? 'grid grid-cols-1 gap-12 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16' : ''}`}>
          {toc && (
            <nav aria-label="On this page" className="hidden lg:block">
              <ul className="sticky top-24 space-y-1 border-l border-line/10">
                {toc.map(([id, label]) => <li key={id}><a href={`#${id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-muted transition hover:border-fg hover:text-fg">{label}</a></li>)}
              </ul>
            </nav>
          )}
          <div className="min-w-0 max-w-3xl space-y-16">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export const DocSection = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="display mb-5 text-[2.1rem] md:text-[2.5rem]">{title}</h2>
    {children}
  </section>
)
