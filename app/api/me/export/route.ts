import { NextResponse } from 'next/server'
import { NO_STORE, guard } from '@/lib/guard'
import { exportData } from '@/lib/library'

// Everything held about you, as a file
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await guard(req, { rate: ['export', 10, 3600] })
  if (user instanceof Response) return user
  return new NextResponse(JSON.stringify(await exportData(user), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="dropdate-my-data.json"', ...NO_STORE },
  })
}
