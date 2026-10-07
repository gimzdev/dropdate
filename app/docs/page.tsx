import type { Metadata } from 'next'
import { Code, Doc, DocSection, ENDPOINTS } from '@/components/site'
import { Icon } from '@/components/ui'
import { SITE } from '@/lib/core'

export const metadata: Metadata = {
  title: 'API documentation',
  description: 'A free JSON API and calendar feeds for game releases and esports tournaments. No keys, no sign-up.',
  alternates: { canonical: '/docs' },
}

const TOC = [['start', 'Quick start'], ['endpoints', 'Endpoints'], ['parameters', 'Parameters'], ['search', 'Smart search'], ['freshness', 'Freshness and fair use']]
const PARAMS = [
  ['q', 'Smart search: plain English plus game names, typo tolerant.'],
  ['type', 'release or tournament.'],
  ['platform', 'PC, PlayStation, Xbox, Nintendo or Mobile.'],
  ['genre', 'One genre, for example RPG or Shooter.'],
  ['past', 'true lists events that already happened, most recent first.'],
  ['limit, offset', 'Pagination. limit defaults to 50, at most 200.'],
]

export default function Docs() {
  return (
    <Doc title="API documentation" intro="A free REST API over the same live data that powers the site. No keys, no sign-up, and any website can call it." toc={TOC}>
      <DocSection id="start" title="Quick start">
        <p className="prose-dd mb-6">One request returns upcoming releases and tournaments as JSON, sorted by date. Add <code className="code-inline">q</code> to search in plain English.</p>
        <Code label="Request and response">{`$ curl "${SITE}/api/events?q=ps5 releases next month&limit=2"

{
  "data": [
    {
      "id": "rawg-3498",
      "slug": "example-game",
      "title": "Example Game",
      "kind": "release",
      "start": "2026-11-19",
      "platforms": ["PC", "PlayStation"],
      "genres": ["Action", "RPG"],
      "metacritic": 88,
      "thumb": "https://media.rawg.io/..."
    }
  ],
  "meta": {
    "total": 14, "limit": 2, "offset": 0,
    "updated": "2026-10-01T12:00:00.000Z",
    "understood": ["Next month", "Releases", "PlayStation"]
  }
}`}</Code>
      </DocSection>

      <DocSection id="endpoints" title="Endpoints">
        <ul className="space-y-4">
          {ENDPOINTS.map(([path, , desc, example]) => (
            <li key={path} className="rounded-panel bg-panel p-5 md:p-6">
              <h3 className="flex flex-wrap items-center gap-3">
                <span className="rounded-[5px] bg-fg px-1.5 py-0.5 font-mono text-[12px] font-bold text-black">GET</span>
                <code className="font-mono text-[16px] font-semibold">{path}</code>
              </h3>
              <p className="mt-2.5 text-muted">{desc}</p>
              <a href={`${path}${example.replace(/ /g, '%20')}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-raised px-4 py-3 font-mono text-[13px] text-muted transition hover:text-fg">
                <span className="truncate">{path}{example}</span><span className="flex shrink-0 items-center gap-1.5 font-sans text-[13px] font-semibold">Try it<Icon name="external" className="h-3.5 w-3.5" /></span>
              </a>
            </li>
          ))}
        </ul>
      </DocSection>

      <DocSection id="parameters" title="Parameters">
        <dl className="divide-y divide-line/10 border-y border-line/10">
          {PARAMS.map(([k, v]) => <div key={k} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-6"><dt><code className="font-mono text-[14px] font-semibold text-fg">{k}</code></dt><dd className="text-muted">{v}</dd></div>)}
        </dl>
      </DocSection>

      <DocSection id="search" title="Smart search">
        <div className="prose-dd mb-6">
          <p>The <code className="code-inline">q</code> parameter understands types (releases, tournaments, esports), platforms (pc, ps5, xbox, switch, mobile) and time (today, this weekend, next 30 days, next month, oct, q4, in the summer, 2027, past). Months can be abbreviated, half typed or misspelled.</p>
          <p>Whatever is left is a typo-tolerant search on titles and genres, and shorthand like fps or mmo works too. <code className="code-inline">meta.understood</code> shows how your query was read.</p>
        </div>
        <Code label="Examples">{'/api/events?q=esports this week\n/api/events?q=nintendo in december\n/api/events?q=zelda'}</Code>
      </DocSection>

      <DocSection id="freshness" title="Freshness and fair use">
        <p className="prose-dd">Data refreshes on its own every hour, and responses are cached at the edge. Please cache on your side too and keep request rates reasonable.</p>
      </DocSection>
    </Doc>
  )
}
