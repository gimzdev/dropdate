import type { Metadata } from 'next'
import { Explorer } from '@/components/explorer'
import { Fresh, Schedule, Upcoming, WeekStrip } from '@/components/sections'
import { ApiSection, Footer } from '@/components/site'
import { Header, Hero } from '@/components/ui'
import { type Ev, gap, lite, shift } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const revalidate = 3600 // rebuilt in the background at most once an hour, from live data: nothing to maintain
export const metadata: Metadata = { alternates: { canonical: '/' } }

const hype = (a: Ev, b: Ev) => b.pop - a.pop

export default async function Home() {
  const data = await getEvents()
  // In production an outage keeps the last good page online (it is rebuilt on the next visit); builds and dev show the banner
  if (data.error && process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error(data.error)
  const { events, today } = data
  const releases = events.filter((e) => e.kind === 'release'), ahead = releases.filter((e) => e.start >= today)
  const soon = ahead.filter((e) => gap(today, e.start) <= 120)

  const hero = [...(soon.length >= 3 ? soon : ahead)].sort(hype).slice(0, 5)
  const shown = new Set(hero.map((e) => e.id))
  // The week works out the visitor's own today in the browser, so it gets a day either side
  const week = events.filter((e) => e.start >= shift(today, -1) && e.start <= shift(today, 7)).map(lite)
  const later = ahead.filter((e) => e.start > today && !shown.has(e.id)), year = later.filter((e) => gap(today, e.start) <= 365)
  const [lead, ...anticipated] = [...(year.length >= 6 ? year : later)].sort(hype).slice(0, 11) // the first keeps its large artwork for the big tile
  const fresh = releases.filter((e) => e.start < today && gap(e.start, today) <= 30).sort(hype).slice(0, 10).map(lite)
  const cups = events.filter((e) => e.kind === 'tournament' && (e.end ?? e.start) >= today).sort(hype).slice(0, 10).sort((a, b) => a.start.localeCompare(b.start)).map(lite)

  return (
    <>
      <Header overHero />
      <main id="main">
        <h1 className="sr-only">Dropdate: every game release and esports tournament in one calendar</h1>
        <Hero slides={hero} today={today} />
        <WeekStrip items={week} today={today} />
        {lead && anticipated.length >= 2 ? <Upcoming items={[lead, ...anticipated.map(lite)]} today={today} /> : <span id="upcoming" />}
        <Fresh items={fresh} today={today} />
        {cups.length ? <Schedule items={cups} today={today} /> : <span id="esports" />}
        <Explorer data={{ ...data, events: events.map(lite) }} />
        <ApiSection />
      </main>
      <Footer />
    </>
  )
}
