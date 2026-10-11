import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Profile } from '@/components/profile'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'
import { type Me, me } from '@/lib/auth'
import { ACCOUNTS, type LibItem, iso } from '@/lib/core'
import { library } from '@/lib/library'

export const metadata: Metadata = { title: 'Your games', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const down = (what: string) => (e: unknown) => { console.error(`[dropdate] could not ${what}:`, e instanceof Error ? e.message : e); return undefined }

export default async function ProfilePage() {
  if (!ACCOUNTS) notFound()
  const user: Me | null | undefined = await me(await headers(), { render: true }).catch(down('check the session'))
  if (user === null) redirect('/signin?next=/profile')
  const items: LibItem[] | undefined = user ? await library(user.id).catch(down('load the library')) : undefined
  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <h1 className="display text-[clamp(3rem,4vw+1.75rem,5.5rem)]">Your games</h1>
        {user && items ? <Profile user={{ email: user.email, since: user.since }} items={items} today={iso(new Date())} />
          : <p className="mt-6 max-w-xl text-lg text-muted">Your account is unavailable for a moment. Reload the page in a minute.</p>}
      </main>
      <Footer />
    </>
  )
}
