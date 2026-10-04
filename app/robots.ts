import type { MetadataRoute } from 'next'
import { publicSiteOrigin } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin()
  return {
    rules: process.env.VERCEL_ENV === 'preview'
      ? { userAgent: '*', disallow: '/' }
      : { userAgent: '*', allow: '/', disallow: ['/upcatch-ops', '/api/', '/auth/', '/app', '/account', '/onboarding', '/start', '/live', '/venues'] },
    ...(origin ? { sitemap: origin + '/sitemap.xml', host: origin } : {}),
  }
}
