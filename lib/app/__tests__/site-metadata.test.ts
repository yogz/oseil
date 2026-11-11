import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRIVATE_METADATA, PUBLIC_PATHS, SITE_METADATA, SITE_STRUCTURED_DATA, SITE_URL } from '../site-metadata'
import { CATEGORY_ORDER } from '@/lib/catalog'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

const ROOT = join(__dirname, '..', '..', '..')

// What a messaging app reads to draw the preview of a shared link (Nicolas, 10 November 2026).
test('the preview has a title, a sentence, the site’s name and its language', () => {
  expect(SITE_METADATA.openGraph).toMatchObject({
    title: 'Oseil · Ton argent, en 100 carrés',
    description: 'Tout ton patrimoine d’un coup d’œil. Chiffré sur ton appareil : même nous ne pouvons pas le lire.',
    siteName: 'Oseil',
    locale: 'fr_FR',
    type: 'website',
  })
})

// The image's address must be absolute: the address of the site, oseil.fr since 10 November 2026.
// It stayed on stefin.vercel.app after the move, and the preview image pointed at a redirect.
test('the addresses of the preview are built on the address of the site', () => {
  expect(SITE_URL).toBe('https://oseil.fr')
  expect(String(SITE_METADATA.metadataBase)).toBe('https://oseil.fr/')
})

// Opened to the search engines by Nicolas on 11 November 2026: the public pages only.
test('the public pages can be found by the search engines, each under its own title', () => {
  expect(SITE_METADATA.robots).toEqual({ index: true, follow: true })
  expect(SITE_METADATA.title).toMatchObject({ template: '%s · Oseil' })
})

test('the screens of the app and of the account stay out of the search engines, the tab still reads « Oseil »', () => {
  expect(PRIVATE_METADATA.robots).toEqual({ index: false, follow: false })
  expect(PRIVATE_METADATA.title).toEqual({ absolute: 'Oseil' })
  // Importing the layouts here would bring Supabase along: their source is read instead.
  for (const layout of ['app/(app)/layout.tsx', 'app/(compte)/layout.tsx']) {
    expect(readFileSync(join(ROOT, layout), 'utf8')).toContain('export const metadata: Metadata = PRIVATE_METADATA')
  }
})

// The page that stops the reminder is public (opened from an e-mail, without signing in), but its
// address carries its own key: it stays out of the search engines.
test('the page that stops the reminder e-mail stays out of the search engines', () => {
  const source = readFileSync(join(ROOT, 'app/(public)/rappel/arreter/page.tsx'), 'utf8')
  expect(source).toContain("robots: { index: false, follow: false }")
})

test('robots.txt lets every crawler read the site, but not its programming interface, and names the sitemap', () => {
  expect(robots()).toEqual({
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://oseil.fr/sitemap.xml',
  })
})

test('the sitemap lists the public pages, and only them', () => {
  const urls = sitemap().map((entry) => entry.url)
  expect(urls).toEqual(PUBLIC_PATHS.map((path) => `https://oseil.fr${path}`))
  expect(urls).toContain('https://oseil.fr/')
  expect(urls).toContain('https://oseil.fr/confidentialite')
  for (const id of CATEGORY_ORDER) expect(urls).toContain(`https://oseil.fr/exemple/categorie/${id}`)
  for (const url of urls) expect(url).not.toMatch(/connexion|inscription|reglages|api/)
})

// What Google and the answer engines read to know what Oseil is. Nothing about a person.
test('the structured data says what Oseil is: a free French web application for one’s finances', () => {
  expect(SITE_STRUCTURED_DATA).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Oseil',
    url: 'https://oseil.fr',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    inLanguage: 'fr',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  })
})
