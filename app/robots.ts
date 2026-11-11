import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/app/site-metadata'

// Served at /robots.txt. Every crawler, the search engines' and the answer engines' alike, may read
// the site. The private screens are not listed: they send a visitor without a session to
// /connexion, and their own `noindex` (PRIVATE_METADATA) keeps them out; a `Disallow` would stop a
// crawler from ever reading it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
