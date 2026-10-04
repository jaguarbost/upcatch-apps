import type { Metadata } from 'next'

export const PRODUCTION_ORIGIN = 'https://upcatch.co.uk'
export const SITE_NAME = 'UpCatch'
export const SITE_TITLE = 'Never go alone | Meet people around you instantly | UpCatch'
export const SITE_DESCRIPTION = 'Meet new people in Manchester for coffee, lunch and conversation. UpCatch brings platonic friendships into real life at public venues.'

export function publicSiteOrigin(): string | undefined {
  if (process.env.VERCEL_ENV === 'production') return PRODUCTION_ORIGIN
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  const deployed = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
  const candidates = [configured, deployed ? 'https://' + deployed : undefined]
  for (const value of candidates) {
    if (!value) continue
    try {
      const url = new URL(value)
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (local && process.env.VERCEL_ENV) continue
      if (url.protocol === 'https:' || (local && url.protocol === 'http:')) return url.origin
    } catch { /* Omit invalid canonical URLs rather than publishing a placeholder. */ }
  }
  return PRODUCTION_ORIGIN
}

const origin = publicSiteOrigin()
export const siteMetadata: Metadata = {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: { default: SITE_TITLE, template: '%s | UpCatch' },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: 'Social networking',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.ico?v=upcatch-3', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/icon.svg?v=upcatch-3', sizes: 'any', type: 'image/svg+xml' },
      { url: '/icon-light-32x32.png?v=upcatch-3', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png?v=upcatch-3', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website', locale: 'en_GB', siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION,
    images: [{ url: '/icon-512.png?v=upcatch-3', width: 512, height: 512, alt: 'UpCatch — make friends in real life' }],
  },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION, images: ['/icon-512.png?v=upcatch-3'] },
  robots: { index: process.env.VERCEL_ENV !== 'preview', follow: true },
}
