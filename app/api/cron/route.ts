import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { NO_STORE, fail } from '@/lib/auth'
import { hasDb } from '@/lib/db'
import { prune } from '@/lib/library'
import { tellRun } from '@/lib/tell'

// The daily run, called by Vercel Cron (vercel.json) with CRON_SECRET as a bearer token: the clean-up, then the "Tell me" emails
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!hasDb()) return fail(404, 'Accounts are not turned on.')
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(503, 'CRON_SECRET is not set.')
  const want = Buffer.from(`Bearer ${secret}`), given = Buffer.from(req.headers.get('authorization') ?? '')
  if (given.length !== want.length || !timingSafeEqual(given, want)) return fail(401, 'Not allowed.')
  try {
    const started = Date.now(), done = await prune()
    const told = await tellRun(started + maxDuration * 1000).catch((e) => {
      console.error('[dropdate] the release emails failed:', e instanceof Error ? e.message : e)
      return { tellFailed: 1 }
    })
    const failed = done.failed + ('tellFailed' in told ? 1 : 0)
    return NextResponse.json({ ...done, ...told, failed }, { status: failed ? 500 : 200, headers: NO_STORE }) // a failed step shows as a failed run in Vercel's cron logs
  } catch (e) {
    console.error('[dropdate] the daily clean-up failed:', e instanceof Error ? e.message : e)
    return fail(500, 'The clean-up failed. See the logs.')
  }
}
