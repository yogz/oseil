import { addDays } from '@/lib/dates'
import type { CurrencyCode, IsoDate, Profile, Snapshot } from '@/lib/model/types'
import { SYMBOL, type Market, type Quote, type Rates } from './types'

// Pure: which line gets which price today, the conversion between currencies,
// and the rates a snapshot keeps. No network, no React, no Supabase.

/** Per line id: the price of one part today, in the line's own currency. */
export type LinePrices = Record<string, number>
/** What an update reads from the market, once, when it opens. */
export type UpdateMarket = { prices: LinePrices; rates: Rates | null }
export const NO_MARKET: UpdateMarket = Object.freeze({ prices: Object.freeze({}), rates: null })

/** A price counts for 7 days at most: older, it is not « du jour ». */
export const QUOTE_MAX_AGE_DAYS = 7

const isRate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Euros for one unit of `currency`, the convention of `Snapshot.fx`.
 * The ECB gives the other way round (units for one euro): this is the only place
 * where its rate is inverted. The euro needs no rate.
 */
export function eurPerUnit(rates: Rates | null, currency: CurrencyCode): number | null {
  if (currency === 'EUR') return 1
  if (!rates || !Object.hasOwn(rates.perEuro, currency)) return null
  const perEuro = rates.perEuro[currency]
  return isRate(perEuro) ? 1 / perEuro : null
}

/**
 * The price of one part in `currency`. Kept as it is in its own currency;
 * otherwise converted through the euro and rounded to 4 decimals. Null when a rate
 * is missing, or when the rounded price is not above 0: a price is never 0.
 */
export function priceIn(quote: Quote, currency: CurrencyCode, rates: Rates | null): number | null {
  if (quote.currency === currency) return quote.price
  const from = eurPerUnit(rates, quote.currency)
  const to = eurPerUnit(rates, currency)
  if (from === null || to === null) return null
  const price = Math.round(((quote.price * from) / to) * 10_000) / 10_000
  return price > 0 ? price : null
}

/** A quote counts as today's price if it is at most QUOTE_MAX_AGE_DAYS old. */
export function isCurrent(quote: Quote, today: IsoDate): boolean {
  return quote.asOf >= addDays(today, -QUOTE_MAX_AGE_DAYS)
}

type FollowedLine = { lineId: string; symbol: string; currency: CurrencyCode }

// The open units lines attached to a price, that have a units entry in the snapshot.
function followedLines(profile: Profile, snapshot: Snapshot): FollowedLine[] {
  const held = new Set(snapshot.entries.filter((e) => e.kind === 'units').map((e) => e.lineId))
  const followed: FollowedLine[] = []
  for (const line of profile.lines) {
    if (line.kind !== 'units' || line.closedOn || !line.quoteSymbol || !held.has(line.id)) continue
    followed.push({ lineId: line.id, symbol: line.quoteSymbol, currency: line.currency })
  }
  return followed
}

/**
 * The symbols to ask for: each once, sorted, so the request does not tell the order of the lines.
 * A stored symbol that is not one is never asked: the route would refuse the whole request for it.
 */
export function quotedSymbols(profile: Profile, snapshot: Snapshot): string[] {
  const symbols = followedLines(profile, snapshot).map((l) => l.symbol)
  return [...new Set(symbols.filter((symbol) => SYMBOL.test(symbol)))].sort()
}

/**
 * Why a followed line has no price today. `price`: none could be found, or it is
 * more than QUOTE_MAX_AGE_DAYS old, or too small once converted. `rate`: the price
 * came, but no rate converts it into the line's currency.
 */
export type PriceFailure = { lineId: string; reason: 'price' | 'rate' }

/**
 * Today's price of each followed line, in the line's currency, and the lines whose
 * price failed, with the reason. A symbol that was not asked, or a price older than
 * the snapshot (which is then more recent, however old the price), is in neither
 * list: the snapshot's price stays, and nothing has failed.
 */
export function usablePrices(
  profile: Profile,
  snapshot: Snapshot,
  market: Market,
  today: IsoDate,
): { prices: LinePrices; failed: PriceFailure[] } {
  const prices: LinePrices = {}
  const failed: PriceFailure[] = []
  for (const { lineId, symbol, currency } of followedLines(profile, snapshot)) {
    if (!Object.hasOwn(market.quotes, symbol)) continue
    const quote = market.quotes[symbol]
    if (!quote) {
      failed.push({ lineId, reason: 'price' })
      continue
    }
    // Not newer than the snapshot: first, so that an old price is never told as a failure.
    if (quote.asOf < snapshot.takenOn) continue
    if (!isCurrent(quote, today)) {
      failed.push({ lineId, reason: 'price' })
      continue
    }
    const price = priceIn(quote, currency, market.rates)
    if (price !== null) prices[lineId] = price
    else {
      const converts = eurPerUnit(market.rates, quote.currency) !== null && eurPerUnit(market.rates, currency) !== null
      failed.push({ lineId, reason: converts ? 'price' : 'rate' })
    }
  }
  return { prices, failed }
}

/**
 * A copy of the snapshot where only the price of one part of the given lines
 * changes. Its date, its rates and what was seen when stay as they were.
 */
export function withPrices(snapshot: Snapshot, prices: LinePrices): Snapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.map((entry) =>
      entry.kind === 'units' && Object.hasOwn(prices, entry.lineId)
        ? { ...entry, unitPrice: prices[entry.lineId] }
        : entry,
    ),
  }
}

/**
 * The rates a snapshot keeps, in euros for one unit.
 * `on`: the ECB day, when at least one currency took today's rate.
 * `answered`: today's rates arrived, whether or not they hold every currency.
 * `fromBase`: the currencies that kept the base snapshot's rate.
 * `missing`: the currencies with no rate at all.
 */
export type RateUse = {
  fx: Snapshot['fx']
  on: IsoDate | null
  answered: boolean
  fromBase: CurrencyCode[]
  missing: CurrencyCode[]
}

export function ratesFor(currencies: CurrencyCode[], base: Snapshot['fx'], rates: Rates | null): RateUse {
  const fx: Snapshot['fx'] = {}
  const fromBase: CurrencyCode[] = []
  const missing: CurrencyCode[] = []
  let tookToday = false
  for (const currency of new Set(currencies)) {
    if (currency === 'EUR') continue
    const today = eurPerUnit(rates, currency)
    if (today !== null) {
      fx[currency] = today
      tookToday = true
    } else if (Object.hasOwn(base, currency) && isRate(base[currency])) {
      fx[currency] = base[currency]
      fromBase.push(currency)
    } else {
      missing.push(currency)
    }
  }
  return { fx, on: tookToday && rates ? rates.on : null, answered: rates !== null, fromBase, missing }
}

/**
 * The snapshot without the entries that no rate converts to euros, and the names of
 * their lines. A screen can then add up everything else and say what it left out,
 * instead of failing. An entry of an unknown line stays: that is an inconsistency
 * the model reports itself.
 */
export function convertible(profile: Profile, snapshot: Snapshot): { snapshot: Snapshot; names: string[] } {
  const names: string[] = []
  const entries = snapshot.entries.filter((entry) => {
    const line = profile.lines.find((l) => l.id === entry.lineId)
    if (!line || line.currency === 'EUR' || (Object.hasOwn(snapshot.fx, line.currency) && isRate(snapshot.fx[line.currency]))) return true
    names.push(line.name)
    return false
  })
  return names.length === 0 ? { snapshot, names } : { snapshot: { ...snapshot, entries }, names }
}
