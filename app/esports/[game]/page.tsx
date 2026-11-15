import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { GameSchedule, Tally } from '@/components/home'
import { FeedPanel } from '@/components/ui'
import { ListPage, Part, Pills, type Listed, ldList } from '@/components/lists'
import { type Ev, SITE, esportsPath, range } from '@/lib/core'
import { esportsGames } from '@/lib/data'
import { card } from '@/lib/meta'

// One game's tournaments: /esports/league-of-legends, /esports/counter-strike, ...

export const revalidate = 3600
export const generateStaticParams = async () => [] // built on the first visit, then refreshed every hour

type Props = { params: Promise<{ game: string }> }
const load = cache(esportsGames)
const listed = (e: Ev): Listed => ({ name: e.title, url: e.url ?? '', item: { '@type': 'SportsEvent', name: e.title, startDate: e.start, endDate: e.end ?? e.start, ...(e.url && { url: e.url }) } })

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { games } = await load(), g = games.get((await params).game)
  if (!g) return { title: 'Esports' }
  const next = g.ahead.slice(0, 2).map((e) => `${e.title} (${range(e.start, e.end)})`), title = `${g.name} esports schedule`
  const description = `${g.name} tournaments live now and coming up, with dates and prize pools${next.length ? `: ${next.join(', ')}` : ''}. From PandaScore, checked every hour.`
  return { title, description, alternates: { canonical: esportsPath(g.name) }, ...(await card(parent, title, description, esportsPath(g.name))) }
}

export default async function EsportsGame({ params }: Props) {
  const { today, games } = await load(), slug = (await params).game, g = games.get(slug)
  if (!g) notFound()
  const title = `${g.name} esports schedule`, path = esportsPath(g.name), all = [...g.ahead, ...g.ended]
  // Live, ahead and ended are told apart in the browser, at the visitor's own day (this server's day is UTC, and the page is kept for an hour)
  const intro = <Tally items={all} today={today} name={g.name} />
  return (
    <ListPage trail={[['Dropdate', '/'], ['Esports', '/esports'], [g.name, path]]} title={title} intro={intro} ld={ldList(title, path, g.ahead.map(listed))}>
      <GameSchedule items={all} today={today}>
        <div className="wrap pb-14 md:pb-20">
          <FeedPanel feed={`${SITE}/api/calendar.ics?type=tournament&genre=${encodeURIComponent(g.name)}`} title={<>Add {g.name} tournaments to your calendar</>} as="h2" className="">
            <p className="mt-1 max-w-xl text-[15px] text-muted">A live feed of the {g.name} tournaments in the calendar, live and coming up. When a date moves, your calendar follows.</p>
          </FeedPanel>
        </div>
      </GameSchedule>
      {games.size > 1 && (
        <Part id="games" title="Other games">
          <Pills label="Esports games" links={[...games.values()].filter((x) => x.name !== g.name).map((x) => [x.name, esportsPath(x.name)])} />
        </Part>
      )}
    </ListPage>
  )
}
