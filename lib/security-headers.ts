/**
 * The headers `next.config.ts` puts on every response.
 *
 * Kept here, as plain data, so the policy can be asserted on in
 * `lib/__tests__/security-headers.test.ts` instead of being a string nobody
 * ever reads back.
 *
 * ---- The one exemption, stated plainly ----
 *
 * `script-src` carries `'unsafe-inline'`. It is not laziness and it is not
 * free: it is the price of setting the policy from next.config.ts, which is
 * built once and cannot know anything about a particular request. Next.js
 * streams the React payload of every page through inline <script> tags, and
 * the only way to allow *those* while refusing every other inline script is a
 * per-request nonce — which has to come from the proxy/middleware layer, and
 * which also forces every page to be rendered on demand. The account screens
 * (`app/(compte)/`) and the 404 page are prerendered at build time in this app
 * — everything personal is fetched and opened in the browser afterwards — so a
 * nonce would blank them out. See the PR that introduced this file for the
 * full trade-off.
 *
 * What is *not* given away with it:
 *  - `script-src-attr 'none'` keeps inline event handlers (onclick="…") banned,
 *    which is where injected markup usually lands;
 *  - no `'unsafe-eval'` in production;
 *  - no origin other than this one may serve a script or a font, and the only
 *    other origin the page may connect to is the Supabase project.
 *
 * `'wasm-unsafe-eval'` is a second, narrower exemption: the key derivation
 * (Argon2id, from hash-wasm) runs as WebAssembly, and under a policy a browser
 * refuses to compile WebAssembly without it. It allows compiling WebAssembly
 * and nothing else — `eval()` of a string stays refused. Measured, not guessed
 * (6 November 2026): without it, `e2e/compte.spec.ts` against a production
 * build fails at sign-in; development hides it, since eval is allowed there.
 *
 * For styles the exemption is narrower and was measured, not guessed: with
 * `style-src 'self'` alone, a production render reports
 * `style-src-attr blocked inline` — the style attributes that size the bars
 * and gauges of the screens, and nothing else. So the
 * exemption is spelled `style-src-attr 'unsafe-inline'`: stylesheets still have
 * to come from this origin, and an injected <style> block is still refused. A
 * nonce cannot cover a style *attribute* at all, so this line would survive the
 * nonce work too.
 */

export type SecurityHeader = { key: string; value: string }

type PolicyInput = { development: boolean; supabaseUrl: string }

// A policy without the Supabase origin would block every call to it, and the
// failure would show only in the browser, at sign-in. Refusing here makes a
// missing or malformed variable fail the build instead.
function supabaseOrigin(supabaseUrl: string): string {
  let url: URL | null = null
  try {
    url = new URL(supabaseUrl)
  } catch {
    // reported below
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be the address of the Supabase project, such as https://<ref>.supabase.co')
  }
  return url.origin
}

export function contentSecurityPolicy({ development, supabaseUrl }: PolicyInput): string {
  const supabase = supabaseOrigin(supabaseUrl)
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    // React rebuilds server error stacks in the browser with eval, in dev only.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // Only style *attributes* are let through — see the note above. The dev
    // server injects real inline <style> blocks for hot reloading, which
    // production never does.
    `style-src 'self'${development ? " 'unsafe-inline'" : ''}`,
    "style-src-attr 'unsafe-inline'",
    // The browser talks to Supabase itself: signing in, and the sealed
    // documents. The dev server also pushes updates over a websocket on this
    // same origin.
    `connect-src 'self' ${supabase}${development ? ' ws: wss:' : ''}`,
    // Local work happens over http://localhost, which has no https port to be
    // upgraded to.
    ...(development ? [] : ['upgrade-insecure-requests']),
  ]

  return directives.join('; ')
}

export function securityHeaders(input: PolicyInput): SecurityHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(input) },
    // Belt and braces with frame-ancestors, for anything that still reads it.
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // The app has no camera, microphone, location or payment feature, and the
    // browser should refuse on its behalf rather than trust it not to ask.
    {
      key: 'Permissions-Policy',
      value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    },
    // Two years, subdomains included. Ignored over plain http, so it costs
    // nothing locally and is what stops a first request in a café from ever
    // going out in clear.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ]
}
