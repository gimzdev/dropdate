import Link from 'next/link'
import type { ReactNode } from 'react'
import { type Ev, SITE } from '@/lib/core'
import { Footer } from './site'
import { Card, Header, Icon, Section } from './ui'

// The pages people search for (app/releases, app/esports): where the page sits, its heading, one opening line, the list, and
// the same list for search engines (ItemList and BreadcrumbList).

const GRID = 'grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-3 xl:grid-cols-4'
const LT = String.fromCharCode(92) + 'u003c' // "<" written so a title can never close the script tag

export type Trail = [name: string, path: string][]
export interface Listed { name: string; url: string; item?: Record<string, unknown> }

export const ldList = (name: string, path: string, items: Listed[]) => ({
  '@context': 'https://schema.org', '@type': 'ItemList', name, url: `${SITE}${path}`, numberOfItems: items.length,
  itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...(x.item ? { item: x.item } : { name: x.name, url: x.url }) })),
})
const ldTrail = (trail: Trail) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${path}` })),
})
/** A game as a list item: its page on Dropdate. */
export const listedGame = (e: Ev): Listed => ({ name: e.title, url: `${SITE}/game/${e.slug}` })

export function ListPage({ trail, title, intro, ld, children }: { trail: Trail; title: string; intro: ReactNode; ld?: Record<string, unknown>; children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="pt-28 md:pt-36">
        <div className="wrap pb-12 md:pb-14">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium text-muted">
              {trail.slice(0, -1).map(([name, path], i) => (
                <li key={path} className="inline-flex items-center gap-2">
                  {i === 0 && <Icon name="left" className="h-3.5 w-3.5" />}
                  <Link href={path} className="transition hover:text-fg">{name}</Link>
                  <span aria-hidden className="text-dim">/</span>
                </li>
              ))}
              <li aria-current="page" className="text-fg">{trail[trail.length - 1][0]}</li>
            </ol>
          </nav>
          <h1 className="display mt-6 max-w-[20ch] text-[clamp(3rem,4vw+1.75rem,5.5rem)]">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">{intro}</p>
        </div>
        {children}
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([ldTrail(trail), ...(ld ? [ld] : [])]).replace(/</g, LT) }} />
    </>
  )
}

/** Games as cards; their hover frames load on the first hover. */
export const CardGrid = ({ items, today }: { items: Ev[]; today: string }) => (
  <div className={GRID}>{items.map((e) => <Card key={e.id} e={e} today={today} row lazy />)}</div>
)

/** A titled part of a list page. */
export const Part = ({ id, title, lede, children }: { id: string; title: string; lede?: string; children: ReactNode }) => (
  <Section id={id} title={title} lede={lede}>{children}</Section>
)

/** Links as a row of pills: the months, the platforms, the games. `current` is shown, not linked. */
export function Pills({ label, links, current }: { label: string; links: [name: string, path: string][]; current?: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {links.map(([name, path]) => (
          <li key={path}>
            {path === current
              ? <span aria-current="page" className="btn btn-sm bg-fg text-bg">{name}</span>
              : <Link href={path} className="btn btn-sm btn-line">{name}</Link>}
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Earlier and later, at the foot of a list: two plain links. */
export function Around({ before, after }: { before?: [string, string]; after?: [string, string] }) {
  if (!before && !after) return null
  return (
    <nav aria-label="Around this page" className="mt-10 flex flex-wrap justify-between gap-3">
      {before ? <Link href={before[1]} rel="prev" className="btn btn-line"><Icon name="left" />{before[0]}</Link> : <span />}
      {after && <Link href={after[1]} rel="next" className="btn btn-line">{after[0]}<Icon name="right" /></Link>}
    </nav>
  )
}
