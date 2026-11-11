// Runs before every screen (Next.js 16 renamed `middleware` to `proxy`; it
// runs on Node.js). Two jobs:
//  - refresh the Supabase session, whose tokens live in cookies, before the
//    screen renders — the server components cannot write cookies themselves;
//  - send each visitor where `routeFor` says: without a session, `/` shows the
//    landing (the address stays `/`), the public screens open, and anything
//    else goes to /connexion.
//
// This is a gate, not the lock. What a person can read or write is decided by
// row-level security in the database, and what is stored there is sealed in
// the browser. The (app) layout checks the session again on the server.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { routeFor } from '@/lib/auth/routing'
import { supabaseEnv } from '@/lib/supabase/env'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = supabaseEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      // A refreshed session is written twice: on the request, so the screen
      // rendered next reads the new tokens, and on the response, so the
      // browser keeps them. The headers forbid any cache from storing a
      // response that carries someone's session.
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Verifies the token, and refreshes it when it has expired. Nothing may run
  // between creating the client and this call.
  const { data } = await supabase.auth.getClaims()

  const route = routeFor({ pathname: request.nextUrl.pathname, signedIn: Boolean(data?.claims) })
  if (route.kind === 'next') return response

  const target = request.nextUrl.clone()
  target.pathname = route.to
  if (route.kind === 'redirect') target.search = ''
  const other = route.kind === 'redirect' ? NextResponse.redirect(target) : NextResponse.rewrite(target, { request })
  // A session that could not be refreshed is cleared by Supabase: the browser
  // must receive that too, or it would send the dead one again.
  for (const cookie of response.cookies.getAll()) other.cookies.set(cookie)
  for (const [key, value] of response.headers) {
    if (key === 'cache-control' || key === 'expires' || key === 'pragma') other.headers.set(key, value)
  }
  return other
}

export const config = {
  // Everything but Next's own files and anything with a file extension — the
  // font, the icon, robots.txt. Blocking those would leave /connexion itself
  // without its code.
  matcher: ['/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)'],
}
