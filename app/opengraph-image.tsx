import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { Logo } from '@/components/logo'

export const alt = 'Dropdate: every game release and esports tournament in one calendar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const WEEK = [['Mon', 6], ['Tue', 7], ['Wed', 8], ['Thu', 9], ['Fri', 10], ['Sat', 11], ['Sun', 12]] as const
// The image renderer reads WOFF, not WOFF2, so the site's typeface comes from the static package
const font = (weight: number) => readFile(join(process.cwd(), `node_modules/@fontsource/mona-sans/files/mona-sans-latin-${weight}-normal.woff`))

// The preview card shown when a link to the site is shared: a week on the wall calendar, one day circled
export default async function OpenGraphImage() {
  const [heavy, regular] = await Promise.all([font(800), font(400)]).catch(() => [])
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px', background: '#000', color: '#f4f3ef', fontFamily: 'Mona Sans' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 40, fontWeight: 800, letterSpacing: -1 }}><Logo size={60} />Dropdate</div>
      <div style={{ display: 'flex' }}>
        {WEEK.map(([d, n], k) => (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', width: 150, paddingLeft: k ? 24 : 0, borderLeft: k ? '2px solid #26282c' : '0' }}>
            <div style={{ fontSize: 26, color: k === 2 ? '#ffd23f' : '#a3a29c' }}>{d}</div>
            <div style={{ position: 'relative', display: 'flex', fontSize: 100, fontWeight: 800, letterSpacing: -4, lineHeight: 1, marginTop: 6 }}>
              {n}
              {k === 2 && (
                <svg width="150" height="130" viewBox="0 0 100 80" style={{ position: 'absolute', left: -40, top: -12 }}>
                  <path d="M58 6C30 3 6 17 6 39c0 22 22 36 48 35 26-1 41-17 40-36C93 19 77 6 47 9" fill="none" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1.02 }}>Every game drop, one calendar.</div>
        <div style={{ fontSize: 30, color: '#a3a29c' }}>Game releases and esports tournaments, refreshed every hour.</div>
      </div>
    </div>,
    { ...size, fonts: heavy && regular ? [{ name: 'Mona Sans', data: heavy, weight: 800 }, { name: 'Mona Sans', data: regular, weight: 400 }] : undefined },
  )
}
