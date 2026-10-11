'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Oops } from '@/components/site'

export default function Failed({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <Oops code={500} title="Something broke on our side" text="That was not you. Try again, and if it keeps happening, the calendar is still there.">
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => (retry ?? reset)()} className="btn btn-mark">Try again</button>
        <Link href="/" className="btn btn-line">Back to the calendar</Link>
      </div>
      {error.digest && <p className="mt-8 text-[13px] text-dim">Reference <code className="font-mono">{error.digest}</code></p>}
    </Oops>
  )
}
