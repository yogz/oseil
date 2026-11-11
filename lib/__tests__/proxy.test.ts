import { NextRequest } from 'next/server'
import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { config, proxy } from '@/proxy'

// Fake values: a request without a session cookie never reaches Supabase.
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('where the proxy runs', () => {
  const runsOn = (url: string) => unstable_doesMiddlewareMatch({ config, url })

  test.each(['/', '/reperes', '/connexion', '/cle-de-secours'])('on the screen %s', (url) => {
    expect(runsOn(url)).toBe(true)
  })

  test.each(['/api/quotes', '/api/quotes/search', '/api/rates'])('on the market route %s', (url) => {
    expect(runsOn(url)).toBe(true)
  })

  // Sending a stylesheet or a script to /connexion would leave the sign-in
  // screen itself without its code.
  test.each([
    '/_next/static/chunks/app.js',
    '/_next/static/media/InterVariable.woff2',
    '/_next/image?url=%2Fx.png&w=64&q=75',
    '/favicon.ico',
    '/robots.txt',
  ])('not on the file %s', (url) => {
    expect(runsOn(url)).toBe(false)
  })
})

describe('what the proxy does without a session', () => {
  test('sends a visitor without a session to /connexion', async () => {
    const response = await proxy(new NextRequest('http://localhost:3000/reperes?x=1'))
    expect(getRedirectUrl(response)).toBe('http://localhost:3000/connexion')
  })

  // The first lock of the market routes; the route's own 401 is the second
  // (app/api/quotes/__tests__/route.test.ts). Either way, no price comes back.
  test('sends an anonymous call to the market routes to /connexion, with no price in it', async () => {
    const calls = [
      new NextRequest('http://localhost:3000/api/quotes', { method: 'POST', body: '{"symbols":["CW8.PA"]}' }),
      new NextRequest('http://localhost:3000/api/quotes/search', { method: 'POST', body: '{"query":"amundi"}' }),
      new NextRequest('http://localhost:3000/api/rates'),
    ]
    for (const call of calls) {
      const response = await proxy(call)
      expect(response.status, call.nextUrl.pathname).toBe(307)
      expect(getRedirectUrl(response), call.nextUrl.pathname).toBe('http://localhost:3000/connexion')
      expect(await response.text()).not.toMatch(/CW8|price|rates/)
    }
  })

  test('lets the visitor open the public screens', async () => {
    for (const path of ['/connexion', '/inscription', '/cle-de-secours']) {
      const response = await proxy(new NextRequest(`http://localhost:3000${path}`))
      expect(getRedirectUrl(response), path).toBeNull()
    }
  })
})
