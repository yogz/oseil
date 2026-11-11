// The Supabase client of server components, built for one request from its
// cookies. It reads the session; it holds no key and opens nothing — the
// server only ever sees sealed packets.

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { supabaseEnv } from './env'

export async function createServerSupabase(): Promise<SupabaseClient> {
  const { url, publishableKey } = supabaseEnv()
  const cookieStore = await cookies()
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        // A server component cannot set cookies, and does not need to: the
        // session has already been refreshed by `proxy.ts`, before rendering.
        // A server function or a route handler can, and does.
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a server component: nothing to write, see above.
        }
      },
    },
  })
}

/**
 * Whether the request carries a verified session — the check `app/(app)/layout.tsx`
 * makes, for the route handlers, which that layout does not wrap. It says yes
 * or no, and nothing about who.
 */
export async function hasSession(): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  return Boolean(data?.claims)
}
