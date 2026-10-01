import type { Metadata } from 'next'
import { Box, Code, Doc, ENDPOINTS } from '@/components/site'
import { SITE } from '@/lib/core'

export const metadata: Metadata = { title: 'API documentation' }

const PARAMS = [
  ['q', 'Smart search: plain English plus game names (typo tolerant)'],
  ['type', 'release | tournament'],
  ['platform', 'PC | PlayStation | Xbox | Nintendo | Mobile'],
  ['genre', 'One genre, e.g. RPG or Shooter'],
  ['past', 'true to list events that already happened'],
  ['limit / offset', 'Pagination. limit defaults to 50, max 200'],
]

export default function Docs() {
  return (
    <Doc wide eyebrow="Developers" title="API documentation" intro="A free REST API over the same live data that powers the site. No keys, CORS enabled.">
      <Box title="Quick start" gap="mb-5">
        <Code>{`curl "${SITE}/api/events?q=ps5 releases next month&limit=2"

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
      "image": "https://media.rawg.io/..."
    }
  ],
  "meta": {
    "total": 14, "limit": 2, "offset": 0,
    "updated": "2026-10-01T12:00:00.000Z",
    "understood": ["Next month", "Releases", "PlayStation"]
  }
}`}</Code>
      </Box>
      <Box title="Endpoints" gap="mb-6">
        <div className="space-y-7">
          {ENDPOINTS.map(([name, , desc, example]) => (
            <div key={name}>
              <h3 className="mb-1 font-mono text-base font-semibold text-accent">{name}</h3>
              <p className="mb-3 text-muted">{desc}</p>
              <code className="block rounded-lg bg-surface2 px-4 py-3 font-mono text-sm">{example}</code>
            </div>
          ))}
        </div>
      </Box>
      <Box title="Parameters" gap="mb-5">
        <dl className="divide-y divide-line/10">{PARAMS.map(([k, v]) => <div key={k} className="grid gap-1 py-3 sm:grid-cols-[160px_1fr]"><dt className="font-mono text-sm text-accent">{k}</dt><dd className="text-muted">{v}</dd></div>)}</dl>
      </Box>
      <Box title="Smart search">
        <p className="prose-dd mb-5">
          The <code className="text-fg">q</code> parameter understands types (releases, tournaments, esports), platforms (pc, ps5, xbox, switch, mobile) and time (today, this weekend, next 30 days, next month, oct,
          q4, in the summer, 2027, past). Months can be abbreviated, half typed or misspelled. Anything left over is a typo-tolerant search on titles and genres (fps and mmo work too). <code className="text-fg">meta.understood</code> shows how your query was read.
        </p>
        <Code>{'/api/events?q=esports this week\n/api/events?q=nintendo in december\n/api/events?q=zelda'}</Code>
      </Box>
      <Box id="freshness" title="Freshness & fair use">
        <p className="prose-dd">Data refreshes automatically every hour and responses are cached at the edge. Please cache on your side too and keep request rates reasonable.</p>
      </Box>
    </Doc>
  )
}
