import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { cache } from 'react'
import { Around, CardGrid, ListPage, Part, Pills, ldList, listedGame } from '@/components/lists'
import { MONTHS, PLATFORMS, iso, monthLabel, monthPath, nextMonth, platformPath } from '@/lib/core'
import { monthBounds, monthReleases } from '@/lib/data'

// A month's releases: /releases/2026/november (and /releases/2026/11, sent on to it)

export const revalidate = 3600
export const generateStaticParams = async () => [] // built on the first visit, then refreshed every hour

type Props = { params: Promise<{ key: string; month: string }> }
const load = cache(monthReleases)

/** The month an address names: 2026-11 for "2026" and "november" (or "11"); `exact` when it is already written as the page's own address. */
async function monthOf(params: Props['params']) {
  const { key, month } = await params, m = month.toLowerCase()
  const n = /^\d{1,2}$/.test(m) ? +m : MONTHS.indexOf(m as (typeof MONTHS)[number]) + 1
  if (!/^\d{4}$/.test(key) || n < 1 || n > 12) return null
  return { month: `${key}-${String(n).padStart(2, '0')}`, exact: month === MONTHS[n - 1] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const at = await monthOf(params), found = at && (await load(at.month))
  if (!at || !found?.events.length) return { title: 'Releases' }
  const label = monthLabel(at.month), first = found.events.filter((e) => !e.tba).sort((a, b) => b.pop - a.pop).slice(0, 3).map((e) => e.title)
  return {
    title: `Game releases in ${label}`, alternates: { canonical: monthPath(at.month) },
    description: `The most awaited games of ${label}, by day${first.length ? `: ${first.join(', ')} and more` : ''}. Release dates from ${found.updated ? 'IGDB and Steam' : 'IGDB'}.`,
  }
}

export default async function MonthPage({ params }: Props) {
  const at = await monthOf(params)
  if (!at) notFound()
  if (!at.exact) permanentRedirect(monthPath(at.month))
  const found = await load(at.month)
  if (!found?.events.length) notFound()
  const { today, events, updated } = found, label = monthLabel(at.month), title = `Game releases in ${label}`, path = monthPath(at.month)
  const dated = events.filter((e) => !e.tba), loose = events.filter((e) => e.tba), now = today.slice(0, 7), out = dated.filter((e) => e.start <= today).length
  const month = label.split(' ')[0], more = loose.length ? `, and ${loose.length} set for ${month} without a day` : ''
  const intro = at.month > now ? `The ${dated.length} most awaited games dated for ${label}${more}. Dates from IGDB and Steam, checked every hour.`
    : at.month === now ? `The ${dated.length} most awaited games of ${label}${more}: ${out} out so far, ${dated.length - out} still to come. Dates from IGDB and Steam, checked every hour.`
      : `The ${dated.length} most followed games released in ${label}, by day${more}. Dates from ${updated ? 'IGDB and Steam' : 'IGDB'}.`
  const { first, last } = monthBounds(iso(new Date())), before = nextMonth(at.month, -1), after = nextMonth(at.month)
  return (
    <ListPage trail={[['Dropdate', '/'], ['Releases', '/releases'], [label, path]]} title={title} intro={intro} ld={ldList(title, path, [...dated, ...loose].map(listedGame))}>
      {dated.length > 0 && (
        <Part id="dated" title="By release date">
          <CardGrid items={dated} today={today} />
          <Around before={before >= first ? [monthLabel(before), monthPath(before)] : undefined} after={after <= last ? [monthLabel(after), monthPath(after)] : undefined} />
        </Part>
      )}
      {loose.length > 0 && (
        <Part id="month" title={`Sometime in ${month}`} lede={`Games set for ${label} whose day ${at.month < now ? 'IGDB does not give' : 'is not announced yet'}.`}>
          <CardGrid items={loose} today={today} />
        </Part>
      )}
      <Part id="platforms" title="By platform"><Pills label="Platforms" links={PLATFORMS.map((p) => [p, platformPath(p)])} /></Part>
    </ListPage>
  )
}
