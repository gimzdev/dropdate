import Link from 'next/link'
import { Footer } from '@/components/site'
import { Header } from '@/components/ui'

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="wrap flex min-h-[70vh] flex-col items-center justify-center text-center">
        <p className="eyebrow mb-3">404</p>
        <h1 className="h1 mb-4">Nothing here</h1>
        <p className="mb-8 text-muted">That page or game doesn&apos;t exist (yet).</p>
        <Link href="/" className="btn-primary">Back to the calendar</Link>
      </main>
      <Footer />
    </>
  )
}
