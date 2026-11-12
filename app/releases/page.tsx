import type { Metadata } from 'next'
import { ListPage, Part, Pills, ldList } from '@/components/lists'
import { PLATFORMS, SITE, iso, monthLabel, monthPath, platformPath } from '@/lib/core'
import { releaseMonths } from '@/lib/data'

export const revalidate = 3600

const title = 'Game releases by month'
export const metadata: Metadata = {
  title, alternates: { canonical: '/releases' },
  description: 'The most awaited games of every month, by day, and what is coming to PC, PlayStation, Xbox, Nintendo and mobile. Dates from IGDB and Steam.',
}

export default async function Releases() {
  const months = await releaseMonths(), shown = months.filter((m) => m.count === undefined || m.count > 0), now = iso(new Date()).slice(0, 4)
  // This year first, then the years ahead, then the years before
  const years = [...new Set(shown.map((m) => m.month.slice(0, 4)))].sort((a, b) => (a < now) !== (b < now) ? (a < now ? 1 : -1) : a < now ? b.localeCompare(a) : a.localeCompare(b))
  return (
    <ListPage trail={[['Dropdate', '/'], ['Releases', '/releases']]} title={title} intro="The most awaited games of each month, by day, and what is coming to each platform. Dates from IGDB and Steam."
      ld={ldList(title, '/releases', shown.map((m) => ({ name: `Game releases in ${monthLabel(m.month)}`, url: `${SITE}${monthPath(m.month)}` })))}>
      <Part id="platforms" title="By platform">
        <Pills label="Platforms" links={PLATFORMS.map((p) => [p, platformPath(p)])} />
      </Part>
      {years.map((y) => (
        <Part key={y} id={`y${y}`} title={y}>
          <Pills label={`Months of ${y}`} links={shown.filter((m) => m.month.startsWith(y)).map((m) => [monthLabel(m.month).split(' ')[0], monthPath(m.month)])} />
        </Part>
      ))}
    </ListPage>
  )
}
