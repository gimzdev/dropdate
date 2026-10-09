import type { Metadata } from 'next'
import { Explorer, Fresh, Hero, Schedule, Upcoming, WeekStrip } from '@/components/home'
import { ApiSection, Footer } from '@/components/site'
import { Header } from '@/components/ui'
import { type Ev, gap, shift } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const revalidate = 3600 // rebuilt in the background at most once an hour, from live data: nothing to maintain
export const metadata: Metadata = { alternates: { canonical: '/' } }

const hype = (a: Ev, b: Ev) => b.pop - a.pop

export default async function Home() {
  const data = await getEvents()
  // In production an outage keeps the last good page online (it is rebuilt on the next visit); builds and dev show the banner
  if (data.error && process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error(data.error)
  // One light copy of every event, shared by all the sections: an event that appears twice is sent to the browser once. Large artwork stays
  // here unless the hero needs it, and screenshots (most of the weight) come later, on the first hover of a card (/api/shots)
  const { today } = data, events = data.events.map(({ image: _, shots: __, ...e }): Ev => ({ ...e, shots: [] }))
  const big = new Map(data.events.map((e) => [e.id, e.image]))
  const art = (e: Ev) => { const image = big.get(e.id); return image ? { ...e, image } : e } // the hero and the first tile keep their large artwork
  const releases = events.filter((e) => e.kind === 'release'), ahead = releases.filter((e) => e.start >= today)
  const soon = ahead.filter((e) => gap(today, e.start) <= 120)

  const hero = [...(soon.length >= 3 ? soon : ahead)].sort(hype).slice(0, 5), shown = new Set(hero.map((e) => e.id))
  // The week works out the visitor's own today in the browser, so it gets a day either side
  const week = events.filter((e) => e.start >= shift(today, -1) && e.start <= shift(today, 7))
  const later = ahead.filter((e) => e.start > today && !shown.has(e.id)), year = later.filter((e) => gap(today, e.start) <= 365)
  const [lead, ...anticipated] = [...(year.length >= 6 ? year : later)].sort(hype).slice(0, 11)
  const fresh = releases.filter((e) => e.start < today && gap(e.start, today) <= 30).sort(hype).slice(0, 10)
  const cups = events.filter((e) => e.kind === 'tournament' && (e.end ?? e.start) >= today).sort(hype).slice(0, 10).sort((a, b) => a.start.localeCompare(b.start))

  return (
    <>
      <Header overHero />
      <main id="main">
        <h1 className="sr-only">Dropdate: every game release and esports tournament in one calendar</h1>
        <Hero slides={hero.map(art)} today={today} />
        <WeekStrip items={week} today={today} />
        {lead && anticipated.length >= 2 ? <Upcoming items={[art(lead), ...anticipated]} today={today} /> : <span id="upcoming" />}
        <Fresh items={fresh} today={today} />
        {cups.length ? <Schedule items={cups} today={today} /> : <span id="esports" />}
        <Explorer data={{ ...data, events }} />
        <ApiSection />
      </main>
      <Footer />
    </>
  )
}
