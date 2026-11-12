import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { Schedule } from '@/components/home'
import { ListPage, Part, Pills, type Listed, ldList } from '@/components/lists'
import { type Ev, esportsPath, range, status } from '@/lib/core'
import { esportsGames } from '@/lib/data'

// One game's tournaments: /esports/league-of-legends, /esports/counter-strike, ...

export const revalidate = 3600
export const generateStaticParams = async () => [] // built on the first visit, then refreshed every hour

type Props = { params: Promise<{ game: string }> }
const load = cache(esportsGames)
const listed = (e: Ev): Listed => ({ name: e.title, url: e.url ?? '', item: { '@type': 'SportsEvent', name: e.title, startDate: e.start, endDate: e.end ?? e.start, ...(e.url && { url: e.url }) } })

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { games } = await load(), g = games.get((await params).game)
  if (!g) return { title: 'Esports' }
  const next = g.ahead.slice(0, 2).map((e) => `${e.title} (${range(e.start, e.end)})`)
  return {
    title: `${g.name} esports schedule`, alternates: { canonical: esportsPath(g.name) },
    description: `${g.name} tournaments live now and coming up, with dates and prize pools${next.length ? `: ${next.join(', ')}` : ''}. From PandaScore, checked every hour.`,
  }
}

export default async function EsportsGame({ params }: Props) {
  const { today, games } = await load(), slug = (await params).game, g = games.get(slug)
  if (!g) notFound()
  const live = g.ahead.filter((e) => status(e, today).tone === 'live').length, title = `${g.name} esports schedule`, path = esportsPath(g.name)
  const intro = g.ahead.length
    ? `${g.ahead.length} ${g.name} ${g.ahead.length === 1 ? 'tournament is' : 'tournaments are'} live or coming up${live ? `, ${live} of them live now` : ''}. Dates and prize pools from PandaScore, checked every hour.`
    : `No ${g.name} tournament is scheduled right now; the last ones are below. Dates and prize pools from PandaScore, checked every hour.`
  return (
    <ListPage trail={[['Dropdate', '/'], ['Esports', '/esports'], [g.name, path]]} title={title} intro={intro} ld={ldList(title, path, g.ahead.map(listed))}>
      <Schedule items={g.ahead} today={today} id="ahead" title="Live and coming up" lede={live ? `${live} live right now, then the rest by start date.` : 'By start date, with the prize pool where it is announced.'} />
      <Schedule items={g.ended.slice(0, 12)} today={today} id="ended" title="Ended recently" lede="The latest to finish." />
      {games.size > 1 && (
        <Part id="games" title="Other games">
          <Pills label="Esports games" links={[...games.values()].filter((x) => x.name !== g.name).map((x) => [x.name, esportsPath(x.name)])} />
        </Part>
      )}
    </ListPage>
  )
}
