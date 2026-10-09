import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { NO_STORE, fail, guard } from '@/lib/guard'
import { deleteAccount, libraryKeys } from '@/lib/library'

// Who you are and what you have marked (every button on the site reads this once), and deleting your account
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await guard(req)
  if (user instanceof Response) return user
  try {
    return NextResponse.json({ email: user.email, since: user.since, ...(await libraryKeys(user.id)) }, { headers: NO_STORE })
  } catch (e) {
    console.error('[dropdate] could not read the library:', e instanceof Error ? e.message : e)
    return fail(503, 'Accounts are unavailable right now. Try again in a minute.') // never a 401: the browser would think the session ended
  }
}

export async function DELETE(req: Request) {
  const user = await guard(req, { write: true, rate: ['delete', 5, 3600] })
  if (user instanceof Response) return user
  // Erase first (the sessions go with the account); only then is this browser told to forget its cookie
  try { await deleteAccount(user) } catch (e) {
    console.error('[dropdate] could not delete an account:', e instanceof Error ? e.message : e)
    return fail(500, 'We could not delete the account. Nothing was changed. Try again in a minute.')
  }
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE })
  // Next turns "Max-Age=0" into an ordinary empty cookie when the same request also renewed the session, so each carries a past date too
  try {
    const { authCookies: c } = await auth().$context
    for (const { name, attributes: a } of [c.sessionToken, c.sessionData, c.dontRememberToken])
      res.headers.append('set-cookie', `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${a.path || '/'}; HttpOnly; SameSite=Lax${a.secure || name.startsWith('__Secure-') ? '; Secure' : ''}`)
  } catch { /* the account is gone, so the cookie no longer opens anything */ }
  return res
}
