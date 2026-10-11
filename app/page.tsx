import type { Metadata } from 'next'
import { Explorer, Fresh, Hero, Schedule, Upcoming, WeekStrip } from '@/components/home'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'
import { type Ev, gap, shift } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const revalidate = 3600 // rebuilt in the background from live data: nothing to maintain
export const metadata: Metadata = { alternates: { canonical: '/' } }

const hype = (a: Ev, b: Ev) => b.pop - a.pop

export default async function Home() {
  const data = await getEvents()
  // In production an outage keeps the last good page online (it is rebuilt on the next visit); builds and dev show the banner
  if (data.error && process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error(data.error)
  // One light copy of every event, shared by all sections (an event shown twice is sent once). Large artwork stays here unless the
  // hero needs it; screenshots, most of the weight, come on the first hover of a card (/api/shots)
  const { today } = data, events = data.events.map(({ image: _, shots: __, ...e }) => e)
  const big = new Map(data.events.map((e) => [e.id, e.image])), hasArt = (e: Ev) => !!(big.get(e.id) || e.thumb)
  const art = (e: Ev) => { const image = big.get(e.id); return image ? { ...e, image } : e }
  const releases = events.filter((e) => e.kind === 'release'), ahead = releases.filter((e) => e.start >= today), soon = ahead.filter((e) => gap(today, e.start) <= 120)
  const hero = [...(soon.length >= 3 ? soon : ahead)].filter(hasArt).sort(hype).slice(0, 5), shown = new Set(hero.map((e) => e.id))
  const week = events.filter((e) => e.start >= shift(today, -1) && e.start <= shift(today, 7)) // the browser works out its own today: a day either side
  const later = ahead.filter((e) => e.start > today && !shown.has(e.id)), year = later.filter((e) => gap(today, e.start) <= 365)
  const ranked = [...(year.length >= 6 ? year : later)].sort(hype).slice(0, 11)
  const [lead] = ranked.splice(Math.max(0, ranked.findIndex(hasArt)), 1) // the big tile is the first with artwork
  const fresh = releases.filter((e) => e.start < today && gap(e.start, today) <= 30).sort(hype).slice(0, 10)
  const cups = events.filter((e) => e.kind === 'tournament' && (e.end ?? e.start) >= today).sort(hype).slice(0, 10).sort((a, b) => a.start.localeCompare(b.start))
  return (
    <>
      <Header overHero />
      <main id="main">
        <h1 className="sr-only">Dropdate: every game release and esports tournament in one calendar</h1>
        <Hero slides={hero.map(art)} today={today} />
        <WeekStrip items={week} today={today} />
        {lead && ranked.length >= 2 ? <Upcoming items={[art(lead), ...ranked]} today={today} /> : <span id="upcoming" />}
        <Fresh items={fresh} today={today} />
        {cups.length ? <Schedule items={cups} today={today} /> : <span id="esports" />}
        <Explorer data={{ ...data, events }} />
      </main>
      <Footer />
    </>
  )
}
