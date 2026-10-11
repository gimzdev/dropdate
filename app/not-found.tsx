import Link from 'next/link'
import { Oops } from '@/components/site'

export default function NotFound() {
  return (
    <Oops code={404} title="We couldn’t find that page" text="The link may be broken, or the game may have left the calendar.">
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-mark">Back to the calendar</Link>
        <Link href="/?focus=1#explore" className="btn btn-line">Search games</Link>
      </div>
    </Oops>
  )
}
