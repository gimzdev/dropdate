import Link from 'next/link'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="wrap flex min-h-[80svh] flex-col justify-center pt-28 pb-16">
        <p aria-hidden className="display text-[clamp(7rem,16vw,13rem)] leading-[0.8] text-raised">404</p>
        <h1 className="display mt-8 text-[clamp(2.5rem,3vw+1.5rem,4rem)]">We couldn’t find that page</h1>
        <p className="mt-4 max-w-md text-lg text-muted">The link may be broken, or the game may have left the calendar.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn btn-mark">Back to the calendar</Link>
          <Link href="/?focus=1#explore" className="btn btn-line">Search games</Link>
        </div>
      </main>
      <Footer />
    </>
  )
}
