import { ImageResponse } from 'next/og'
import { Logo } from '@/components/icons'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

/** The iOS home screen icon: the mark on black, drawn at build time (iOS ignores SVG icons). */
export default function AppleIcon() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}><Logo size={136} /></div>, size)
}
