import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { About } from '@/components/about'
import { Gallery } from '@/components/gallery'
import { Footer } from '@/components/site'
import { Countdown, Header, Icon, Rail, SaveButton } from '@/components/ui'
import { SITE, gap, googleUrl, lite, longDate, monthLabel, scoreTone, srcSet, status, weekday } from '@/lib/core'
import { getEvents, getGame } from '@/lib/data'

export const revalidate = 21600
export const generateStaticParams = async () => [] // each page is built on its first visit, then cached and refreshed every 6 hours

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = await getGame((await params).slug).catch(() => null)
  if (!g) return { title: 'Game' }
  const description = `${g.name}: release date, ${g.trailer ? 'trailer, ' : ''}screenshots and platforms.${g.released ? ` Releases ${longDate(g.released)}.` : ''}`.slice(0, 200)
  return { title: `${g.name}: release date${g.trailer ? ' and trailer' : ''}`, description, alternates: { canonical: `/game/${g.slug}` }, openGraph: { title: g.name, description, images: g.image ? [g.image] : [] }, twitter: { card: 'summary_large_image' } }
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-panel bg-panel p-5 md:p-6">
    <h2 className="mb-3 text-[15px] font-semibold text-muted">{title}</h2>
    {children}
  </section>
)
const COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4']
const out = { target: '_blank', rel: 'noopener noreferrer' }

export default async function GamePage({ params }: Props) {
  const [g, data] = await Promise.all([getGame((await params).slug), getEvents()])
  if (!g) notFound()
  const { today } = data, ev = data.events.find((e) => e.id === g.id), date = ev?.start ?? g.released // the hourly calendar has the freshest date
  const st = date ? status({ kind: 'release', start: date }, today) : undefined, upcoming = !!date && date > today, tba = !!ev?.tba
  const nearby = date ? data.events.filter((e) => e.id !== g.id && Math.abs(gap(date, e.start)) <= 10).sort((a, b) => b.pop - a.pop).slice(0, 12).map(lite) : []
  const facts = ([
    ['Release date', date ? (tba ? `${monthLabel(date.slice(0, 7))}, exact day not announced` : longDate(date)) : 'Not announced yet'],
    ['Platforms', g.platforms.join(', ')],
    ['Developer', g.developers.slice(0, 2).join(', ')],
    ['Publisher', g.publishers.slice(0, 2).join(', ')],
  ] as [string, string][]).filter(([, v]) => v)
  const details = ([
    ['Average playtime', g.playtime ? `${g.playtime} hours` : ''],
    ['RAWG rating', g.rating ? `${g.rating.toFixed(1)} out of 5` : ''],
    ['Age rating', g.esrb ?? ''],
  ] as [string, string][]).filter(([, v]) => v)
  const ld = { '@context': 'https://schema.org', '@type': 'VideoGame', name: g.name, url: `${SITE}/game/${g.slug}`, image: g.image, description: g.description?.slice(0, 300), datePublished: date, genre: g.genres, gamePlatform: g.platforms, publisher: g.publishers.map((name) => ({ '@type': 'Organization', name })) }

  return (
    <>
      <Header overHero />
      <main id="main">
        <section className="relative isolate overflow-hidden text-white">
          <div className="absolute inset-0 -z-10 bg-black">
            {g.image && <img src={g.image} srcSet={srcSet(g.image)} sizes="100vw" alt="" fetchPriority="high" className="h-full w-full object-cover object-[60%_0%]" />}
            <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/45 to-black/0" />
            <div className="absolute inset-0 bg-linear-to-t from-black via-black/30 to-black/10" />
          </div>
          <div className="wrap flex min-h-[min(88svh,860px)] flex-col pt-24 pb-10 md:pb-14">
            <Link href="/#explore" className="inline-flex w-fit items-center gap-1.5 text-[15px] font-medium text-white/75 transition hover:text-white"><Icon name="left" className="h-3.5 w-3.5" />Calendar</Link>
            <div className="mt-auto pt-16">
              {date ? (
                <p className="flex items-end gap-4">
                  <span className="sr-only">{facts[0][1]}</span>
                  <span aria-hidden className="display text-[clamp(5rem,4vw+3.25rem,8.5rem)] leading-[0.78]">{tba ? 'TBA' : +date.slice(8)}</span>
                  <span aria-hidden className="pb-1 leading-tight">
                    <span className="block text-xl font-semibold md:text-2xl">{monthLabel(date.slice(0, 7))}</span>
                    <span className="block text-white/65 md:text-lg">{tba ? 'Exact day not announced' : weekday(date, true)}</span>
                  </span>
                </p>
              ) : <p className="text-xl font-semibold">Release date not announced yet</p>}
              <h1 className="display mt-6 max-w-[18ch] text-[clamp(2.75rem,3.4vw+1.6rem,5.25rem)]">{g.name}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                {st && !upcoming && <span className={`text-[15px] font-semibold ${st.tone === 'live' ? 'text-go' : 'text-white/75'}`}>{st.label}</span>}
                {g.metacritic ? <span title="Metacritic score" className={`tag text-[13px] ${scoreTone(g.metacritic)}`}>{g.metacritic} Metacritic</span> : null}
                {g.esrb && <span className="rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ring-white/30 ring-inset">{g.esrb}</span>}
                {g.genres.length > 0 && <span className="text-[15px] text-white/65">{g.genres.slice(0, 3).join(', ')}</span>}
              </div>
              {upcoming && date && <Countdown start={date} today={today} className="mt-6 short:hidden" />}
              <div className="mt-7 flex flex-wrap gap-3">
                {date && <a href={googleUrl({ title: g.name, start: date, slug: g.slug })} {...out} className="btn btn-mark"><Icon name="plus" />Add to calendar</a>}
                {ev && <SaveButton id={ev.id} title={g.name} label variant="glass" />}
                {g.website && <a href={g.website} {...out} className="btn btn-glass">Official site<Icon name="external" className="h-3.5 w-3.5" /></a>}
              </div>
            </div>
          </div>
        </section>

        {facts.length > 0 && (
          <div className="wrap">
            <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-line/10 ${COLS[facts.length]}`}>
              {facts.map(([label, value]) => (
                <div key={label} className="bg-panel px-5 py-4 odd:last:col-span-2 md:px-6 md:py-5 md:odd:last:col-span-1">
                  <dt className="text-[13px] font-medium text-dim">{label}</dt>
                  <dd className="mt-1 leading-snug font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="wrap grid grid-cols-1 gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
          <div className="min-w-0 space-y-14">
            {g.description && <section aria-labelledby="about-title"><h2 id="about-title" className="h-section mb-6">About</h2><About text={g.description} title={g.name} /></section>}
            {g.trailer && <section aria-labelledby="trailer-title"><h2 id="trailer-title" className="h-section mb-6">Trailer</h2><video controls preload="none" poster={g.trailer.preview} src={g.trailer.src} className="aspect-video w-full rounded-panel bg-black" /></section>}
            {g.screenshots.length > 0 && <section aria-labelledby="shots-title"><h2 id="shots-title" className="h-section mb-6">Screenshots</h2><Gallery shots={g.screenshots} name={g.name} /></section>}
            {!g.description && !g.trailer && !g.screenshots.length && <p className="text-lg text-muted">No description or media yet. They usually appear closer to launch.</p>}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {g.stores.length > 0 && (
              <Panel title="Where to buy">
                <ul className="-my-1 divide-y divide-line/10">
                  {g.stores.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center justify-between gap-3 py-3 text-[15px] font-semibold decoration-line/40 underline-offset-[3px] hover:underline">{s.name}<Icon name="external" className="h-3.5 w-3.5 text-muted" /></a></li>)}
                </ul>
              </Panel>
            )}
            {details.length > 0 && (
              <Panel title="Details">
                <dl className="-my-1 divide-y divide-line/10">
                  {details.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-3 text-[15px]"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
                </dl>
              </Panel>
            )}
            {g.tags.length > 0 && (
              <Panel title="Tags">
                <ul className="flex flex-wrap gap-1.5">{g.tags.map((t) => <li key={t} className="rounded-full px-3 py-1 text-[13px] text-muted ring-1 ring-line/12 ring-inset">{t}</li>)}</ul>
              </Panel>
            )}
          </aside>
        </div>
        <Rail title="Around the same time" lede="Other games and tournaments within ten days of this one." items={nearby} today={today} />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </>
  )
}
