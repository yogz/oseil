// The Supabase client of the browser, where everything that matters happens:
// the key derivation, sealing and opening. It keeps the session in cookies, so
// that `proxy.ts` and the server can tell who is signed in — the session, not
// the data key, which never leaves the device.

import { createBrowserClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

// In a browser, @supabase/ssr hands back the same client on every call: one
// session, one refresh timer, however many screens ask for it.
export function createBrowserSupabase(): SupabaseClient {
  const { url, publishableKey } = supabaseEnv()
  return createBrowserClient(url, publishableKey)
}

// Only for asking for a reset link (see lib/auth/recovery.ts). It must use the
// implicit flow, and @supabase/ssr cannot: its client always forces the PKCE
// flow, whatever it is told, which ties the link to the browser that asked for
// it. This one is plain supabase-js, and holds nothing: no session, nothing
// stored, under a storage key of its own so it never meets the main client's.
// The session the link opens is read by the main client, into its cookies.
export function createRecoveryBrowserSupabase(): SupabaseClient {
  const { url, publishableKey } = supabaseEnv()
  return createClient(url, publishableKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'stefin-recovery-request',
    },
  })
}
