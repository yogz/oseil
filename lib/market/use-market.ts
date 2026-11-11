'use client'

// What a screen knows of today's market. Results live in the tab's memory only
// (a module-level Map, never localStorage: the symbols are the person's
// holdings). A price is kept TAB_TTL_MS, a failure TAB_FAILURE_TTL_MS, and
// only the symbols the tab does not hold are asked.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { requestQuotes, requestRates } from './client'
import type { Market, Quote, Rates } from './types'

export const TAB_TTL_MS = 300_000
export const TAB_FAILURE_TTL_MS = 60_000

type Held<T> = { value: T; until: number }
const quotesHeld = new Map<string, Held<Quote | null>>()
let ratesHeld: Held<Rates | null> | null = null

export type MarketState = { status: 'loading' } | { status: 'ready'; market: Market; retry: () => void }

/** Tests only: empties the tab's memory. */
export function forgetMarket(): void {
  quotesHeld.clear()
  quotesPending.clear()
  ratesHeld = null
  ratesPending = null
}

function fresh<T>(held: Held<T> | null | undefined): held is Held<T> {
  return !!held && held.until > Date.now()
}

function keep<T>(value: T | null): Held<T | null> {
  return { value, until: Date.now() + (value === null ? TAB_FAILURE_TTL_MS : TAB_TTL_MS) }
}

function missing(symbols: string[]): string[] {
  return symbols.filter((symbol) => !fresh(quotesHeld.get(symbol)))
}

// Requests in flight, so two mounts (or StrictMode's double effect) asking for
// the same thing make one call. An entry is removed when its request settles.
const quotesPending = new Map<string, Promise<void>>()
let ratesPending: Promise<void> | null = null

async function fillQuotes(symbols: string[]): Promise<void> {
  const toAsk = symbols.filter((symbol) => !quotesPending.has(symbol))
  if (toAsk.length > 0) {
    const request = requestQuotes(toAsk).then(
      (answer) => {
        for (const symbol of toAsk) quotesHeld.set(symbol, keep(answer?.[symbol] ?? null))
      },
      () => {
        for (const symbol of toAsk) quotesHeld.set(symbol, keep(null))
      },
    ).finally(() => {
      for (const symbol of toAsk) quotesPending.delete(symbol)
    })
    for (const symbol of toAsk) quotesPending.set(symbol, request)
  }
  await Promise.all(symbols.map((symbol) => quotesPending.get(symbol)))
}

async function fillRates(): Promise<void> {
  if (fresh(ratesHeld)) return
  ratesPending ??= requestRates()
    .then(
      (rates) => {
        ratesHeld = keep(rates)
      },
      () => {
        ratesHeld = keep(null)
      },
    )
    .finally(() => {
      ratesPending = null
    })
  await ratesPending
}

export function useMarket(symbols: readonly string[], options?: { rates?: boolean }): MarketState {
  const wantRates = options?.rates === true
  const key = [...new Set(symbols)].sort().join('\n')
  const [tick, setTick] = useState(0)

  const asked = useMemo(() => (key === '' ? [] : key.split('\n')), [key])
  // `tick` is read so a fill or a retry re-evaluates what the tab holds.
  const market = useMemo<Market | null>(() => {
    void tick
    if (missing(asked).length > 0) return null
    if (wantRates && !fresh(ratesHeld)) return null
    const quotes: Record<string, Quote | null> = {}
    for (const symbol of asked) quotes[symbol] = quotesHeld.get(symbol)!.value
    return { quotes, rates: wantRates ? ratesHeld!.value : null }
  }, [asked, wantRates, tick])

  useEffect(() => {
    if (market) return
    let cancelled = false
    Promise.all([fillQuotes(missing(asked)), wantRates ? fillRates() : undefined]).then(() => {
      if (!cancelled) setTick((count) => count + 1)
    })
    return () => {
      cancelled = true
    }
  }, [market, asked, wantRates])

  const retry = useCallback(() => {
    for (const symbol of asked) quotesHeld.delete(symbol)
    if (wantRates) ratesHeld = null
    setTick((count) => count + 1)
  }, [asked, wantRates])

  return market ? { status: 'ready', market, retry } : { status: 'loading' }
}

export function useRates(enabled: boolean): { status: 'idle' | 'loading' } | { status: 'ready'; rates: Rates | null } {
  const [tick, setTick] = useState(0)
  const held = enabled && fresh(ratesHeld) ? ratesHeld : null
  void tick

  useEffect(() => {
    if (!enabled || held) return
    let cancelled = false
    fillRates().then(() => {
      if (!cancelled) setTick((count) => count + 1)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, held])

  if (!enabled) return { status: 'idle' }
  return held ? { status: 'ready', rates: held.value } : { status: 'loading' }
}
