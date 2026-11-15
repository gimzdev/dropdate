import type { Metadata, ResolvingMetadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { About, Dates, Gallery, Rail, Trailer } from '@/components/game'
import { Footer } from '@/components/site'
import { SupportNote } from '@/components/support'
import { BigDate, Countdown, FeedPanel, Header, Icon, Progress, SaveButton, TellButton } from '@/components/ui'
import { ACCOUNTS, SITE, canTell, googleUrl, iso, longDate, monthLabel, monthPath, period, platformPath, scoreTone, shift, srcSet, status } from '@/lib/core'
import { getEvents, getGame, getSimilar, monthBounds } from '@/lib/data'
import { canEmail } from '@/lib/db'

export const revalidate = 21600
export const generateStaticParams = async () => [] // built on the first visit, then kept and refreshed every 6 hours

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const g = await getGame((await params).slug).catch(() => null)
  if (!g) return { title: 'Game' }
  // "Released" for a game that is out, "Releases" for one ahead; a game dated by its month, quarter or year says that much
  const today = iso(new Date()), when = g.released ? ` ${g.released <= today ? 'Released' : 'Releases'} ${longDate(g.released)}.` : g.loose ? ` ${g.loose.start < today ? 'Released in' : 'Set for'} ${period(g.loose)}.` : ''
  const description = `${g.name}: release date, ${g.trailer ? 'trailer, ' : ''}screenshots and platforms.${when}`.slice(0, 200)
  // the game's art, or the site's link picture (app/opengraph-image.jpg) for a game without any
  const images = g.image ? [g.image] : ((await parent).openGraph?.images ?? [])
  return {
    title: `${g.name}: release date${g.trailer ? ' and trailer' : ''}`, description, alternates: { canonical: `/game/${g.slug}` },
    openGraph: { type: 'website', siteName: 'Dropdate', url: `/game/${g.slug}`, title: g.name, description, images }, twitter: { card: 'summary_large_image' },
  }
}

const Panel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-panel bg-panel p-5 md:p-6"><h2 className="mb-3 text-[15px] font-semibold text-muted">{title}</h2>{children}</section>
)
const Part = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section aria-labelledby={`${id}-title`}><h2 id={`${id}-title`} className="h-section mb-6">{title}</h2>{children}</section>
)
const COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4']
const out = { target: '_blank', rel: 'noopener noreferrer' }
const filled = (rows: string[][]) => rows.filter(([, v]) => v)

// Where to buy: AFFILIATES (the settings) adds a store's parameter to its links, which are then marked sponsored
const AFFILIATES = new Map((process.env.AFFILIATES || '').split(',').flatMap((pair) => {
  const at = pair.indexOf('='), store = pair.slice(0, at).trim().toLowerCase(), tag = pair.slice(at + 1).trim().replace(/^[?&]/, '')
  return at > 0 && tag ? [[store, tag] as const] : []
}))
const shop = (s: { name: string; url: string }) => {
  const tag = AFFILIATES.get(s.name.toLowerCase())
  return tag ? { ...s, url: `${s.url}${s.url.includes('?') ? '&' : '?'}${tag}`, sponsored: true } : { ...s, sponsored: false }
}

export default async function GamePage({ params }: Props) {
  const [g, data] = await Promise.all([getGame((await params).slug), getEvents()])
  if (!g) notFound()
  // The hourly calendar has the freshest date; then the game's own exact day; then the month, quarter or year IGDB gives (no day: tba)
  const { today } = data, ev = data.events.find((e) => e.id === g.id), loose = ev || g.released ? undefined : g.loose
  const date = ev?.start ?? g.released ?? loose?.start, tba = ev ? !!ev.tba : !!loose, span = ev ? ev.span : loose?.span
  const st = date ? status({ kind: 'release', start: date, tba, span }, today) : undefined, upcoming = !!date && date > today, released = !!date && date <= today
  const named = date && tba ? period({ start: date, span }) : '', gone = tba && !!date && date < today // gone: that month, quarter or year is over
  // Around the release day the visitor's own clock decides between the countdown, "Out today" and "Out now": this server's day is UTC, and the page is kept for hours
  const clocked = !!date && !tba && date >= shift(today, -1)
  const similar = await getSimilar(g.id), dates = g.dates ?? [] // by region and platform, when they are not all the same day
  const facts = filled([
    [dates.length ? 'First release' : 'Release date', date ? (tba ? (gone ? named : `${named}, exact ${span ? 'date' : 'day'} not announced`) : longDate(date)) : 'Not announced yet'],
    ['Platforms', g.platforms.join(', ')], ['Developer', g.developers.slice(0, 2).join(', ')], ['Publisher', g.publishers.slice(0, 2).join(', ')],
  ])
  const details = filled([
    ['Average playtime', g.playtime ? `${g.playtime} hours` : ''], [g.scoreFrom ? 'Critics (IGDB)' : 'Metacritic', g.metacritic ? `${g.metacritic} out of 100` : 'No score yet'],
    ['Player rating (IGDB)', g.rating ? `${g.rating.toFixed(1)} out of 5` : ''], ['Age rating', g.age ?? ''],
  ])
  // The lists this game is on: its month, and while it is ahead, its platforms (app/releases)
  const bounds = monthBounds(today), month = date?.slice(0, 7)
  const lists: [string, string][] = [
    ...(month && !span && month >= bounds.first && month <= bounds.last ? [[`${monthLabel(month)} releases`, monthPath(month)] as [string, string]] : []),
    ...(upcoming ? (ev?.platforms ?? []).map((p): [string, string] => [`Upcoming ${p === 'Mobile' ? 'mobile' : p} games`, platformPath(p)]) : []),
  ]
  // datePublished is as exact as the date is known: a day, a month (2026-11) or a year
  const org = (name: string) => ({ '@type': 'Organization', name })
  const ld = {
    '@context': 'https://schema.org', '@type': 'VideoGame', name: g.name, url: `${SITE}/game/${g.slug}`, image: g.image, description: g.description?.slice(0, 300),
    datePublished: !date ? undefined : !tba ? date : span ? date.slice(0, 4) : date.slice(0, 7), genre: g.genres, gamePlatform: g.platforms,
    author: g.developers.length ? g.developers.map(org) : undefined, publisher: g.publishers.map(org),
  }
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
            <Link href="/#explore" className="inline-flex min-h-6 w-fit items-center gap-1.5 text-[15px] font-medium text-white/75 transition hover:text-white"><Icon name="left" className="h-3.5 w-3.5" />Calendar</Link>
            <div className="mt-auto pt-16">
              {date && !gone ? <BigDate date={date} tba={tba} span={span} size="text-[clamp(5rem,4vw+3.25rem,8.5rem)]" unknown={span ? 'Exact date not announced' : 'Exact day not announced'} label={facts[0][1]} />
                : <p className="text-xl font-semibold">{gone ? `Released in ${named}` : 'Release date not announced yet'}</p>}
              <h1 className="display mt-6 max-w-[18ch] text-[clamp(2.75rem,3.4vw+1.6rem,5.25rem)]">{g.name}</h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
                {st && !upcoming && !clocked && <span className={`text-[15px] font-semibold ${st.tone === 'live' ? 'text-go' : 'text-white/75'}`}>{st.label}</span>}
                {!!g.metacritic && <span title={g.scoreFrom ? 'Average of critics’ reviews, from IGDB' : 'Metacritic score'} className={`tag text-[13px] ${scoreTone(g.metacritic)}`}>{g.metacritic} {g.scoreFrom ? 'Critics' : 'Metacritic'}</span>}
                {g.age && <span className="rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ring-white/30 ring-inset">{g.age}</span>}
                {g.genres.length > 0 && <span className="text-[15px] text-white/65">{g.genres.slice(0, 3).join(', ')}</span>}
              </div>
              {clocked && <Countdown start={date} today={today} className={`mt-6 ${upcoming ? 'short:hidden' : ''}`} />}
              <div className="mt-7 flex flex-wrap gap-3">
                {date && !gone && <a href={googleUrl({ title: g.name, start: date, slug: g.slug, tba, span })} {...out} className="btn btn-mark"><Icon name="plus" />Add to calendar</a>}
                {(ev || ACCOUNTS) && <SaveButton id={g.id} title={g.name} label variant="glass" needsAccount={!ev} />}
                {ACCOUNTS && canEmail() && !gone && canTell({ kind: 'release', start: date ?? '', tba }, today) && <TellButton id={g.id} title={g.name} />}
                {ACCOUNTS && released && <Progress id={g.id} title={g.name} />}
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

        {ev && upcoming && (
          <div className="wrap">
            <FeedPanel feed={`${SITE}/api/calendar.ics?ids=${g.id}`} title={<>Follow this release in your calendar</>} as="h2" className="mt-4">
              <p className="mt-1 max-w-xl text-[15px] text-muted">A live feed of this one game. If its date moves, your calendar follows.</p>
            </FeedPanel>
          </div>
        )}

        <div className="wrap grid grid-cols-1 gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
          <div className="min-w-0 space-y-14">
            {g.description && <Part id="about" title="About"><About text={g.description} title={g.name} /></Part>}
            {g.trailer && <Part id="trailer" title="Trailer"><Trailer trailer={g.trailer} title={g.name} poster={g.screenshots[1] ?? g.screenshots[0] ?? g.image} /></Part>}
            {g.screenshots.length > 0 && <Part id="shots" title="Screenshots"><Gallery shots={g.screenshots} name={g.name} /></Part>}
            {!g.description && !g.trailer && !g.screenshots.length && <p className="text-lg text-muted">No description or media yet. They usually appear closer to launch.</p>}
          </div>
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {g.stores.length > 0 && (
              <Panel title="Where to buy">
                <ul className="-my-1 divide-y divide-line/10">
                  {g.stores.map(shop).map((s) => <li key={s.url}><a href={s.url} target="_blank" rel={s.sponsored ? 'sponsored noopener noreferrer' : 'noopener noreferrer nofollow'} className="flex items-center justify-between gap-3 py-3 text-[15px] font-semibold decoration-line/40 underline-offset-[3px] hover:underline">{s.name}<Icon name="external" className="h-3.5 w-3.5 text-muted" /></a></li>)}
                </ul>
                {g.stores.some((s) => shop(s).sponsored) && <p className="mt-3 text-[13px] text-dim">Some of these links pay Dropdate a share of a sale, at no cost to you.</p>}
              </Panel>
            )}
            {dates.length > 0 && (
              <Panel title="Release dates"><Dates dates={dates} /></Panel>
            )}
            <Panel title="Details">
              <dl className="-my-1 divide-y divide-line/10">
                {details.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-3 text-[15px]"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
              </dl>
            </Panel>
            {lists.length > 0 && (
              <Panel title="More releases">
                <ul className="-my-1 divide-y divide-line/10">
                  {lists.map(([name, to]) => <li key={to}><Link href={to} className="flex items-center justify-between gap-3 py-3 text-[15px] font-semibold decoration-line/40 underline-offset-[3px] hover:underline">{name}<Icon name="right" className="h-3.5 w-3.5 text-muted" /></Link></li>)}
                </ul>
              </Panel>
            )}
            {g.tags.length > 0 && (
              <Panel title="Tags"><ul className="flex flex-wrap gap-1.5">{g.tags.map((t) => <li key={t} className="rounded-full px-3 py-1 text-[13px] text-muted ring-1 ring-line/12 ring-inset">{t}</li>)}</ul></Panel>
            )}
            <SupportNote small>Dropdate is free and has no ads. Found what you needed?</SupportNote>
          </aside>
        </div>
        <Rail title="Similar games" lede="Games players of this one also like." items={similar} today={today} />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
    </>
  )
}
