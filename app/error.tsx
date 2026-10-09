'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'

// What a visitor sees when a page breaks while it is being made: the site around it stays, and there is a way to try again or to go back.
export default function Failed({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <>
      <Header />
      <main id="main" className="wrap flex min-h-[80svh] flex-col justify-center pt-28 pb-16">
        <p aria-hidden className="display text-[clamp(7rem,16vw,13rem)] leading-[0.8] text-raised">500</p>
        <h1 className="display mt-8 text-[clamp(2.5rem,3vw+1.5rem,4rem)]">Something broke on our side</h1>
        <p className="mt-4 max-w-md text-lg text-muted">That was not you. Try again, and if it keeps happening, the calendar is still there.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => (retry ?? reset)()} className="btn btn-mark">Try again</button>
          <Link href="/" className="btn btn-line">Back to the calendar</Link>
        </div>
        {error.digest && <p className="mt-8 text-[13px] text-dim">Reference <code className="font-mono">{error.digest}</code></p>}
      </main>
      <Footer />
    </>
  )
}
