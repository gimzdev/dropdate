import type { Metadata } from 'next'
import Link from 'next/link'
import { Doc } from '@/components/site'
import { stopAllowed } from '@/lib/tell'

// The page the "Stop these emails" link opens: one button, no sign-in.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Stop the release emails', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function StopTelling({ searchParams }: Props) {
  const p = await searchParams, user = one(p.u), key = one(p.k)
  if (one(p.done)) {
    return (
      <Doc title="Emails stopped" intro="You will get no more release emails from Dropdate. Your wishlist is as it was.">
        <p className="text-lg text-muted">To have them again for a game, open it on Dropdate and press Tell me.</p>
        <Link href="/" className="btn btn-mark mt-8">Back to the calendar</Link>
      </Doc>
    )
  }
  if (!stopAllowed(user, key)) {
    return (
      <Doc title="This link does not work" intro="It may have been cut short when it was copied. Use the link at the bottom of the latest email, or turn the emails off on your profile.">
        <Link href="/profile" className="btn btn-mark">Your profile</Link>
      </Doc>
    )
  }
  return (
    <Doc title="Stop the release emails" intro="No more emails about release days and new dates, for any game. Your wishlist stays as it is.">
      <form method="post" action={`/api/tell/stop?u=${encodeURIComponent(user)}&k=${encodeURIComponent(key)}&from=page`}>
        <button type="submit" className="btn btn-mark">Stop the emails</button>
      </form>
    </Doc>
  )
}
