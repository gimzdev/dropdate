import { NextResponse } from 'next/server'
import { NO_STORE, fail, guard } from '@/lib/guard'
import { libraryKeys, merge } from '@/lib/library'

// Hearts left in the browser before signing in become wishlist entries: { keys: ["rawg-123", ...] }
// The answer says which of them the browser can now forget (`done`); the others are tried again later.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const user = await guard(req, { write: true, rate: ['merge', 10, 600] })
  if (user instanceof Response) return user
  const body = (await req.json().catch(() => null)) as { keys?: unknown } | null
  try {
    const { added, done } = await merge(user.id, body?.keys)
    return NextResponse.json({ added, done, ...(await libraryKeys(user.id)) }, { headers: NO_STORE })
  } catch (e) {
    console.error('[dropdate] could not merge the saved list:', e instanceof Error ? e.message : e)
    return fail(500, 'Something went wrong. Try again.')
  }
}
