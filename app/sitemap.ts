import type { MetadataRoute } from 'next'
import { PUBLIC_PATHS, SITE_URL } from '@/lib/app/site-metadata'

// Served at /sitemap.xml: the public pages, and only them (lib/app/site-metadata.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_URL}${path}` }))
}
