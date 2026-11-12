import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { CardGrid, ListPage, Part, Pills, ldList, listedGame } from '@/components/lists'
import { PLATFORMS, PLATFORM_PAGES, type Platform, monthLabel, monthPath, platformPath, range } from '@/lib/core'
import { platformReleases } from '@/lib/data'

// One platform's releases: /releases/pc, /releases/playstation, /releases/xbox, /releases/nintendo, /releases/mobile

export const revalidate = 3600
export const generateStaticParams = async () => [] // built on the first visit, then refreshed every hour

type Props = { params: Promise<{ key: string }> }
const SHOWN = 96
const NAMES: Record<Platform, string> = { PC: 'PC', PlayStation: 'PlayStation', Xbox: 'Xbox', Nintendo: 'Nintendo', Mobile: 'mobile' }
const load = cache(platformReleases)
const platformOf = async (params: Props['params']) => PLATFORM_PAGES[(await params).key]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await platformOf(params)
  if (!p) return { title: 'Releases' }
  const { ahead } = await load(p), first = ahead.slice(0, 3).map((e) => e.title)
  return {
    title: `Upcoming ${NAMES[p]} games`, alternates: { canonical: platformPath(p) },
    description: `The most awaited ${NAMES[p]} games with a release date, soonest first${first.length ? `: ${first.join(', ')} and more` : ''}. Dates from IGDB and Steam, checked every hour.`,
  }
}

export default async function PlatformPage({ params }: Props) {
  const p = await platformOf(params)
  if (!p) notFound()
  const { today, ahead, recent } = await load(p), name = NAMES[p], title = `Upcoming ${name} games`, path = platformPath(p)
  const shown = ahead.slice(0, SHOWN), last = shown[shown.length - 1]
  const intro = ahead.length
    ? `The ${ahead.length} most awaited ${name} games with a release date, soonest first${shown.length < ahead.length ? `; the first ${SHOWN} are here, through ${range(last.start)}` : ''}. Dates from IGDB and Steam, checked every hour.`
    : `No ${name} game in the calendar has a release date yet. Dates from IGDB and Steam, checked every hour.`
  const months = [...new Set(ahead.map((e) => e.start.slice(0, 7)))].slice(0, 12)
  return (
    <ListPage trail={[['Dropdate', '/'], ['Releases', '/releases'], [name === 'mobile' ? 'Mobile' : name, path]]} title={title} intro={intro} ld={ldList(title, path, shown.map(listedGame))}>
      <Part id="platforms" title="Other platforms"><Pills label="Platforms" links={PLATFORMS.map((x) => [x, platformPath(x)])} current={path} /></Part>
      {shown.length > 0 && <Part id="ahead" title="Coming up"><CardGrid items={shown} today={today} /></Part>}
      {recent.length > 0 && (
        <Part id="recent" title="Out in the last 30 days" lede={`The ${name} games released this past month, most followed first.`}>
          <CardGrid items={recent.slice(0, 12)} today={today} />
        </Part>
      )}
      {months.length > 0 && <Part id="months" title="By month"><Pills label="Months" links={months.map((m) => [monthLabel(m), monthPath(m)])} /></Part>}
    </ListPage>
  )
}
