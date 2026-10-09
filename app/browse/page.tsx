import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { cache } from 'react'
import { BrowseShell, Pager } from '@/components/browse'
import { Footer } from '@/components/site'
import { Card, Header, Icon } from '@/components/ui'
import { BROWSE_PAGE, BROWSE_PAGES, type BrowseQuery, browseHref, iso, lite, parseBrowse } from '@/lib/core'
import { type BrowseError, browseGames, getEvents } from '@/lib/data'
import { allow, clientIp } from '@/lib/limit'

// Every game RAWG knows, not only what is out lately or coming: a year, a platform, a genre, a name, sorted by popularity, score or date.
// The list is made here for the address in the bar, so a page of results can be shared, and the controls only change that address.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const GRID = 'grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 sm:gap-y-9 lg:grid-cols-3 xl:grid-cols-4'
const box = 'rounded-panel border border-dashed border-line/12 px-6 py-16 text-center'
const PROBLEMS = {
  busy: ['Browsing is resting for today', 'To stay inside the free allowance of the game database, only so many new pages are looked up each day, and today’s are used. Pages seen before still open, and the search on the home page keeps working. Try again tomorrow.'],
  down: ['The games did not load', 'The game database is not answering right now. Try again in a minute.'],
  fast: ['That was a lot of pages', 'Give it a minute, then carry on.'],
} as const
const link = 'font-semibold underline decoration-line/30 underline-offset-4 transition hover:decoration-mark'

/** The games for an address (as JSON of the query) or the reason there are none; made once per request, which the page and its metadata both ask for. */
const look = cache(async (key: string) => {
  const query = JSON.parse(key) as BrowseQuery
  let found: Awaited<ReturnType<typeof browseGames>> | undefined, problem: keyof typeof PROBLEMS | undefined
  if (!(await allow(`browse:${clientIp({ headers: await headers() })}`, 90, 60))) problem = 'fast'
  else try { found = await browseGames(query) } catch (e) { problem = (e as BrowseError).why === 'busy' ? 'busy' : 'down' }
  return { found, problem }
})
const queryOf = async (searchParams: Props['searchParams']) => parseBrowse(await searchParams, +iso(new Date()).slice(0, 4))

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { problem } = await look(JSON.stringify(await queryOf(searchParams)))
  const narrowed = Object.keys(await searchParams).length > 0 || !!problem // the plain page is for search engines; its thousands of variations, and a page that could not load, are not
  return {
    title: 'Browse every game',
    description: 'Half a million games, from the first arcade cabinets to what comes out next year: browse by year, platform and genre, or search by name.',
    alternates: { canonical: '/browse' },
    ...(narrowed && { robots: { index: false, follow: true } }),
  }
}

export default async function Browse({ searchParams }: Props) {
  const today = iso(new Date()), thisYear = +today.slice(0, 4), query = await queryOf(searchParams)
  const { found, problem } = await look(JSON.stringify(query))
  const calendar = new Map(((await getEvents()).events).map((e) => [e.id, lite(e)])) // a game the calendar holds is shown as the calendar has it
  const items = found?.items ?? [], count = found?.count ?? 0, pages = found?.pages ?? 0
  const filtered = !!(query.q || query.year || query.platform || query.genre || query.sort !== 'popular')

  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-muted transition hover:text-fg"><Icon name="left" className="h-3.5 w-3.5" />Dropdate</Link>
        <h1 className="display mt-6 text-[clamp(3rem,4vw+1.75rem,5.5rem)]">Browse every game</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">Half a million games, from the first arcade cabinets to what comes out next year. Pick a year, a platform or a genre, or search by name.</p>

        <BrowseShell query={query} thisYear={thisYear}>
          <div id="results" className="scroll-mt-44" />
          {problem ? (
            <div role="status" className={`${box} mt-10`}>
              <p className="text-lg font-semibold">{PROBLEMS[problem][0]}</p>
              <p className="mx-auto mt-2 max-w-md text-muted">{PROBLEMS[problem][1]}</p>
              {problem !== 'busy' && <a href={browseHref(query)} className="btn btn-mark mt-7">Try again</a>}
            </div>
          ) : (
            <>
              <p aria-live="polite" className="mt-6 mb-8 flex min-h-5 flex-wrap items-baseline gap-x-5 gap-y-1.5 text-[15px] text-muted">
                {items.length > 0 && ( // (RAWG counts games without a date or artwork too; a page of those has no cards to count)
                  <>
                    <span><span className="font-semibold text-fg">{count.toLocaleString('en-US')}</span> {count === 1 ? 'game' : 'games'}</span>
                    {pages === BROWSE_PAGES && <span>The first {(BROWSE_PAGE * BROWSE_PAGES).toLocaleString('en-US')} are in these pages: a year, a platform or a genre narrows the rest down.</span>}
                    {filtered && <Link href="/browse" className={link}>Clear filters</Link>}
                  </>
                )}
              </p>
              {items.length > 0 ? (
                <div className={GRID}>
                  {items.map((e) => {
                    const ours = calendar.get(e.id), shown = ours ?? e
                    return <Card key={e.id} e={shown} today={today} row when={shown.start < today ? shown.start.slice(0, 4) : undefined} outside={!ours} />
                  })}
                </div>
              ) : (
                <div className={box}>
                  <p className="text-lg font-semibold">{query.page > 1 ? 'Nothing on this page' : 'No games match'}</p>
                  <p className="mx-auto mt-2 max-w-sm text-muted">{query.page > 1 ? 'That is past the last page.' : 'Try fewer words, another spelling, or fewer filters.'}</p>
                  <Link href={query.page > 1 ? browseHref({ ...query, page: 1 }) : '/browse'} className="btn btn-mark mt-7">{query.page > 1 ? 'Back to the first page' : 'Clear filters'}</Link>
                </div>
              )}
              {pages > 1 && <Pager query={query} pages={pages} />}
              {query.sort === 'score' && items.length > 0 && <p className="mx-auto mt-10 max-w-md text-center text-[13px] text-dim">Scores are Metacritic’s, as RAWG reports them. Many recent games do not have one yet.</p>}
            </>
          )}
        </BrowseShell>
      </main>
      <Footer />
    </>
  )
}
