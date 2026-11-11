// The browser's side of the market: it calls only the site's own routes, with
// the symbols and queries in POST bodies (never in a URL). An answer that
// cannot be used (redirect to the login page, bad status, not JSON, a part
// that does not parse, more than CLIENT_TIMEOUT_MS) is `null`: "no data".
// Nothing here throws, and nothing invents a 0.

import { parseMatch, parseQuote, parseRates, type Quote, type Rates, type SecurityMatch } from './types'

export const CLIENT_TIMEOUT_MS = 8_000

/** The parsed JSON body of an OK answer, or null. */
async function call(url: string, init: { method: string; body?: string }): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
  try {
    const headers = init.body === undefined ? undefined : { 'Content-Type': 'application/json' }
    const response = await fetch(url, { ...init, headers, signal: controller.signal })
    if (!response.ok) return null
    // The proxy answers an anonymous call with a redirect to an HTML page.
    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function field(body: unknown, name: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined
}

export async function requestQuotes(symbols: string[]): Promise<Record<string, Quote | null> | null> {
  const quotes = field(await call('/api/quotes', { method: 'POST', body: JSON.stringify({ symbols }) }), 'quotes')
  if (typeof quotes !== 'object' || quotes === null || Array.isArray(quotes)) return null
  const parsed: Record<string, Quote | null> = {}
  for (const [symbol, value] of Object.entries(quotes)) {
    // A malformed entry costs only its own symbol.
    parsed[symbol] = value === null ? null : parseQuote(value)
  }
  return parsed
}

export async function requestSearch(query: string): Promise<SecurityMatch[] | null> {
  const results = field(await call('/api/quotes/search', { method: 'POST', body: JSON.stringify({ query }) }), 'results')
  if (!Array.isArray(results)) return null
  const matches: SecurityMatch[] = []
  for (const value of results) {
    const match = parseMatch(value)
    if (!match) return null
    matches.push(match)
  }
  return matches
}

export async function requestRates(): Promise<Rates | null> {
  return parseRates(field(await call('/api/rates', { method: 'GET' }), 'rates'))
}
