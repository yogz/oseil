import type { CurrencyCode, IsoDate } from '@/lib/model/types'

export type SecurityKind = 'action' | 'ETF' | 'fonds' | 'crypto'
/** One share, in `currency`. Pence are already turned into pounds. */
export type Quote = { price: number; currency: CurrencyCode; asOf: IsoDate; kind?: SecurityKind }
export type SecurityMatch = {
  symbol: string
  name: string
  exchange: string
  kind: SecurityKind
}

/** ECB: 1 € = perEuro[c] units of c. */
export type Rates = { on: IsoDate; perEuro: Record<CurrencyCode, number> }
/** `null`: asked, but no usable price. */
export type Market = { quotes: Record<string, Quote | null>; rates: Rates | null }

export const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/
export const MAX_SYMBOLS = 50
export const QUERY_MIN = 2
export const QUERY_MAX = 80

const CURRENCY = /^[A-Z]{3}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export class MarketUnavailableError extends Error {
  // null status: network error or timeout
  constructor(
    public source: 'yahoo-chart' | 'yahoo-search' | 'ecb',
    public status: number | null,
  ) {
    super(`market source unavailable: ${source}`)
    this.name = 'MarketUnavailableError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isKind(value: unknown): value is SecurityKind {
  return value === 'action' || value === 'ETF' || value === 'fonds' || value === 'crypto'
}

export function parseQuote(value: unknown): Quote | null {
  if (!isRecord(value)) return null
  const { price, currency, asOf, kind } = value
  if (!isPositive(price)) return null
  if (typeof currency !== 'string' || !CURRENCY.test(currency)) return null
  if (typeof asOf !== 'string' || !ISO_DATE.test(asOf)) return null
  return isKind(kind) ? { price, currency, asOf, kind } : { price, currency, asOf }
}

export function parseMatch(value: unknown): SecurityMatch | null {
  if (!isRecord(value)) return null
  const { symbol, name, exchange, kind } = value
  if (typeof symbol !== 'string' || !SYMBOL.test(symbol)) return null
  if (typeof name !== 'string' || typeof exchange !== 'string') return null
  if (!isKind(kind)) return null
  return { symbol, name, exchange, kind }
}

export function parseRates(value: unknown): Rates | null {
  if (!isRecord(value)) return null
  const { on, perEuro } = value
  if (typeof on !== 'string' || !ISO_DATE.test(on)) return null
  if (!isRecord(perEuro)) return null
  const entries = Object.entries(perEuro)
  if (entries.length === 0) return null
  const rates: Record<CurrencyCode, number> = {}
  for (const [code, rate] of entries) {
    if (!CURRENCY.test(code) || !isPositive(rate)) return null
    rates[code] = rate
  }
  return { on, perEuro: rates }
}
