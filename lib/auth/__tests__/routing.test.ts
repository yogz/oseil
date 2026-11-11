import { expect, test } from 'vitest'
import { LANDING_PATH, PUBLIC_PATHS, isExamplePath, isPublicPath, routeFor } from '../routing'

test.each([
  ['/connexion', true],
  ['/inscription', true],
  ['/cle-de-secours', true],
  ['/mot-de-passe-oublie', true],
  ['/nouveau-mot-de-passe', true],
  ['/api/keep-alive', true],
  // The privacy page is read before an account exists, from the landing and the sign-up.
  ['/confidentialite', true],
  ['/confidentialite/x', false],
  ['/confidentialitex', false],
  // The unsubscribe link of the reminder e-mail opens without signing in.
  ['/rappel/arreter', true],
  ['/rappel/arreter/x', false],
  ['/rappel', false],
  ['/api/keep-alive/x', false],
  ['/api', false],
  // The market routes need a session: the proxy turns an anonymous call away.
  ['/api/quotes', false],
  ['/api/quotes/search', false],
  ['/api/rates', false],
  // `/` is not public: the proxy serves the landing there, and only there.
  ['/', false],
  ['/reperes', false],
  ['/connexion/x', false],
  ['/connexionx', false],
  // The example is public, by prefix.
  ['/exemple', true],
  ['/exemple/evolution', true],
  ['/exemple/categorie/markets', true],
  ['/exemplex', false],
  ['/exemple/../reglages', false],
])('isPublicPath(%s) is %s', (path, expected) => expect(isPublicPath(path)).toBe(expected))

test('lists exactly the screens a visitor without a session may open', () => {
  expect(PUBLIC_PATHS).toEqual([
    '/connexion',
    '/inscription',
    '/cle-de-secours',
    '/mot-de-passe-oublie',
    '/nouveau-mot-de-passe',
    '/api/keep-alive',
    '/confidentialite',
    '/rappel/arreter',
  ])
})

test.each([
  ['/exemple', true],
  ['/exemple/evolution', true],
  ['/exemple/categorie/markets', true],
  ['/exemple/ligne/l-1', true],
  ['/exemplex', false],
  ['/exemple-x', false],
  ['/exemple/../reglages', false],
  ['/exemple/./evolution', false],
  ['/exemple/%2e%2e/reglages', false],
  ['/exemple/..%2freglages', false],
  ['/exemple\\..\\reglages', false],
  ['/exemple/', false],
  ['/exemple//evolution', false],
  ['/reglages', false],
  ['/', false],
  ['/x/exemple', false],
])('isExamplePath(%s) is %s', (path, expected) => expect(isExamplePath(path)).toBe(expected))

test('the landing lives at its own internal path, outside the screens that need a session', () => {
  expect(LANDING_PATH).toBe('/accueil')
  expect(isPublicPath(LANDING_PATH)).toBe(false)
})

test.each([
  // Without a session, the address of the site shows the landing, and keeps its address.
  ['/', false, { kind: 'rewrite', to: LANDING_PATH }],
  // With a session, it shows Mon argent, as before.
  ['/', true, { kind: 'next' }],
  // The landing has one address: its internal path sends back to `/`, with or without a session.
  [LANDING_PATH, true, { kind: 'redirect', to: '/' }],
  [LANDING_PATH, false, { kind: 'redirect', to: '/' }],
  // Any other private screen still sends a visitor without a session to sign in.
  ['/reglages', false, { kind: 'redirect', to: '/connexion' }],
  ['/exemplex', false, { kind: 'redirect', to: '/connexion' }],
  ['/exemple/../reglages', false, { kind: 'redirect', to: '/connexion' }],
  ['/api/quotes', false, { kind: 'redirect', to: '/connexion' }],
  ['/reglages', true, { kind: 'next' }],
  // The public screens open either way.
  ['/connexion', false, { kind: 'next' }],
  ['/connexion', true, { kind: 'next' }],
  ['/confidentialite', false, { kind: 'next' }],
  ['/confidentialite', true, { kind: 'next' }],
  ['/rappel/arreter', false, { kind: 'next' }],
  ['/rappel/arreter', true, { kind: 'next' }],
  ['/rappel/arreter/x', false, { kind: 'redirect', to: '/connexion' }],
  ['/exemple', false, { kind: 'next' }],
  ['/exemple', true, { kind: 'next' }],
  ['/exemple/categorie/markets', false, { kind: 'next' }],
])('routeFor(%s, signed in: %s)', (pathname, signedIn, expected) => {
  expect(routeFor({ pathname, signedIn })).toEqual(expected)
})
