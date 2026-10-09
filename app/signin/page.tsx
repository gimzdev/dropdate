import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Resume, SignIn } from '@/components/signin'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'
import { me, methods } from '@/lib/auth'
import { ACCOUNTS, safeNext } from '@/lib/core'
import { devCodes } from '@/lib/mail'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }
const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)

export default async function SignInPage({ searchParams }: Props) {
  if (!ACCOUNTS) notFound()
  const sp = await searchParams, next = safeNext(first(sp.next))
  const signedIn = !!(await me(await headers(), { render: true }).catch(() => null))
  return (
    <>
      <Header />
      <main id="main" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <div className="mx-auto max-w-md">
          <h1 className="display text-[clamp(3rem,4vw+1.75rem,5rem)]">{signedIn ? 'Welcome back' : 'Sign in'}</h1>
          {!signedIn && <p className="mt-4 mb-10 text-lg text-muted">Keep a wishlist of what is coming and a list of the games you have played, on every device.</p>}
        </div>
        {signedIn ? <Resume next={next} />
          : <SignIn next={next} methods={methods()} dev={devCodes() && !process.env.RESEND_API_KEY} failed={!!(first(sp.error) || first(sp.failed))} />}
      </main>
      <Footer />
    </>
  )
}
