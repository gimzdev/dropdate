import { ImageResponse } from 'next/og'
import { Logo } from '@/components/logo'

export const alt = 'Dropdate: every game release and esports tournament in one calendar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// The preview card shown when a link to the site is shared, drawn at build time
export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 80, color: '#f1f5f9', background: 'radial-gradient(circle at 85% 0%, #1d4ed8 0%, #0b1220 45%, #06080e 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 48, fontWeight: 800 }}><Logo size={84} />Dropdate</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>Every game drop. One calendar.</div>
        <div style={{ fontSize: 34, color: '#94a3b8' }}>Releases and esports tournaments, refreshed hourly.</div>
      </div>
    </div>,
    size,
  )
}
