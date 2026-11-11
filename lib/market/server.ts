import { createCache } from './cache'
import { fetchRates } from './ecb'
import { MarketUnavailableError, type Quote, type Rates, type SecurityMatch } from './types'
import { fetchQuote, searchSecurities } from './yahoo'

export const QUOTE_CONCURRENCY = 6
// The whole quotes request answers by then, before the browser's 8 s (CLIENT_TIMEOUT_MS).
export const QUOTES_DEADLINE_MS = 6_500
export const QUOTE_TTL_MS = 600_000
export const FAILURE_TTL_MS = 60_000
export const SEARCH_TTL_MS = 3_600_000
export const RATES_TTL_MS = 3_600_000
export const CACHE_MAX = 500
// A ceiling on real upstream calls (a cache hit is free), all callers together: the routes
// do not know who asks. Each count lives in the memory of one server instance, so a cap is
// per instance (Vercel reuses instances, which is enough against a free relay; no database).
export const UPSTREAM_CALLS_PER_MINUTE = 120
export const SEARCH_CALLS_PER_MINUTE = 30
export const RATES_CALLS_PER_MINUTE = 10
const WINDOW_MS = 60_000

const quoteCache = createCache<Quote | null>(CACHE_MAX)
const searchCache = createCache<SecurityMatch[]>(CACHE_MAX)
const ratesCache = createCache<Rates>(CACHE_MAX)
// Simultaneous requests for one symbol share a single upstream call.
const inFlight = new Map<string, Promise<Quote | null>>()

// Timestamps of the upstream calls of the last minute, one list per kind. Only times: no symbol.
const upstreamCalls = { quotes: [] as number[], search: [] as number[], rates: [] as number[] }
const CAPS = {
  quotes: UPSTREAM_CALLS_PER_MINUTE,
  search: SEARCH_CALLS_PER_MINUTE,
  rates: RATES_CALLS_PER_MINUTE,
}

/** Takes one slot of the sliding minute for this kind of call, or says there is none left. */
function takeUpstreamSlot(kind: keyof typeof CAPS): boolean {
  const calls = upstreamCalls[kind]
  const now = Date.now()
  while (calls.length > 0 && calls[0] <= now - WINDOW_MS) calls.shift()
  if (calls.length >= CAPS[kind]) return false
  calls.push(now)
  return true
}

/** Logs the source and the status only: never a symbol, a query or a header. */
function logFailure(error: unknown): void {
  if (error instanceof MarketUnavailableError) {
    console.error('market upstream failed', { source: error.source, status: error.status })
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

function quoteOne(symbol: string, fetcher: typeof fetch): Promise<Quote | null> {
  const cached = quoteCache.get(symbol)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inFlight.get(symbol)
  if (pending) return pending
  // Over the cap: no answer, and nothing cached, so the next ask tries again.
  if (!takeUpstreamSlot('quotes')) return Promise.resolve(null)

  const request = (async () => {
    try {
      const quote = await fetchQuote(symbol, fetcher)
      quoteCache.set(symbol, quote, QUOTE_TTL_MS)
      return quote
    } catch (error) {
      if (!(error instanceof MarketUnavailableError)) throw error
      logFailure(error)
      quoteCache.set(symbol, null, FAILURE_TTL_MS)
      return null
    } finally {
      inFlight.delete(symbol)
    }
  })()
  inFlight.set(symbol, request)
  return request
}

/**
 * Every symbol's price, answered by QUOTES_DEADLINE_MS at the latest: the browser gives up
 * at 8 s. A symbol not finished by then is null, but kept as no failure: its request goes
 * on, and fills the cache when it answers. No request starts after the answer.
 */
export async function quotesFor(
  symbols: string[],
  fetcher: typeof fetch = fetch,
): Promise<Record<string, Quote | null>> {
  const distinct = [...new Set(symbols)]
  const quotes: Record<string, Quote | null> = {}
  let late = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      late = true
      resolve()
    }, QUOTES_DEADLINE_MS)
  })
  const all = mapLimit(distinct, QUOTE_CONCURRENCY, async (symbol) => {
    if (late) return
    quotes[symbol] = await quoteOne(symbol, fetcher)
  })
  try {
    // An unexpected error before the deadline goes through; after it, the answer is gone and
    // the race has already taken it in.
    await Promise.race([all, deadline])
  } finally {
    clearTimeout(timer)
  }
  return Object.fromEntries(distinct.map((symbol) => [symbol, Object.hasOwn(quotes, symbol) ? quotes[symbol] : null]))
}

export async function matchesFor(query: string, fetcher: typeof fetch = fetch): Promise<SecurityMatch[]> {
  const text = query.trim()
  const key = text.toLowerCase()
  const cached = searchCache.get(key)
  if (cached) return cached
  try {
    if (!takeUpstreamSlot('search')) throw new MarketUnavailableError('yahoo-search', null)
    const matches = await searchSecurities(text, fetcher)
    searchCache.set(key, matches, SEARCH_TTL_MS)
    return matches
  } catch (error) {
    logFailure(error)
    throw error
  }
}

export async function ratesNow(fetcher: typeof fetch = fetch): Promise<Rates> {
  const cached = ratesCache.get('daily')
  if (cached) return cached
  try {
    if (!takeUpstreamSlot('rates')) throw new MarketUnavailableError('ecb', null)
    const rates = await fetchRates(fetcher)
    ratesCache.set('daily', rates, RATES_TTL_MS)
    return rates
  } catch (error) {
    logFailure(error)
    throw error
  }
}

export function resetMarketCaches(): void {
  quoteCache.clear()
  searchCache.clear()
  ratesCache.clear()
  inFlight.clear()
  for (const calls of Object.values(upstreamCalls)) calls.length = 0
}
