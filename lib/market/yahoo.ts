import { MarketUnavailableError, SYMBOL, type Quote, type SecurityKind, type SecurityMatch } from './types'
import { coinOf } from './crypto'
import { upstream } from './upstream'

export const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'
export const SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search'

const MAX_MATCHES = 8
const KINDS: Record<string, SecurityKind> = {
  EQUITY: 'action',
  ETF: 'ETF',
  MUTUALFUND: 'fonds',
  CRYPTOCURRENCY: 'crypto',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

async function readJson(response: Response, source: 'yahoo-chart' | 'yahoo-search'): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new MarketUnavailableError(source, response.status)
  }
}

/** The price of one share, or null when Yahoo has no usable price for the symbol. */
export async function fetchQuote(symbol: string, fetcher: typeof fetch = fetch): Promise<Quote | null> {
  const response = await upstream(
    `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    'yahoo-chart',
    fetcher,
  )
  if (response.status === 404) return null
  if (!response.ok) throw new MarketUnavailableError('yahoo-chart', response.status)

  const payload = asRecord(await readJson(response, 'yahoo-chart'))
  const results = asRecord(payload?.chart)?.result
  const meta = Array.isArray(results) ? asRecord(asRecord(results[0])?.meta) : null
  if (!meta) return null

  const rawPrice = meta.regularMarketPrice
  const rawCurrency = meta.currency
  const time = meta.regularMarketTime
  if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) return null
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return null
  if (typeof rawCurrency !== 'string') return null
  let price: number = rawPrice
  let currency: string = rawCurrency
  if (currency === 'GBp' || currency === 'GBX') {
    // Pence (Yahoo writes GBp or GBX): 1039.2 GBp is 10.392 GBP. Rounded to 6 decimals of
    // pounds, from whole ten-thousandths of a penny: a plain / 100 gives 10.392000000000001,
    // which a box would show. Too small to make a millionth of a pound, there is no price.
    currency = 'GBP'
    price = Math.round(rawPrice * 10_000) / 1_000_000
    if (price <= 0) return null
  }
  if (!/^[A-Z]{3}$/.test(currency)) return null
  // A time past what a Date holds would make toISOString() throw, and one
  // such answer would break the whole call; past the year 9999 the ISO form
  // is no longer YYYY-MM-DD. Either way, there is no usable date.
  const date = new Date(time * 1000)
  if (Number.isNaN(date.getTime())) return null
  const asOf = date.toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null
  const type = meta.instrumentType
  // Own keys only: 'constructor' or 'toString' must not read through the prototype.
  const kind = typeof type === 'string' && Object.hasOwn(KINDS, type) ? KINDS[type] : undefined
  return kind ? { price, currency, asOf, kind } : { price, currency, asOf }
}

export async function searchSecurities(query: string, fetcher: typeof fetch = fetch): Promise<SecurityMatch[]> {
  const response = await upstream(
    `${SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=${MAX_MATCHES}&newsCount=0`,
    'yahoo-search',
    fetcher,
  )
  if (!response.ok) throw new MarketUnavailableError('yahoo-search', response.status)

  const quotes = asRecord(await readJson(response, 'yahoo-search'))?.quotes
  // An answer whose shape changed did not answer the search: never « Rien trouvé ».
  if (!Array.isArray(quotes)) throw new MarketUnavailableError('yahoo-search', response.status)
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const matches: SecurityMatch[] = []
  for (const raw of quotes) {
    const item = asRecord(raw)
    if (!item) continue
    const kind =
      typeof item.quoteType === 'string' && Object.hasOwn(KINDS, item.quoteType) ? KINDS[item.quoteType] : undefined
    const symbol = item.symbol
    if (!kind || typeof symbol !== 'string' || !SYMBOL.test(symbol)) continue
    const name = text(item.longname) ?? text(item.shortname) ?? symbol
    if (kind === 'crypto') {
      // One result per coin (« Bitcoin USD » and « Bitcoin EUR » are one Bitcoin): the pair is
      // chosen at the pick, in the line's currency (crypto.ts). Its market « CCC » says nothing.
      const coin = coinOf(symbol)
      if (matches.some((m) => m.kind === 'crypto' && coinOf(m.symbol) === coin)) continue
      matches.push({ symbol, name: name.replace(/ [A-Z]{3}$/, ''), exchange: '', kind })
    } else {
      matches.push({ symbol, name, exchange: text(item.exchDisp) ?? text(item.exchange) ?? '', kind })
    }
    if (matches.length === MAX_MATCHES) break
  }
  return matches
}
