// "Tell me" (server only): an email on a saved game's release day and when its date moves, for the games where someone asked for
// it. Off until asked for, game by game. The daily cron (app/api/cron) sends it: one email a day at most for each person, listing
// everything, and no more emails a day for everyone together than TELL_PER_DAY, like the sign-in codes' caps. Every email names
// Dropdate and who runs it, and carries a link that stops them all, no sign-in needed (Canada's anti-spam law asks for both).
// It holds nothing to sell: no store links, no prices.
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { type Ev, SITE, gap, iso, longDate, monthLabel } from './core'
import { fromSource, getEvents } from './data'
import { canEmail, esc, hit, mailFrame, mailbox, q, secret, sendMail } from './db'
import { LibraryError, saveGames } from './library'

/** Emails a day to everyone together: room for the sign-in codes within Resend's free plan (100 a day). */
const TELL_PER_DAY = 50
/** Games looked up at their source per run when the calendar does not hold them (the sources' quotas are shared). */
const LOOKUPS_PER_RUN = 30

// ── The stop link: a key made from the account's id and the site's secret, so it works without signing in ──

const stopKey = (userId: string) => createHmac('sha256', secret()).update(`tell-stop:${userId}`).digest('base64url')
export const stopUrl = (userId: string, api = false) => `${SITE}${api ? '/api/tell/stop' : '/tell/stop'}?u=${encodeURIComponent(userId)}&k=${stopKey(userId)}`
export function stopAllowed(userId: string, key: string) {
  const want = Buffer.from(stopKey(userId)), given = Buffer.from(key)
  return !!userId && given.length === want.length && timingSafeEqual(given, want)
}
/** Turns "Tell me" off for every game of one account. */
export const stopAll = (userId: string) => q('update dd_library set tell_at = null where user_id = $1 and tell_at is not null', [userId])

// ── Asking ──

/** The calendar's copy of one game, stored as the game's details: the date someone sees when they ask is the date they hold. */
async function freshen(key: string) {
  const calendar = await getEvents().catch(() => null), ev = calendar?.events.find((e) => e.id === key)
  if (ev) await saveGames([ev])
}

/** "Tell me" on or off for a game on someone's wishlist that is not out yet. Returns whether it is on. */
export async function setTell(userId: string, key: string, on: boolean): Promise<boolean> {
  if (!on) {
    await q('update dd_library set tell_at = null where user_id = $1 and game_key = $2', [userId, key])
    return false
  }
  await freshen(key)
  const rows = await q(
    `update dd_library l set tell_at = coalesce(l.tell_at, now()), told_on = g.starts_on, told_tba = g.tba, told_out = false
     from dd_game g where l.user_id = $1 and l.game_key = $2 and g.key = l.game_key and l.wishlisted_at is not null
       and g.kind = 'release' and (g.starts_on is null or g.tba or g.starts_on > current_date)
     returning 1`, [userId, key])
  if (!rows.length) throw new LibraryError(409, 'Emails are for games on your wishlist that are not out yet.')
  return true
}

// ── The daily run ──

interface Row { user_id: string; email: string; key: string; title: string; slug: string | null; starts_on: string | null; tba: boolean; told_on: string | null; told_tba: boolean }
interface Notice { row: Row; out: boolean }

const when = (day: string | null, tba: boolean) => (!day ? 'no date' : tba ? monthLabel(day.slice(0, 7)) : longDate(day))
const gameUrl = (r: Row) => (r.slug ? `${SITE}/game/${r.slug}` : SITE)
// "came out" when the email goes a day or two late (a run that could not send it on the day)
const comes = (n: Notice, today: string) => `${n.row.title} ${n.row.starts_on! < today ? 'came' : 'comes'} out on ${when(n.row.starts_on, false)}`
const line = (n: Notice, today: string) => (n.out ? `${comes(n, today)}.` : `${n.row.title} moved from ${when(n.row.told_on, n.row.told_tba)} to ${when(n.row.starts_on, n.row.tba)}.`)

function email(userId: string, notices: Notice[], today: string) {
  const one = notices.length === 1 ? notices[0] : null
  const subject = one ? (one.out ? comes(one, today) : `New date for ${one.row.title}: ${when(one.row.starts_on, one.row.tba)}`)
    : `${notices.length} games on your wishlist: release days and new dates`
  const contact = (process.env.PRIVACY_CONTACT || '').trim() || 'https://gimzdev.com/#contact'
  const why = 'You get this because you asked Dropdate to tell you about these games.'
  const stop = stopUrl(userId), who = `Dropdate (dropdate.net) is made by Gimz. Contact: ${contact}`
  const text = [...notices.flatMap((n) => [line(n, today), gameUrl(n.row), '']), why, `Stop these emails: ${stop}`, '', who].join('\n')
  const html = mailFrame(`${notices.map((n) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.5">${esc(line(n, today))}<br><a href="${esc(gameUrl(n.row))}" style="color:#111">${esc(n.row.title)} on Dropdate</a></p>`).join('\n')}
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#555">${esc(why)} <a href="${esc(stop)}" style="color:#555">Stop these emails</a>.<br>${esc(who)}</p>`, 480)
  // One click in the mail app stops them too (RFC 8058): the app posts to this address
  return { subject, text, html, headers: { 'List-Unsubscribe': `<${stopUrl(userId, true)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }
}

/** For the daily cron: the dates of the games people follow, made fresh, then one email per person with what changed. */
export async function tellRun(deadline: number) {
  const out = { tellSent: 0, tellWaiting: 0 }
  if (!canEmail()) return out
  const keys = (await q<{ key: string }>('select distinct game_key as key from dd_library where tell_at is not null and not told_out')).map((r) => r.key)
  if (!keys.length) return out
  // Fresh dates: from the calendar for the games it holds, from their source for a few more
  const calendar = await getEvents().catch(() => null), byId = new Map((calendar && !calendar.error ? calendar.events : []).map((e) => [e.id, e]))
  const fresh: Ev[] = keys.flatMap((k) => byId.get(k) ?? [])
  for (const k of keys.filter((k) => !byId.has(k) && !k.startsWith('ps-')).slice(0, LOOKUPS_PER_RUN)) {
    if (Date.now() > deadline - 30_000) break
    try { const e = await fromSource(k); if (e) fresh.push(e) } catch {} // unreachable: tomorrow
  }
  await saveGames(fresh)

  const rows = await q<Row>(
    `select l.user_id, u.email, l.game_key as key, g.title, g.slug, to_char(g.starts_on, 'YYYY-MM-DD') as starts_on, g.tba, to_char(l.told_on, 'YYYY-MM-DD') as told_on, l.told_tba
     from dd_library l join dd_game g on g.key = l.game_key join "user" u on u.id = l.user_id
     where l.tell_at is not null and not l.told_out`)
  const today = iso(new Date()), people = new Map<string, Notice[]>(), missed: Row[] = []
  for (const r of rows) {
    const out = !!r.starts_on && !r.tba && r.starts_on <= today
    if (out && gap(r.starts_on!, today) > 2) { missed.push(r); continue } // out days ago (the email could not go): too late to say so
    if (out || r.starts_on !== r.told_on || r.tba !== r.told_tba) people.set(r.user_id, [...(people.get(r.user_id) ?? []), { row: r, out }])
  }
  for (const r of missed) await q('update dd_library set told_out = true where user_id = $1 and game_key = $2', [r.user_id, r.key])

  // Release days first, then the rest; each person once a day at most, everyone together TELL_PER_DAY
  const queue = [...people.entries()].sort(([, a], [, b]) => Number(b.some((n) => n.out)) - Number(a.some((n) => n.out)))
  for (const [userId, notices] of queue) {
    if (Date.now() > deadline - 5_000) { out.tellWaiting++; continue }
    const to = notices[0].row.email
    if (!(await hit(`tell:${mailbox(to)}`, 1, 20 * 3600)).allowed || !(await hit('tell-all', TELL_PER_DAY, 86400)).allowed) { out.tellWaiting++; continue }
    try {
      await sendMail({ to, ...email(userId, notices, today) })
    } catch (e) {
      console.error('[dropdate] a release email could not be sent:', e instanceof Error ? e.message : e)
      out.tellWaiting++
      continue // nothing marked: tomorrow it goes again
    }
    out.tellSent++
    for (const { row, out: released } of notices) {
      await q('update dd_library set told_on = $3::date, told_tba = $4, told_out = told_out or $5 where user_id = $1 and game_key = $2', [userId, row.key, row.starts_on, row.tba, released])
    }
  }
  return out
}

