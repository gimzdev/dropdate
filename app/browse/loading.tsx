import { Header } from '@/components/ui'

/** What shows while the first page of games is on its way. */
export default function Loading() {
  return (
    <>
      <Header />
      <main id="main" aria-busy="true" className="wrap pt-28 pb-20 md:pt-36 md:pb-28">
        <h1 className="display mt-6 text-[clamp(3rem,4vw+1.75rem,5.5rem)]">Browse every game</h1>
        <div className="mt-8 h-14 max-w-3xl rounded-full bg-panel sm:h-16" />
        <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[16/10] animate-pulse rounded-art bg-panel" />)}
        </div>
      </main>
    </>
  )
}
