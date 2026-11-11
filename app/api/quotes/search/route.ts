// The search for a share, an ETF or a fund, by name or ISIN code. The browser
// only ever talks to this site: the server asks Yahoo (lib/market/server.ts).
//
// What arrives in clear is the text typed, in the body, and nothing else. The
// route does not read who calls, only that a session exists, and it logs
// nothing itself: lib/market/server.ts logs a failed source and its status.

import { matchesFor } from '@/lib/market/server'
import { MarketUnavailableError, QUERY_MAX, QUERY_MIN } from '@/lib/market/types'
import { hasSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function answer(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** The trimmed text, or null when the body does not read. */
function queryOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const { query } = body as { query?: unknown }
  if (typeof query !== 'string') return null
  const text = query.trim()
  // Half of a UTF-16 pair cannot be put in an address: encodeURIComponent throws.
  if (!text.isWellFormed()) return null
  return text.length < QUERY_MIN || text.length > QUERY_MAX ? null : text
}

export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) return answer({ ok: false }, 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return answer({ ok: false }, 400)
  }
  const query = queryOf(body)
  if (!query) return answer({ ok: false }, 400)

  try {
    return answer({ results: await matchesFor(query) })
  } catch (error) {
    if (error instanceof MarketUnavailableError) return answer({ ok: false }, 502)
    throw error
  }
}
