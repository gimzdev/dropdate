// Checks the calendar feed and the date wording, with sample events and no network: npm test (Node 22.6 or newer, which reads lib/core.ts as it is).
// The feed is read by Google, Apple and Outlook, so its rules are pinned here: RFC 5545 lines, escaping, stable UIDs, all-day dates.
import assert from 'node:assert/strict'
import { calTitle, genreName, googleUrl, ics, period, periodShort, srcSet, status } from '../lib/core.ts'

const ev = (id, title, start, more = {}) => ({ id, title, kind: 'release', start, thumb: '', platforms: ['PC', 'PlayStation'], genres: ['Adventure', 'Shooter'], pop: 1, slug: `game-${id}`, ...more })
const AT = '2026-11-14T12:34:56.789Z'
const events = [
  ev('igdb-1', 'Plain Game', '2026-11-19'),
  ev('igdb-2', 'Commas, semicolons; and \\ backslashes\nover two lines', '2026-12-31'),
  ev('igdb-3', 'Ōkami 🎮 Édition Définitive: a very long title that has to be folded over several lines because it is far longer than seventy-five bytes — 日本語のタイトル', '2028-02-29'),
  ev('igdb-4', 'Month Only', '2026-11-30', { tba: true }),
  ev('ps-5', 'Sample League Finals', '2026-12-30', { kind: 'tournament', end: '2027-01-02', slug: undefined, url: 'https://example.com/a b\r\nBEGIN:VEVENT', platforms: [], genres: ['Counter-Strike'], prize: '$1,250,000' }),
  ev('steam-6', 'No Date', ''),
  ev('igdb-7', 'Bad Date', '2026-13'),
]
const feed = ics(events, AT), bytes = Buffer.from(feed, 'utf8')

// Lines: CRLF only, none over 75 bytes, each one whole UTF-8 (a fold never cuts a character in two)
assert.ok(feed.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'), 'starts with BEGIN:VCALENDAR and VERSION')
assert.ok(feed.endsWith('END:VCALENDAR\r\n'), 'ends with END:VCALENDAR and a line break')
assert.equal(feed.replace(/\r\n/g, '').search(/[\r\n]/), -1, 'no bare CR or LF')
const utf8 = new TextDecoder('utf-8', { fatal: true })
let start = 0
for (let i = 0; i < bytes.length - 1; i++) {
  if (bytes[i] !== 13 || bytes[i + 1] !== 10) continue
  const line = bytes.subarray(start, i)
  assert.ok(line.length <= 75, `a line of ${line.length} bytes: ${line.toString().slice(0, 40)}`)
  assert.doesNotThrow(() => utf8.decode(line), 'a fold cut a character in two')
  start = i + 2
}

// Unfolded, the feed is one property a line
const lines = feed.replace(/\r\n /g, '').split('\r\n'), blocks = []
for (const l of lines) {
  if (l === 'BEGIN:VEVENT') blocks.push({})
  else if (blocks.length && l !== 'END:VEVENT' && l !== 'END:VCALENDAR' && l) blocks[blocks.length - 1][l.slice(0, l.indexOf(':'))] = l.slice(l.indexOf(':') + 1)
}
assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, 5, 'events without a real date are left out')
assert.equal(lines.filter((l) => l === 'END:VEVENT').length, 5)
for (const need of ['PRODID:-//Dropdate//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Dropdate', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']) assert.ok(lines.includes(need), need)
assert.ok(!/TZID|VTIMEZONE/.test(feed), 'all-day events carry no time zone')

// UIDs: one per event, the same on every run
assert.deepEqual(blocks.map((b) => b.UID), ['igdb-1@dropdate', 'igdb-2@dropdate', 'igdb-3@dropdate', 'igdb-4@dropdate', 'ps-5@dropdate'])
assert.equal(ics(events, AT), feed, 'the same events and time give the same bytes')
assert.deepEqual([...ics(events, '2027-01-01T00:00:00Z').matchAll(/UID:(.*)\r\n/g)].map((m) => m[1]), blocks.map((b) => b.UID), 'UIDs do not depend on when the feed is made')

// DTSTAMP: UTC, the time the data was read; a bad time falls back to now
for (const b of blocks) assert.equal(b.DTSTAMP, '20261114T123456Z')
assert.match(ics(events, 'not a date'), /DTSTAMP:\d{8}T\d{6}Z\r\n/)
assert.match(ics(events), /DTSTAMP:\d{8}T\d{6}Z\r\n/)

// All-day dates: DTEND is the day after the last day, across a month, a year and a leap day
const days = blocks.map((b) => [b['DTSTART;VALUE=DATE'], b['DTEND;VALUE=DATE']])
assert.deepEqual(days, [['20261119', '20261120'], ['20261231', '20270101'], ['20280229', '20280301'], ['20261130', '20261201'], ['20261230', '20270103']])

// Text: \ ; , and line breaks escaped, nothing else changed
assert.equal(blocks[1].SUMMARY, 'Commas\\, semicolons\\; and \\\\ backslashes\\nover two lines')
assert.equal(blocks[2].SUMMARY, events[2].title)
assert.equal(blocks[3].SUMMARY, 'Month Only (November 2026\\, day not announced)')
assert.equal(blocks[0].DESCRIPTION, 'PC\\, PlayStation · Adventure\\, Shooter\\nhttps://dropdate.net/game/game-igdb-1')
assert.equal(blocks[3].DESCRIPTION, 'Set for November 2026. The day is not announced yet.\\nPC\\, PlayStation · Adventure\\, Shooter\\nhttps://dropdate.net/game/game-igdb-4')
assert.equal(blocks[4].DESCRIPTION, 'Counter-Strike · Prize pool $1\\,250\\,000\\nhttps://example.com/a%20b%0D%0ABEGIN:VEVENT')
assert.equal(blocks[4].URL, 'https://example.com/a%20b%0D%0ABEGIN:VEVENT', 'a link stays on one line')
assert.equal(blocks[0].URL, 'https://dropdate.net/game/game-igdb-1')
for (const b of blocks) assert.equal(b.TRANSP, 'TRANSPARENT')

// An empty calendar is still a calendar
assert.ok(ics([], AT).startsWith('BEGIN:VCALENDAR\r\n') && ics([], AT).endsWith('END:VCALENDAR\r\n'))

// Dates without a day: what they are called, and what a card says about them
const month = { kind: 'release', start: '2026-11-30', tba: true }, quarter = { kind: 'release', start: '2027-06-30', tba: true, span: 'quarter' }, year = { kind: 'release', start: '2027-12-31', tba: true, span: 'year' }
assert.deepEqual([period(month), period(quarter), period(year)], ['November 2026', 'Q2 2027', '2027'])
assert.deepEqual([periodShort(month), periodShort(quarter), periodShort(year)], ['Nov', 'Q2', '2027'])
assert.deepEqual(status(month, '2026-11-14'), { label: 'November 2026', tone: 'future' })
assert.deepEqual(status(quarter, '2026-11-14'), { label: 'Q2 2027', tone: 'future' })
assert.deepEqual(status(year, '2026-11-14'), { label: '2027', tone: 'future' })
assert.deepEqual(status(month, '2026-12-01'), { label: 'Out now', tone: 'past' })
assert.deepEqual(status({ kind: 'release', start: '2026-11-14' }, '2026-11-14'), { label: 'Out today', tone: 'live' })
assert.deepEqual(status({ kind: 'release', start: '2026-11-15' }, '2026-11-14'), { label: 'Tomorrow', tone: 'soon' })
assert.deepEqual(status({ kind: 'release', start: '2026-11-19' }, '2026-11-14'), { label: 'In 5 days', tone: 'soon' })
assert.deepEqual(status({ kind: 'release', start: '2027-01-15' }, '2026-11-14'), { label: 'In 2 months', tone: 'future' })
assert.deepEqual(status({ kind: 'tournament', start: '2026-11-10', end: '2026-11-15' }, '2026-11-14'), { label: 'Live now', tone: 'live' })
assert.deepEqual(status({ kind: 'tournament', start: '2026-11-10', end: '2026-11-13' }, '2026-11-14'), { label: 'Ended', tone: 'past' })
assert.equal(calTitle({ title: 'Year Only', ...year }), 'Year Only (2027, date not announced)')
assert.equal(calTitle({ title: 'Plain', start: '2026-11-19' }), 'Plain')
const g = new URL(googleUrl({ title: 'Month Only', start: '2026-11-30', tba: true, slug: 'month-only' })).searchParams
assert.deepEqual([g.get('text'), g.get('dates'), g.get('details')], ['Month Only (November 2026, day not announced)', '20261130/20261201', 'https://dropdate.net/game/month-only'])

// Artwork: the sizes a picture comes in (a small slot loads the small file)
const IMG = 'https://images.igdb.com/igdb/image/upload'
assert.equal(srcSet(`${IMG}/t_screenshot_big/abc.jpg`), `${IMG}/t_screenshot_med/abc.jpg 569w, ${IMG}/t_screenshot_big/abc.jpg 889w`)
assert.equal(srcSet(`${IMG}/t_1080p/abc.jpg`), `${IMG}/t_screenshot_big/abc.jpg 889w, ${IMG}/t_720p/abc.jpg 1280w, ${IMG}/t_1080p/abc.jpg 1920w`)
assert.equal(srcSet('https://example.com/header.jpg'), undefined)
assert.equal(srcSet(undefined), undefined)

// Genres: Steam's word leads to the calendar's one name (old feed links with ?genre=Simulation keep working)
assert.deepEqual(['Simulation', 'RPG', 'Sports', 'Indie', 'constructor', '__proto__', ''].map(genreName), ['Simulator', 'Role-playing (RPG)', 'Sport', 'Indie', 'constructor', '__proto__', ''])

console.log('  calendar feed and dates: all checks passed')
