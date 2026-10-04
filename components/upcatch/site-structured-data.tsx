import { publicSiteOrigin, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo'

export function SiteStructuredData() {
  const origin = publicSiteOrigin()
  if (!origin) return null
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': origin + '/#organization', name: SITE_NAME, url: origin,
        logo: { '@type': 'ImageObject', url: origin + '/icon-512.png', width: 512, height: 512 },
        description: SITE_DESCRIPTION,
        areaServed: { '@type': 'City', name: 'Manchester', containedInPlace: { '@type': 'Country', name: 'United Kingdom' } } },
      { '@type': 'WebSite', '@id': origin + '/#website', url: origin, name: SITE_NAME, inLanguage: 'en-GB',
        description: SITE_DESCRIPTION, publisher: { '@id': origin + '/#organization' } },
      { '@type': 'WebPage', '@id': origin + '/#webpage', url: origin, name: SITE_NAME + ' — make friends in Manchester',
        description: SITE_DESCRIPTION, inLanguage: 'en-GB', isPartOf: { '@id': origin + '/#website' },
        about: { '@id': origin + '/#organization' } },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
