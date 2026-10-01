import { Explorer } from '@/components/explorer'
import { ApiSection, Footer } from '@/components/site'
import { Header, Hero, Rail, Updated } from '@/components/ui'
import { type Ev, gap, lite, shift } from '@/lib/core'
import { getEvents } from '@/lib/data'

export const revalidate = 3600 // rebuilt in the background at most once an hour, from live data: nothing to maintain

const hype = (a: Ev, b: Ev) => b.pop - a.pop

export default async function Home() {
  const data = await getEvents()
  // In production an outage keeps the last good page online (it is rebuilt on the next visit); builds and dev show the banner
  if (data.error && process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error(data.error)
  const { events, today } = data
  const releases = events.filter((e) => e.kind === 'release')
  const upcoming = events.filter((e) => (e.end ?? e.start) >= today)
  const tournaments = upcoming.filter((e) => e.kind === 'tournament')
  const near = releases.filter((e) => e.start >= today && gap(today, e.start) <= 120)

  const hero = (near.length >= 3 ? near : releases.filter((e) => e.start >= today)).sort(hype).slice(0, 5)
  const soon = releases.filter((e) => e.start >= today && e.start <= shift(today, 14)).sort(hype).slice(0, 14).sort((a, b) => a.start.localeCompare(b.start))
  const fresh = releases.filter((e) => e.start < today && gap(e.start, today) <= 30).sort(hype).slice(0, 14)
  const stats: [string, number][] = [
    ['Upcoming events', upcoming.length],
    ['Releasing in 14 days', upcoming.filter((e) => e.kind === 'release' && e.start <= shift(today, 14)).length],
    tournaments.length ? ['Tournaments', tournaments.length] : ['Genres tracked', new Set(releases.flatMap((e) => e.genres)).size],
    ['Platforms', 5],
  ]

  return (
    <>
      <Header overHero />
      <main>
        <Hero slides={hero} today={today} />
        <div className="border-y border-line/10 bg-surface/40">
          <div className="wrap grid grid-cols-2 gap-y-4 py-5 md:grid-cols-5">
            {stats.map(([label, n]) => (
              <div key={label}><div className="text-2xl font-extrabold tabular-nums">{n}</div><div className="text-xs text-muted">{label}</div></div>
            ))}
            <div className="col-span-2 flex items-center gap-2 text-sm text-muted md:col-span-1 md:justify-end">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Live · updated <Updated at={data.updated} />
            </div>
          </div>
        </div>
        <div id="releases" />
        <Rail eyebrow="This fortnight" title="Coming up" items={soon.map(lite)} today={today} />
        <Rail eyebrow="Fresh drops" title="Just released" items={fresh.map(lite)} today={today} />
        <Rail eyebrow="Esports" title="Tournaments" items={tournaments.slice(0, 14)} today={today} />
        <Explorer data={{ ...data, events: events.map(lite) }} />
        <ApiSection />
      </main>
      <Footer />
    </>
  )
}
