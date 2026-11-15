import type { Metadata, ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { GRID, ListPage, Part, Pills, ldList, listedGame } from '@/components/lists'
import { DayGrid, FeedPanel } from '@/components/ui'
import { PLATFORMS, PLATFORM_PAGES, type Platform, SITE, monthLabel, monthPath, platformPath, range } from '@/lib/core'
import { platformReleases } from '@/lib/data'
import { card } from '@/lib/meta'

// One platform's releases: /releases/pc, /releases/playstation, /releases/xbox, /releases/nintendo, /releases/mobile

export const revalidate = 3600
export const generateStaticParams = async () => [] // built on the first visit, then refreshed every hour

type Props = { params: Promise<{ key: string }> }
const SHOWN = 96
const NAMES: Record<Platform, string> = { PC: 'PC', PlayStation: 'PlayStation', Xbox: 'Xbox', Nintendo: 'Nintendo', Mobile: 'mobile' }
const load = cache(platformReleases)
const platformOf = async (params: Props['params']) => PLATFORM_PAGES[(await params).key]

export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const p = await platformOf(params)
  if (!p) return { title: 'Releases' }
  const { today, ahead } = await load(p), first = ahead.filter((e) => e.start >= today).slice(0, 3).map((e) => e.title), title = `Upcoming ${NAMES[p]} games`
  const description = `The most awaited ${NAMES[p]} games with a release date, soonest first${first.length ? `: ${first.join(', ')} and more` : ''}. Dates from IGDB and Steam, checked every hour.`
  return { title, description, alternates: { canonical: platformPath(p) }, ...(await card(parent, title, description, platformPath(p))) }
}

export default async function PlatformPage({ params }: Props) {
  const p = await platformOf(params)
  if (!p) notFound()
  const { today, ahead: around, recent } = await load(p), name = NAMES[p], title = `Upcoming ${name} games`, path = platformPath(p)
  // `around` and `recent` reach a day across today: the lists are split at the visitor's own day in the browser (DayGrid)
  const ahead = around.filter((e) => e.start >= today), shown = ahead.slice(0, SHOWN), last = shown[shown.length - 1], wide = around.slice(0, around.length - ahead.length + SHOWN)
  const intro = ahead.length
    ? `The ${ahead.length} most awaited ${name} games with a release date, soonest first${shown.length < ahead.length ? `; the first ${SHOWN} are here, through ${range(last.start)}` : ''}. Dates from IGDB and Steam, checked every hour.`
    : `No ${name} game in the calendar has a release date yet. Dates from IGDB and Steam, checked every hour.`
  const months = [...new Set(ahead.map((e) => e.start.slice(0, 7)))].slice(0, 12)
  return (
    <ListPage trail={[['Dropdate', '/'], ['Releases', '/releases'], [name === 'mobile' ? 'Mobile' : name, path]]} title={title} intro={intro} ld={ldList(title, path, shown.map(listedGame))}>
      <Part id="platforms" title="Other platforms"><Pills label="Platforms" links={PLATFORMS.map((x) => [x, platformPath(x)])} current={path} /></Part>
      {shown.length > 0 && (
        <Part id="ahead" title="Coming up">
          <DayGrid items={wide} today={today} ahead max={SHOWN} className={GRID} />
          <FeedPanel feed={`${SITE}/api/calendar.ics?type=release&platform=${p.toLowerCase()}`} title={<>Add upcoming {name} games to your calendar</>} className="mt-14">
            <p className="mt-1 max-w-xl text-[15px] text-muted">A live feed of the upcoming {name} releases in the calendar. When a date moves, your calendar follows.</p>
          </FeedPanel>
        </Part>
      )}
      {recent.some((e) => e.start < today) && (
        <Part id="recent" title="Out in the last 30 days" lede={`The ${name} games released this past month, most followed first.`}>
          <DayGrid items={recent.slice(0, 40)} today={today} max={12} className={GRID} />
        </Part>
      )}
      {months.length > 0 && <Part id="months" title="By month"><Pills label="Months" links={months.map((m) => [monthLabel(m), monthPath(m)])} /></Part>}
    </ListPage>
  )
}
