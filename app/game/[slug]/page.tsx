import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { About } from '@/components/about'
import { Gallery } from '@/components/gallery'
import { Footer } from '@/components/site'
import { Header, Rail, SaveButton } from '@/components/ui'
import { SITE, gap, googleUrl, lite, longDate, scoreTone, srcSet, status } from '@/lib/core'
import { getEvents, getGame } from '@/lib/data'

export const revalidate = 21600
export const generateStaticParams = async () => [] // each page is built on its first visit, then cached and refreshed every 6 hours

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getGame((await params).slug).catch(() => null)
  if (!g) return { title: 'Game' }
  const description = `${g.name}: release date, ${g.trailer ? 'trailer, ' : ''}screenshots and platforms.${g.released ? ` Releases ${longDate(g.released)}.` : ''}`.slice(0, 200)
  return { title: `${g.name}: release date${g.trailer ? ' & trailer' : ''}`, description, alternates: { canonical: `/game/${g.slug}` }, openGraph: { title: g.name, description, images: g.image ? [g.image] : [] }, twitter: { card: 'summary_large_image' } }
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-line/10 py-3 text-sm last:border-0"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{children}</dd></div>
)
const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="card p-5"><h2 className="mb-3 text-sm font-semibold tracking-wider text-muted uppercase">{title}</h2>{children}</div>
)
const out = { target: '_blank', rel: 'noopener noreferrer' }

export default async function GamePage({ params }: Props) {
  const [g, data] = await Promise.all([getGame((await params).slug), getEvents()])
  if (!g) notFound()
  const { today } = data, ev = data.events.find((e) => e.id === g.id), date = ev?.start ?? g.released // the hourly calendar has the freshest date
  const st = date && status({ kind: 'release', start: date }, today)
  const nearby = date ? data.events.filter((e) => e.id !== g.id && Math.abs(gap(date, e.start)) <= 10).sort((a, b) => b.pop - a.pop).slice(0, 12).map(lite) : []
  const ld = { '@context': 'https://schema.org', '@type': 'VideoGame', name: g.name, url: `${SITE}/game/${g.slug}`, image: g.image, description: g.description?.slice(0, 300), datePublished: date, genre: g.genres, gamePlatform: g.platforms, publisher: g.publishers.map((name) => ({ '@type': 'Organization', name })) }

  return (
    <>
      <Header overHero />
      <main>
        <section className="relative isolate overflow-hidden text-white">
          {g.image && <img src={g.image} srcSet={srcSet(g.image)} sizes="100vw" alt="" fetchPriority="high" className="absolute inset-0 -z-10 h-full w-full object-cover object-top" />}
          <div className="absolute inset-0 -z-10 bg-linear-to-r from-black/85 via-black/50 to-black/20" />
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#06080e] via-transparent to-black/30" />
          <div className="wrap relative flex min-h-svh flex-col justify-center pt-[6rem] pb-[5rem]">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {st && <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${st.tone === 'past' ? 'bg-white/20' : st.tone === 'live' ? 'bg-emerald-500 text-black' : 'bg-accent'}`}>{st.label}</span>}
              {g.metacritic ? <span className={`rounded-md px-2 py-1 text-xs font-bold ${scoreTone(g.metacritic)}`}>{g.metacritic} Metacritic</span> : null}
              {g.esrb && <span className="rounded-md border border-white/30 px-2 py-1 text-xs font-semibold">{g.esrb}</span>}
            </div>
            <h1 className="max-w-4xl text-[clamp(2rem,min(3.2vw+2svh,8.5svh),4.5rem)] leading-[1.05] font-extrabold tracking-tight">{g.name}</h1>
            <p className="mt-3 text-base text-white/80 md:mt-4 md:text-lg">{date ? longDate(date) : 'Release date TBA'}{g.genres.length ? ` · ${g.genres.join(' · ')}` : ''}</p>
            <div className="mt-[clamp(1rem,2.6svh,1.5rem)] flex flex-wrap gap-3">
              {ev && <SaveButton id={ev.id} label art />}
              {g.website && <a href={g.website} {...out} className="btn-art btn-hero">Official site ↗</a>}
              {date && <a href={googleUrl({ title: g.name, start: date, slug: g.slug })} {...out} className="btn-primary btn-hero whitespace-nowrap">+ Add to <span className="max-sm:hidden">Google&nbsp;</span>Calendar</a>}
            </div>
          </div>
          <a href="#details" aria-label="Scroll to details" className="absolute bottom-5 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border border-white/25 bg-black/30 text-white/80 backdrop-blur-sm transition hover:bg-black/50 hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </a>
        </section>

        <div id="details" className="wrap grid scroll-mt-16 gap-10 pt-8 pb-12 md:pt-10 md:pb-16 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div className="min-w-0 space-y-10 md:space-y-12">
            {g.description && <section><h2 className="h2 mb-4">About</h2><About text={g.description} title={g.name} /></section>}
            {g.trailer && <section><h2 className="h2 mb-4">Trailer</h2><video controls preload="none" poster={g.trailer.preview} src={g.trailer.src} className="aspect-video w-full rounded-2xl border border-line/10 bg-black" /></section>}
            {g.screenshots.length > 0 && (
              <section>
                <h2 className="h2 mb-4">Screenshots</h2>
                <Gallery shots={g.screenshots} name={g.name} />
              </section>
            )}
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Panel title="Details">
              <dl className="-mt-2">
                <Fact label="Release">{date ? longDate(date) : 'TBA'}</Fact>
                {g.developers.length > 0 && <Fact label="Developer">{g.developers.slice(0, 3).join(', ')}</Fact>}
                {g.publishers.length > 0 && <Fact label="Publisher">{g.publishers.slice(0, 3).join(', ')}</Fact>}
                {g.platforms.length > 0 && <Fact label="Platforms">{g.platforms.join(', ')}</Fact>}
                {g.playtime ? <Fact label="Avg. playtime">{g.playtime} hours</Fact> : null}
                {g.rating ? <Fact label="Rating">{g.rating.toFixed(1)} / 5</Fact> : null}
              </dl>
            </Panel>
            {g.stores.length > 0 && <Panel title="Where to buy"><div className="flex flex-col gap-2">{g.stores.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost justify-between">{s.name}<span aria-hidden>↗</span></a>)}</div></Panel>}
            {g.tags.length > 0 && <div className="flex flex-wrap gap-2">{g.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
          </aside>
        </div>
        <Rail eyebrow="Same window" title="Around the same time" items={nearby} today={today} />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </>
  )
}
