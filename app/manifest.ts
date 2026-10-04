import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'UpCatch — Make friends in real life',
    short_name: 'UpCatch',
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f3f5f8',
    theme_color: '#f3f5f8',
    icons: [
      { src: '/icon-192.png?v=upcatch-2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=upcatch-2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png?v=upcatch-2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}