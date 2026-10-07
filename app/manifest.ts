import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dropdate',
    short_name: 'Dropdate',
    description: 'Every game release and esports tournament in one calendar, refreshed every hour.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  }
}
