import type { Metadata } from 'next'
import { CATEGORY_ORDER } from '@/lib/catalog'

// The address of the site since 10 November 2026, the one Face ID is bound to.
export const SITE_URL = 'https://oseil.fr'

// The sentence a search engine shows under the title, and the one an answer engine reads to know
// what Oseil is. Only what is true of every account: no bank connection, encrypted in the browser.
const DESCRIPTION =
  'Suis ton patrimoine en 100 carrés : épargne, bourse, crypto, immobilier. Sans connexion bancaire, chiffré sur ton appareil : même nous ne le lisons pas.'

// The metadata of every page (app/layout.tsx). A messaging app that draws the preview of a shared
// link (WhatsApp, iMessage) reads the Open Graph fields, and the image beside them,
// app/opengraph-image.png (chosen by Nicolas, 10 November 2026).
//
// Opened to the search engines by Nicolas on 11 November 2026: the landing, the example and the
// privacy page can be found. The screens of the app and of the account close themselves again
// (PRIVATE_METADATA). Each public page names its own canonical address: one set here would be
// inherited by every page, and would tell the engines they are all the landing.
export const SITE_METADATA: Metadata = {
  // The preview image needs an absolute address.
  metadataBase: new URL(SITE_URL),
  title: { default: 'Oseil · Suivi de patrimoine chiffré, en 100 carrés', template: '%s · Oseil' },
  description: DESCRIPTION,
  openGraph: {
    title: 'Oseil · Ton argent, en 100 carrés',
    description: 'Tout ton patrimoine d’un coup d’œil. Chiffré sur ton appareil : même nous ne pouvons pas le lire.',
    siteName: 'Oseil',
    locale: 'fr_FR',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

// The screens behind a session ((app)) and the account screens ((compte)): never in a search
// engine, and the tab keeps reading « Oseil », as before the opening.
export const PRIVATE_METADATA: Metadata = {
  title: { absolute: 'Oseil' },
  robots: { index: false, follow: false },
}

// The pages anyone can read, in the order of the sitemap (app/sitemap.ts).
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/exemple',
  '/exemple/evolution',
  ...CATEGORY_ORDER.map((id) => `/exemple/categorie/${id}`),
  '/confidentialite',
]

// What Google and the answer engines read to know what Oseil is (schema.org, on the landing).
// Nothing about a person: the same block for everyone.
export const SITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Oseil',
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  inLanguage: 'fr',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
} as const
