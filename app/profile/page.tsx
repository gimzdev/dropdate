import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { Profile } from '@/components/profile'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'
import { me } from '@/lib/auth'
import { ACCOUNTS, iso } from '@/lib/core'
import { library } from '@/lib/library'

export const metadata: Metadata = { title: 'Your games', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  if (!ACCOUNTS) notFound()
  let user: Awaited<ReturnType<typeof me>> = null, down = false
  try { user = await me(await headers(), { render: true }) } catch (e) { down = true; console.error('[dropdate] could not check the session:', e instanceof Error ? e.message : e) }
  if (!down && !user) redirect('/signin?next=/profile')
  const items = user ? await library(user.id).catch((e) => { down = true; console.error('[dropdate] could not load the library:', e instanceof Error ? e.message : e); return [] }) : []
  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <h1 className="display text-[clamp(3rem,4vw+1.75rem,5.5rem)]">Your games</h1>
        {user && !down ? <Profile user={{ email: user.email, since: user.since }} items={items} today={iso(new Date())} />
          : <p className="mt-6 max-w-xl text-lg text-muted">Your account is unavailable for a moment. Reload the page in a minute.</p>}
      </main>
      <Footer />
    </>
  )
}
