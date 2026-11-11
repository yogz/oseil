// Where a visitor goes, decided before any screen renders (`proxy.ts` applies
// it). Three kinds of address:
//  - the public screens: the account screens, the privacy page (read before an
//    account exists), the page that stops the reminder e-mail (opened from the
//    e-mail, without signing in), and /api/keep-alive, which the Vercel cron calls with no
//    session (it is guarded by its own secret);
//  - the example, `/exemple` and everything under it: an invented person,
//    shown to anyone, with or without a session;
//  - everything else needs a session, and a visitor without one is sent to
//    /connexion — except on `/`, the address of the site, which shows the
//    landing instead.
//
// The public screens are matched exactly, not by prefix: a new screen under one
// of them is private until someone adds it here on purpose. The example alone
// is matched by prefix, and each of its segments must be a plain word, so that
// nothing like `/exemple/../reglages` or `/exemplex` slips through.

export const PUBLIC_PATHS = [
  '/connexion',
  '/inscription',
  '/cle-de-secours',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
  '/api/keep-alive',
  '/confidentialite',
  '/rappel/arreter',
] as const

// The internal address of the landing. A visitor never sees it: without a
// session `/` is rewritten to it, and opening it directly sends back to `/`.
export const LANDING_PATH = '/accueil'

const EXAMPLE_ROOT = '/exemple'
// Letters, digits, `-` and `_`: no dot, no percent sign, no backslash, nothing
// empty — none of what could climb out of the example once decoded.
const PLAIN_SEGMENT = /^[A-Za-z0-9_-]+$/

export function isExamplePath(pathname: string): boolean {
  if (pathname === EXAMPLE_ROOT) return true
  if (!pathname.startsWith(`${EXAMPLE_ROOT}/`)) return false
  return pathname
    .slice(EXAMPLE_ROOT.length + 1)
    .split('/')
    .every((segment) => PLAIN_SEGMENT.test(segment))
}

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname) || isExamplePath(pathname)
}

export type Route = { kind: 'next' } | { kind: 'rewrite'; to: string } | { kind: 'redirect'; to: string }

export function routeFor({ pathname, signedIn }: { pathname: string; signedIn: boolean }): Route {
  // One address for the landing, whoever asks: a person with a session lands on
  // Mon argent, one without sees the landing at `/`.
  if (pathname === LANDING_PATH) return { kind: 'redirect', to: '/' }
  if (signedIn) return { kind: 'next' }
  if (pathname === '/') return { kind: 'rewrite', to: LANDING_PATH }
  if (isPublicPath(pathname)) return { kind: 'next' }
  return { kind: 'redirect', to: '/connexion' }
}
