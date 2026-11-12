import type { Metadata } from 'next'
import Link from 'next/link'
import { ListPage, Part, ldList } from '@/components/lists'
import { SITE, esportsPath, status } from '@/lib/core'
import { esportsGames } from '@/lib/data'

export const revalidate = 3600

const title = 'Esports schedules by game'
export const metadata: Metadata = {
  title, alternates: { canonical: '/esports' },
  description: 'Live and upcoming esports tournaments for each game, with dates and prize pools from PandaScore, checked every hour.',
}

export default async function Esports() {
  const { today, games } = await esportsGames()
  const list = [...games.entries()].map(([slug, g]) => ({ slug, ...g, live: g.ahead.filter((e) => status(e, today).tone === 'live').length }))
    .sort((a, b) => b.ahead.length - a.ahead.length || a.name.localeCompare(b.name))
  return (
    <ListPage trail={[['Dropdate', '/'], ['Esports', '/esports']]} title={title}
      intro={list.length ? `Live and upcoming tournaments for ${list.length} ${list.length === 1 ? 'game' : 'games'}, with dates and prize pools from PandaScore, checked every hour.` : 'No tournament is in the calendar right now. Dates and prize pools come from PandaScore, checked every hour.'}
      ld={ldList(title, '/esports', list.map((g) => ({ name: `${g.name} esports schedule`, url: `${SITE}${esportsPath(g.name)}` })))}>
      {list.length > 0 && (
        <Part id="games" title="Games">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((g) => (
              <li key={g.slug}>
                <Link href={esportsPath(g.name)} className="group block rounded-panel bg-panel px-5 py-4 transition hover:bg-raised">
                  <span className="block text-[17px] font-semibold decoration-line/40 underline-offset-[3px] group-hover:underline">{g.name}</span>
                  <span className="mt-1 block text-[14px] text-muted">
                    {g.live > 0 && <span className="font-semibold text-live">{g.live} live · </span>}
                    {g.ahead.length - g.live > 0 ? `${g.ahead.length - g.live} coming up` : g.live ? 'none coming up yet' : `${g.ended.length} ended recently`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Part>
      )}
    </ListPage>
  )
}
