// Daily visit from the Vercel cron, so the free-tier Supabase project is not
// paused after seven days of low activity. It calls `public.keep_alive()`,
// which touches a one-row heartbeat table.
//
// Vercel sends `Authorization: Bearer <CRON_SECRET>` when the project has a
// `CRON_SECRET` variable. Anything else is refused before the database is
// reached. No session is involved: `proxy.ts` lets this path through, and the
// secret is the only guard.

import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { supabaseEnv } from '@/lib/supabase/env'

export const dynamic = 'force-dynamic'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

// Comparing SHA-256 digests gives equal-length buffers, so the comparison
// takes the same time whatever the guess looks like.
function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || header === null) return false
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}

// Only the error's code and message reach the logs: never the secret, never headers.
function logFailure(error: unknown): void {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  console.error('keep-alive failed', { code, message })
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return Response.json({ ok: false }, { status: 401 })
  }

  try {
    const { url, publishableKey } = supabaseEnv()
    const supabase = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.rpc('keep_alive')
    if (error) {
      logFailure(error)
      return Response.json({ ok: false }, { status: 502 })
    }
    return Response.json({ ok: true, seenAt: data })
  } catch (error) {
    logFailure(error)
    return Response.json({ ok: false }, { status: 502 })
  }
}
