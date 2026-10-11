import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, Logo } from './icons'
import { Header, HomeLink } from './ui'

export const REPO = process.env.NEXT_PUBLIC_REPO_URL || 'https://github.com/gimzdev/dropdate'
/** A link: a new tab for other sites, a plain link for the feeds, client-side for pages. */
export const A = ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
  to.startsWith('/') && !to.startsWith('/api/') ? <Link href={to} className={className}>{children}</Link>
    : <a href={to} className={className} {...(to.startsWith('http') && { target: '_blank', rel: 'noopener noreferrer' })}>{children}</a>

const COLUMNS: [string, string[][]][] = [
  ['Calendar', [['This week', '/#week'], ['Most anticipated', '/#upcoming'], ['Esports', '/#esports'], ['Search', '/#explore'], ['Browse every game', '/browse']]],
  ['Project', [['Source on GitHub', REPO], ['Terms and privacy', '/legal'], ['CC0 license', 'https://creativecommons.org/publicdomain/zero/1.0/']]],
]
const credit = 'underline decoration-line/30 underline-offset-2 transition hover:text-fg'

export function Footer() {
  return (
    <footer className="border-t border-line/10">
      <div className="wrap grid grid-cols-1 gap-12 py-14 md:grid-cols-[1.4fr_repeat(2,1fr)] md:py-16">
        <div>
          <HomeLink className="flex w-fit items-center gap-2"><Logo size={28} /><span className="display text-[22px]">Dropdate</span></HomeLink>
          <p className="mt-4 max-w-xs text-[15px] text-muted">Game releases and esports tournaments in one calendar, refreshed every hour.</p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <ul className="mt-4 space-y-3 text-[15px] text-muted">
              {links.map(([name, to]) => <li key={name}><A to={to} className="inline-flex items-center gap-1.5 transition hover:text-fg">{name}{to.startsWith('http') && <Icon name="external" className="h-3.5 w-3.5 opacity-60" />}</A></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wrap flex flex-col justify-between gap-3 border-t border-line/10 py-6 text-[13px] text-dim sm:flex-row">
        <p>Game data and artwork from <A to="https://www.igdb.com" className={credit}>IGDB</A> and <A to="https://store.steampowered.com" className={credit}>Steam</A>, esports from <A to="https://pandascore.co" className={credit}>PandaScore</A>. Names, scores and images belong to their owners.</p>
        <p className="shrink-0">© {new Date().getFullYear()} Dropdate</p>
      </div>
    </footer>
  )
}

export function Doc({ title, intro, toc, children }: { title: string; intro: string; toc?: string[][]; children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-muted transition hover:text-fg"><Icon name="left" className="h-3.5 w-3.5" />Dropdate</Link>
        <h1 className="display mt-6 text-[clamp(3rem,4vw+1.75rem,5.5rem)]">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{intro}</p>
        <div className={`mt-14 md:mt-20 ${toc ? 'grid grid-cols-1 gap-12 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16' : ''}`}>
          {toc && (
            <nav aria-label="On this page" className="hidden lg:block">
              <ul className="sticky top-24 space-y-1 border-l border-line/10">
                {toc.map(([id, label]) => <li key={id}><a href={`#${id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15px] text-muted transition hover:border-fg hover:text-fg">{label}</a></li>)}
              </ul>
            </nav>
          )}
          <div className="min-w-0 max-w-3xl space-y-16">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  )
}
export const DocSection = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="display mb-5 text-[2.1rem] md:text-[2.5rem]">{title}</h2>
    {children}
  </section>
)

/** The error and not-found pages: the site around them stays, with a way on. */
export const Oops = ({ code, title, text, children }: { code: number; title: string; text: string; children: ReactNode }) => (
  <>
    <Header />
    <main id="main" className="wrap flex min-h-[80svh] flex-col justify-center pt-28 pb-16">
      <p aria-hidden className="display text-[clamp(7rem,16vw,13rem)] leading-[0.8] text-raised">{code}</p>
      <h1 className="display mt-8 text-[clamp(2.5rem,3vw+1.5rem,4rem)]">{title}</h1>
      <p className="mt-4 max-w-md text-lg text-muted">{text}</p>
      {children}
    </main>
    <Footer />
  </>
)
