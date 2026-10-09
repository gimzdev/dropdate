import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { hasDb } from '@/lib/db'
import { NO_STORE, fail } from '@/lib/guard'
import { prune } from '@/lib/library'

// The daily clean-up, called by Vercel Cron (see vercel.json) with the CRON_SECRET it sends as a bearer token
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(503, 'CRON_SECRET is not set.')
  const want = Buffer.from(`Bearer ${secret}`), given = Buffer.from(req.headers.get('authorization') ?? '')
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, 'Not allowed.')
  try {
    const done = await prune()
    return NextResponse.json(done, { status: done.failed ? 500 : 200, headers: NO_STORE }) // a step that failed shows as a failed run in Vercel's cron logs
  } catch (e) {
    console.error('[dropdate] the daily clean-up failed:', e instanceof Error ? e.message : e)
    return fail(500, 'The clean-up failed. See the logs.')
  }
}
