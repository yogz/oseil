import type { AccountTypeId, CurrencyCode } from '@/lib/model/types'
import type { SecurityMatch } from './types'

// Yahoo quotes a coin as a pair: « BTC-USD », « BTC-EUR ». Its search mostly finds the dollar
// pair, even for a person who counts in euros (checked on 11 November 2026: « ethereum » finds
// ETH-USD only, while ETH-EUR has a price). The search keeps one result per coin, and the pick
// asks for the pair in the line's currency first, then for the pair found.
const PAIR = /^([A-Z0-9]+)-([A-Z]{3})$/

/** The symbols to ask for a pick, best first. A share, or a coin already in `currency`: itself. */
export function symbolsToTry(match: SecurityMatch, currency: CurrencyCode): string[] {
  if (match.kind !== 'crypto') return [match.symbol]
  const pair = PAIR.exec(match.symbol)
  if (!pair || pair[2] === currency) return [match.symbol]
  return [`${pair[1]}-${currency}`, match.symbol]
}

/** The coin of a pair (« BTC » for « BTC-USD »), or the symbol itself. */
export function coinOf(symbol: string): string {
  return PAIR.exec(symbol)?.[1] ?? symbol
}

/** A crypto account searches coins only; any other account, never a coin. */
export function fitsAccount(match: SecurityMatch, accountType: AccountTypeId): boolean {
  return (match.kind === 'crypto') === (accountType === 'crypto')
}
