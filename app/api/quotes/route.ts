// The price of one share, for each symbol the browser follows. The browser
// only ever talks to this site: the server asks Yahoo (lib/market/server.ts).
//
// What arrives in clear is the list of symbols, in the body, and nothing else:
// no quantity, no amount, no line name, no account. The route does not read
// who calls, only that a session exists, and it logs nothing itself.
//
// A missing price is a `null` next to its symbol, so the route never fails as
// a whole because Yahoo did.

import { quotesFor } from '@/lib/market/server'
import { MAX_SYMBOLS, SYMBOL } from '@/lib/market/types'
import { hasSession } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function answer(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** The distinct symbols asked, or null when the body does not read. */
function symbolsOf(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const { symbols } = body as { symbols?: unknown }
  // The browser sends the list without duplicates: the cap is on the list as
  // sent, before a single symbol is examined.
  if (!Array.isArray(symbols) || symbols.length === 0 || symbols.length > MAX_SYMBOLS) return null
  if (!symbols.every((symbol) => typeof symbol === 'string' && SYMBOL.test(symbol))) return null
  return [...new Set(symbols as string[])]
}

export async function POST(request: Request): Promise<Response> {
  if (!(await hasSession())) return answer({ ok: false }, 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return answer({ ok: false }, 400)
  }
  const symbols = symbolsOf(body)
  if (!symbols) return answer({ ok: false }, 400)

  return answer({ quotes: await quotesFor(symbols) })
}
