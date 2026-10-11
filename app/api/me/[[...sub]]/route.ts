import { NextResponse } from 'next/server'
import { NO_STORE, auth, fail, guard } from '@/lib/auth'
import { deleteAccount, exportData, libraryKeys } from '@/lib/library'

// GET /api/me: who you are and what you have marked (every button on the site reads it once). GET /api/me/export: everything held
// about you, as a file. DELETE /api/me: the account, for good.
export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ sub?: string[] }> }

export async function GET(req: Request, { params }: Ctx) {
  const sub = (await params).sub?.join('/')
  if (sub && sub !== 'export') return fail(404, 'Not found.')
  const user = await guard(req, sub ? { rate: ['export', 10, 3600] } : {})
  if (user instanceof Response) return user
  if (sub) return new NextResponse(JSON.stringify(await exportData(user), null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="dropdate-my-data.json"', ...NO_STORE } })
  try {
    return NextResponse.json({ email: user.email, since: user.since, ...(await libraryKeys(user.id)) }, { headers: NO_STORE })
  } catch (e) {
    console.error('[dropdate] could not read the library:', e instanceof Error ? e.message : e)
    return fail(503, 'Accounts are unavailable right now. Try again in a minute.') // never a 401: the browser would think the session ended
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if ((await params).sub) return fail(404, 'Not found.')
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
