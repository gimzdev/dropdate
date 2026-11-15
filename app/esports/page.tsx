import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { Tally } from '@/components/home'
import { ListPage, Part, ldList } from '@/components/lists'
import { SITE, esportsPath, status } from '@/lib/core'
import { esportsGames } from '@/lib/data'
import { card } from '@/lib/meta'

export const revalidate = 3600

const title = 'Esports schedules by game'
const description = 'Live and upcoming esports tournaments for each game, with dates and prize pools from PandaScore, checked every hour.'
export const generateMetadata = async (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => ({ title, description, alternates: { canonical: '/esports' }, ...(await card(parent, title, description, '/esports')) })

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
                  <span className="mt-1 block text-[14px] text-muted"><Tally items={[...g.ahead, ...g.ended]} today={today} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Part>
      )}
    </ListPage>
  )
}
