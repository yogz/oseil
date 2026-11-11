import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, securityHeaders } from '@/lib/security-headers'

const SUPABASE = 'https://abc.supabase.co'
const production = contentSecurityPolicy({ development: false, supabaseUrl: SUPABASE })
const development = contentSecurityPolicy({ development: true, supabaseUrl: SUPABASE })

/** 'self' → ["'self'"], so a directive can be asserted on exactly, not by substring. */
function directive(policy: string, name: string): string[] {
  const found = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `))
  return found ? found.split(/\s+/).slice(1) : []
}

describe('the policy in production', () => {
  it('pins everything to this origin unless a directive says otherwise', () => {
    expect(directive(production, 'default-src')).toEqual(["'self'"])
  })

  // Clickjacking: without this, any site can put the app in an invisible frame
  // and harvest clicks on the one irreversible button it has.
  it('refuses to be framed by anybody, including itself', () => {
    expect(directive(production, 'frame-ancestors')).toEqual(["'none'"])
  })

  it('allows no plugins and no base-tag rewriting', () => {
    expect(directive(production, 'object-src')).toEqual(["'none'"])
    expect(directive(production, 'base-uri')).toEqual(["'self'"])
  })

  // The password field lives in a form. Without this, an injected <form> could
  // post it to another origin and the browser would happily comply.
  it('lets forms post to this app and nowhere else', () => {
    expect(directive(production, 'form-action')).toEqual(["'self'"])
  })

  // Next.js streams the RSC payload through inline <script> tags, so inline
  // *elements* have to be allowed. Inline *attributes* — onclick="…", the
  // classic injection landing spot — do not, and are refused explicitly rather
  // than swept in with the same exemption.
  it('grants the inline exemption Next.js needs, and no more than that', () => {
    expect(directive(production, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(production, 'script-src-attr')).toEqual(["'none'"])
  })

  // Measured, not guessed: with `style-src 'self'` alone a production render
  // reports `style-src-attr blocked inline`, and nothing else — the allocation
  // bars, which are positioned with a style attribute. So the exemption is the
  // attribute, and stylesheets stay pinned to this origin.
  it('exempts style attributes only, not stylesheets', () => {
    expect(directive(production, 'style-src')).toEqual(["'self'"])
    expect(directive(production, 'style-src-attr')).toEqual(["'unsafe-inline'"])
  })

  // Compared token by token: 'wasm-unsafe-eval' contains the string
  // 'unsafe-eval', and is the one exemption that must be there.
  it('never allows eval in production', () => {
    expect(directive(production, 'script-src')).not.toContain("'unsafe-eval'")
    expect(production.split(/[\s;]+/)).not.toContain("'unsafe-eval'")
  })

  // The key derivation (Argon2id, from hash-wasm) is WebAssembly. Under a
  // policy, a browser refuses to compile WebAssembly unless script-src says
  // 'wasm-unsafe-eval' — which allows exactly that, and not eval() of a
  // string. Without it, signing in works in development (which allows eval
  // anyway) and fails in production.
  it('lets the key derivation compile its WebAssembly, and nothing more', () => {
    expect(directive(production, 'script-src')).toContain("'wasm-unsafe-eval'")
  })

  it('upgrades anything still asking for http', () => {
    expect(production).toContain('upgrade-insecure-requests')
  })

  it('lets the page talk to Supabase and nowhere else', () => {
    const csp = contentSecurityPolicy({ development: false, supabaseUrl: 'https://abc.supabase.co' })
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co")
    expect(directive(production, 'connect-src')).toEqual(["'self'", SUPABASE])
    expect(directive(production, 'font-src')).toEqual(["'self'"])
  })

  // Prices and exchange rates are fetched by the server (app/api/quotes,
  // app/api/rates): the page asks this site, never Yahoo or the ECB, so
  // neither appears anywhere in the policy.
  it('lets the page reach no market source, only this site and Supabase', () => {
    expect(directive(production, 'connect-src')).toEqual(["'self'", SUPABASE])
    expect(production).not.toMatch(/yahoo|ecb\.europa/)
    expect(development).not.toMatch(/yahoo|ecb\.europa/)
  })

  // The policy names an origin, never a path: a trailing slash or a path in
  // the variable must not turn into a source that matches nothing.
  it('reduces the Supabase address to its origin', () => {
    const csp = contentSecurityPolicy({ development: false, supabaseUrl: 'https://abc.supabase.co/' })
    expect(directive(csp, 'connect-src')).toEqual(["'self'", SUPABASE])
  })

  // A build without the variable would ship a policy that blocks every call to
  // Supabase: signing in would fail in production only. Better not to build.
  it('refuses to build a policy without a valid Supabase address', () => {
    expect(() => contentSecurityPolicy({ development: false, supabaseUrl: '' })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => contentSecurityPolicy({ development: false, supabaseUrl: 'abc.supabase.co' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    )
  })
})

describe('the policy in development', () => {
  // React rebuilds server error stacks in the browser with eval, and the dev
  // server pushes updates over a websocket. Without these two, `npm run dev`
  // breaks — while production keeps the strict version.
  it('allows what the dev server needs, and only there', () => {
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(development, 'connect-src')).toContain('ws:')
    expect(directive(development, 'connect-src')).toContain(SUPABASE)
  })

  // Local work happens over http://localhost; upgrading it would send the
  // browser to an https port nothing is listening on.
  it('does not upgrade requests, because localhost is http', () => {
    expect(development).not.toContain('upgrade-insecure-requests')
  })
})

describe('the headers sent with every response', () => {
  const headers = securityHeaders({ development: false, supabaseUrl: SUPABASE })
  const value = (key: string) => headers.find((h) => h.key.toLowerCase() === key)?.value

  it('carries the policy plus the usual four', () => {
    expect(value('content-security-policy')).toBe(production)
    expect(value('x-content-type-options')).toBe('nosniff')
    expect(value('x-frame-options')).toBe('DENY')
    expect(value('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(value('permissions-policy')).toBeDefined()
  })

  it('asks browsers never to come back over http', () => {
    expect(value('strict-transport-security')).toMatch(/max-age=\d{7,}/)
  })

  // A header value with a newline in it is silently dropped or, worse, splits
  // the response. Policies are written as multi-line templates, so this is the
  // exact mistake worth a test.
  it('has no line breaks or double spaces in any value', () => {
    for (const header of securityHeaders({ development: true, supabaseUrl: SUPABASE }).concat(headers)) {
      expect(header.value, header.key).not.toMatch(/[\r\n]|\s{2}/)
    }
  })
})
