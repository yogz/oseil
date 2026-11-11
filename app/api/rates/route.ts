// The exchange rates of the day, from the European Central Bank. The browser
// only ever talks to this site: the server reads the ECB's daily file
// (lib/market/server.ts).
//
// The request carries nothing: the handler takes no argument, so it cannot
// learn which currencies someone holds. The route checks that a session
// exists, and logs nothing itself.

import { ratesNow } from '@/lib/market/server'
import { MarketUnavailableError } from '@/lib/market/types'
import { hasSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function answer(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(): Promise<Response> {
  if (!(await hasSession())) return answer({ ok: false }, 401)

  try {
    return answer({ rates: await ratesNow() })
  } catch (error) {
    if (error instanceof MarketUnavailableError) return answer({ ok: false }, 502)
    throw error
  }
}
