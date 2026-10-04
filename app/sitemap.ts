import type { MetadataRoute } from 'next'
import { publicSiteOrigin } from '@/lib/seo'

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicSiteOrigin()
  return origin ? [{ url: origin + '/', changeFrequency: 'monthly', priority: 1 }, { url: origin + '/privacy', changeFrequency: 'monthly', priority: 0.3 }, { url: origin + '/terms', changeFrequency: 'monthly', priority: 0.3 }] : []
}
