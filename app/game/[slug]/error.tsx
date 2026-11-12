'use client'

import Link from 'next/link'
import { Oops } from '@/components/site'

// A game page fails only when its source (IGDB or Steam) does not answer and no earlier copy of it was kept
export default function BackSoon({ reset }: { reset: () => void }) {
  return (
    <Oops code={503} title="This game is back soon" text="The game database did not answer just now. The page tries again on its own; the calendar is still here.">
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="btn btn-mark">Try again</button>
        <Link href="/" className="btn btn-line">Back to the calendar</Link>
      </div>
    </Oops>
  )
}
