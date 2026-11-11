import { describe, expect, it } from 'vitest'
import {
  NO_MARKET,
  QUOTE_MAX_AGE_DAYS,
  eurPerUnit,
  priceIn,
  quotedSymbols,
  ratesFor,
  usablePrices,
  withPrices,
} from '../live'
import type { Market, Quote, Rates } from '../types'
import type { Line, Profile, Snapshot } from '@/lib/model/types'
import { detachSymbol } from '@/lib/screens/titles'
import { exampleProfile, exampleSnapshot, unitsEntry } from '@/lib/model/__tests__/fixtures'

const RATES: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
const TODAY = '2026-11-08'

const withLines = (change: (line: Line) => Line, base: Profile = exampleProfile): Profile => ({
  ...base,
  lines: base.lines.map(change),
})
const PROFILE = withLines((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l))

const quote = (extra: Partial<Quote> = {}): Quote => ({ price: 260, currency: 'EUR', asOf: '2026-11-06', ...extra })
// Why a line has no price today: its price could not be had, or no rate converts it.
const noPrice = (lineId: string) => ({ lineId, reason: 'price' as const })
const noRate = (lineId: string) => ({ lineId, reason: 'rate' as const })
const market = (q: Quote | null, rates: Rates | null = RATES): Market => ({ quotes: { 'CW8.PA': q }, rates })

describe('the constants', () => {
  it('a price counts for 7 days', () => {
    expect(QUOTE_MAX_AGE_DAYS).toBe(7)
  })

  it('no market: no price and no rate', () => {
    expect(NO_MARKET).toEqual({ prices: {}, rates: null })
  })
})

describe('eurPerUnit', () => {
  it('gives 1 for the euro, even without rates', () => {
    expect(eurPerUnit(null, 'EUR')).toBe(1)
    expect(eurPerUnit(RATES, 'EUR')).toBe(1)
  })

  it('turns « units for one euro » into « euros for one unit »', () => {
    expect(eurPerUnit(RATES, 'USD')).toBeCloseTo(0.895656, 6)
    expect(eurPerUnit(RATES, 'USD')).toBe(1 / 1.1165)
  })

  it('gives null without rates or without that currency', () => {
    expect(eurPerUnit(RATES, 'JPY')).toBeNull()
    expect(eurPerUnit(null, 'USD')).toBeNull()
  })

  it('gives null for a rate that is not a number above 0, and for a name of Object', () => {
    expect(eurPerUnit({ on: RATES.on, perEuro: { USD: 0 } }, 'USD')).toBeNull()
    expect(eurPerUnit({ on: RATES.on, perEuro: { USD: Number.NaN } }, 'USD')).toBeNull()
    expect(eurPerUnit(RATES, 'constructor')).toBeNull()
  })
})

describe('priceIn (Review Focus 1)', () => {
  it('keeps a price in its own currency as it is, without rounding', () => {
    expect(priceIn(quote({ price: 692.3 }), 'EUR', RATES)).toBe(692.3)
    expect(priceIn(quote({ price: 692.3 }), 'EUR', null)).toBe(692.3)
    expect(priceIn(quote({ price: 10.123456, currency: 'USD' }), 'USD', null)).toBe(10.123456)
  })

  it('converts a dollar price into euros, rounded to 4 decimals', () => {
    expect(priceIn(quote({ price: 342.37, currency: 'USD' }), 'EUR', RATES)).toBe(306.6458)
  })

  it('converts between two currencies through the euro', () => {
    expect(priceIn(quote({ price: 10.392, currency: 'GBP' }), 'USD', RATES)).toBe(13.9096)
  })

  it('converts a London price in pounds into euros, for a line in a PEA', () => {
    // 1 039,2 pence on Yahoo, already turned into 10,392 £ by task 1: 12,4582 €, never 1 245 €.
    expect(priceIn(quote({ price: 10.392, currency: 'GBP' }), 'EUR', RATES)).toBe(12.4582)
    expect(
      usablePrices(PROFILE, exampleSnapshot, market(quote({ price: 10.392, currency: 'GBP' })), TODAY),
    ).toEqual({ prices: { etf: 12.4582 }, failed: [] })
  })

  it('a price still in pence, GBp or GBX, is never taken for pounds', () => {
    expect(priceIn(quote({ price: 1039.2, currency: 'GBp' }), 'EUR', RATES)).toBeNull()
    expect(priceIn(quote({ price: 1039.2, currency: 'GBX' }), 'EUR', RATES)).toBeNull()
    expect(priceIn(quote({ price: 1039.2, currency: 'GBX' }), 'GBP', RATES)).toBeNull()
    expect(
      usablePrices(PROFILE, exampleSnapshot, market(quote({ price: 1039.2, currency: 'GBp' })), TODAY),
    ).toEqual({ prices: {}, failed: [noRate('etf')] })
  })

  it('a converted price too small to be written with 4 decimals is missing, never 0', () => {
    expect(priceIn(quote({ price: 0.00004, currency: 'USD' }), 'EUR', RATES)).toBeNull()
    expect(
      usablePrices(PROFILE, exampleSnapshot, market(quote({ price: 0.00004, currency: 'USD' })), TODAY),
    ).toEqual({ prices: {}, failed: [noPrice('etf')] })
  })

  it('gives null when a rate is missing', () => {
    expect(priceIn(quote({ price: 342.37, currency: 'USD' }), 'EUR', null)).toBeNull()
    expect(priceIn(quote({ price: 342.37, currency: 'JPY' }), 'EUR', RATES)).toBeNull()
    expect(priceIn(quote({ price: 692.3 }), 'JPY', RATES)).toBeNull()
  })
})

describe('usablePrices (Review Focus 3)', () => {
  it('takes a recent price', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(quote()), TODAY)).toEqual({
      prices: { etf: 260 },
      failed: [],
    })
  })

  it('a price that could not be found has failed', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(null), TODAY)).toEqual({ prices: {}, failed: [noPrice('etf')] })
  })

  it('a price 8 days old has failed', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(quote({ asOf: '2026-10-31' })), TODAY)).toEqual({
      prices: {},
      failed: [noPrice('etf')],
    })
  })

  it('a price 7 days old still counts', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(quote({ asOf: '2026-11-01' })), TODAY)).toEqual({
      prices: { etf: 260 },
      failed: [],
    })
  })

  it('a Friday close read on Sunday, after a snapshot of Saturday, leaves the snapshot’s price', () => {
    const saturday: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-07' }
    expect(usablePrices(PROFILE, saturday, market(quote({ asOf: '2026-11-06' })), TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('a price of the snapshot’s own day counts', () => {
    const friday: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-06' }
    expect(usablePrices(PROFILE, friday, market(quote({ asOf: '2026-11-06' })), TODAY).prices).toEqual({ etf: 260 })
  })

  it('a price that was not asked is in neither list', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, { quotes: {}, rates: RATES }, TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('a symbol named like a property of Object is not taken for an answer', () => {
    const profile = withLines((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'constructor' } : l))
    expect(usablePrices(profile, exampleSnapshot, { quotes: {}, rates: RATES }, TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('ignores a closed line, and an amount line with a symbol', () => {
    const closed = withLines((l) => (l.id === 'etf' ? { ...l, closedOn: '2026-10-15' } : l), PROFILE)
    expect(usablePrices(closed, exampleSnapshot, market(quote()), TODAY)).toEqual({ prices: {}, failed: [] })

    const amount = withLines((l) => (l.id === 'euro-fund' ? { ...l, quoteSymbol: 'CW8.PA' } : l))
    expect(usablePrices(amount, exampleSnapshot, market(quote()), TODAY)).toEqual({ prices: {}, failed: [] })
    expect(usablePrices(amount, exampleSnapshot, market(null), TODAY)).toEqual({ prices: {}, failed: [] })
  })

  it('ignores a line absent from the snapshot', () => {
    const without: Snapshot = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'etf') }
    expect(usablePrices(PROFILE, without, market(null), TODAY)).toEqual({ prices: {}, failed: [] })
  })

  it('converts a price quoted in another currency', () => {
    expect(
      usablePrices(PROFILE, exampleSnapshot, market(quote({ price: 342.37, currency: 'USD' })), TODAY),
    ).toEqual({ prices: { etf: 306.6458 }, failed: [] })
  })

  it('a dollar price without rates has failed for want of a rate, not of a price (F4)', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(quote({ currency: 'USD' }), null), TODAY)).toEqual({
      prices: {},
      failed: [noRate('etf')],
    })
  })

  it('a price in a currency the rates lack, or a dollar line without rates, fails for want of a rate', () => {
    expect(usablePrices(PROFILE, exampleSnapshot, market(quote({ currency: 'JPY' })), TODAY).failed).toEqual([noRate('etf')])
    const inDollars = withLines((l) => (l.id === 'etf' ? { ...l, currency: 'USD' } : l), PROFILE)
    expect(usablePrices(inDollars, exampleSnapshot, market(quote(), null), TODAY).failed).toEqual([noRate('etf')])
  })

  it('a snapshot more recent than the price wins, even when the price could not be converted', () => {
    const saturday: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-07' }
    expect(usablePrices(PROFILE, saturday, market(quote({ currency: 'USD' }), null), TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('a price older than the snapshot is not newer, however old: neither taken nor failed (F5)', () => {
    const recent: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-07' }
    expect(usablePrices(PROFILE, recent, market(quote({ asOf: '2026-05-29' })), TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('a fund priced once a week, right after an update: its last price is older than the snapshot, and nothing failed', () => {
    // The update was saved yesterday; the fund's last price is of the Friday before, 9 days ago.
    const yesterday: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-07' }
    expect(usablePrices(PROFILE, yesterday, market(quote({ asOf: '2026-10-30' })), TODAY)).toEqual({
      prices: {},
      failed: [],
    })
  })

  it('a price newer than the snapshot but more than 7 days old has failed', () => {
    const old: Snapshot = { ...exampleSnapshot, takenOn: '2026-10-15' }
    expect(usablePrices(PROFILE, old, market(quote({ asOf: '2026-10-30' })), TODAY).failed).toEqual([noPrice('etf')])
  })

  it('two lines on one symbol both get its price', () => {
    const both = withLines((l) => (l.id === 'life-uc' ? { ...l, quoteSymbol: 'CW8.PA' } : l), PROFILE)
    expect(usablePrices(both, exampleSnapshot, market(quote()), TODAY)).toEqual({
      prices: { etf: 260, 'life-uc': 260 },
      failed: [],
    })
    expect(usablePrices(both, exampleSnapshot, market(null), TODAY)).toEqual({
      prices: {},
      failed: [noPrice('etf'), noPrice('life-uc')],
    })
  })
})

describe('withPrices', () => {
  it('changes only the price of one part of the lines given', () => {
    const before = structuredClone(exampleSnapshot)
    const after = withPrices(exampleSnapshot, { etf: 260 })

    const index = exampleSnapshot.entries.findIndex((e) => e.lineId === 'etf')
    expect(after.entries[index]).toEqual(unitsEntry('etf', 100, 260, 200))
    expect(after.entries[index].seenOn).toBe(exampleSnapshot.entries[index].seenOn)
    after.entries.forEach((entry, i) => {
      if (i !== index) expect(entry).toEqual(exampleSnapshot.entries[i])
    })
    expect(after.entries).toHaveLength(exampleSnapshot.entries.length)
    expect({ ...after, entries: [] }).toEqual({ ...exampleSnapshot, entries: [] })
    expect(exampleSnapshot).toEqual(before)
  })

  it('never changes an amount entry', () => {
    expect(withPrices(exampleSnapshot, { 'current-line': 5 })).toEqual(exampleSnapshot)
  })

  it('with no price, gives the same figures', () => {
    expect(withPrices(exampleSnapshot, {})).toEqual(exampleSnapshot)
  })
})

describe('quotedSymbols', () => {
  it('gives each symbol once, sorted, so the request does not tell the order of the lines', () => {
    const profile = withLines((l) => (l.id === 'life-uc' ? { ...l, quoteSymbol: 'CW8.PA' } : l), PROFILE)
    profile.lines.push({ id: 'ai', accountId: 'pea', name: 'Air Liquide', kind: 'units', currency: 'EUR', quoteSymbol: 'AI.PA' })
    const snapshot: Snapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, unitsEntry('ai', 5, 180, null)] }
    expect(quotedSymbols(profile, snapshot)).toEqual(['AI.PA', 'CW8.PA'])
  })

  it('leaves out closed lines, amount lines and lines absent from the snapshot', () => {
    const profile = withLines((l) => {
      if (l.id === 'life-uc') return { ...l, quoteSymbol: 'ZZ.PA', closedOn: '2026-10-15' }
      if (l.id === 'euro-fund') return { ...l, quoteSymbol: 'YY.PA' }
      return l
    }, PROFILE)
    profile.lines.push({ id: 'new', accountId: 'pea', name: 'Nouveau', kind: 'units', currency: 'EUR', quoteSymbol: 'XX.PA' })
    expect(quotedSymbols(profile, exampleSnapshot)).toEqual(['CW8.PA'])
    expect(quotedSymbols(exampleProfile, exampleSnapshot)).toEqual([])
  })

  // F8: the route refuses a whole request with one bad symbol in it; a bad one stored is never asked.
  it('leaves out a stored symbol that is not one, so the others are still asked', () => {
    for (const bad of ['CW8 PA', '^FCHI', 'A'.repeat(21), '', '.PA']) {
      const profile = withLines((l) => (l.id === 'life-uc' ? { ...l, quoteSymbol: bad } : l), PROFILE)
      expect(quotedSymbols(profile, exampleSnapshot)).toEqual(['CW8.PA'])
    }
  })
})

describe('ratesFor', () => {
  it('takes today’s rate, once per currency, never for the euro', () => {
    const use = ratesFor(['USD', 'EUR', 'USD'], {}, RATES)
    expect(Object.keys(use.fx)).toEqual(['USD'])
    expect(use.fx.USD).toBeCloseTo(0.895656, 6)
    expect(use.fx.USD).toBe(eurPerUnit(RATES, 'USD'))
    expect(use).toMatchObject({ on: '2026-11-06', answered: true, fromBase: [], missing: [] })
  })

  it('today’s rate wins over the base snapshot’s', () => {
    const use = ratesFor(['USD'], { USD: 0.92 }, RATES)
    expect(use.fx.USD).toBeCloseTo(0.895656, 6)
    expect(use.fromBase).toEqual([])
  })

  it('without today’s rates, keeps the base snapshot’s rate and says so', () => {
    expect(ratesFor(['USD'], { USD: 0.92 }, null)).toEqual({
      fx: { USD: 0.92 },
      on: null,
      answered: false,
      fromBase: ['USD'],
      missing: [],
    })
  })

  it('without any rate, the currency is missing, never 0', () => {
    const none = { fx: {}, on: null, answered: false, fromBase: [], missing: ['USD'] }
    expect(ratesFor(['USD'], {}, null)).toEqual(none)
    expect(ratesFor(['USD'], { USD: 0 }, null)).toEqual(none)
  })

  it('a currency the ECB does not publish is missing, though the ECB answered', () => {
    expect(ratesFor(['JPY'], {}, RATES)).toEqual({ fx: {}, on: null, answered: true, fromBase: [], missing: ['JPY'] })
  })

  it('keeps the base snapshot’s rate of a currency the ECB answered without', () => {
    expect(ratesFor(['CHF'], { CHF: 1.05 }, { on: '2026-11-06', perEuro: { USD: 1.1 } })).toEqual({
      fx: { CHF: 1.05 },
      on: null,
      answered: true,
      fromBase: ['CHF'],
      missing: [],
    })
  })

  it('drops the rates no currency asks for', () => {
    expect(ratesFor(['USD'], { USD: 0.92, GBP: 1.19 }, null).fx).toEqual({ USD: 0.92 })
    expect(ratesFor(['EUR'], { USD: 0.92 }, RATES)).toEqual({ fx: {}, on: null, answered: true, fromBase: [], missing: [] })
  })

  it('mixes today’s rates and the base snapshot’s, in the order asked', () => {
    const partial: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165 } }
    const use = ratesFor(['CHF', 'USD', 'GBP', 'JPY'], { GBP: 1.19, CHF: 1.05 }, partial)
    expect(use.fx).toEqual({ CHF: 1.05, USD: 1 / 1.1165, GBP: 1.19 })
    expect(use).toMatchObject({ on: '2026-11-06', answered: true, fromBase: ['CHF', 'GBP'], missing: ['JPY'] })
  })
})

describe('a detached line', () => {
  it('stops moving: no price, and nothing failed, for the line whose symbol was removed', () => {
    const m = market(quote())
    expect(usablePrices(PROFILE, exampleSnapshot, m, TODAY).prices.etf).toBe(260)
    const detached = usablePrices(detachSymbol(PROFILE, 'etf'), exampleSnapshot, m, TODAY)
    expect(detached.prices).toEqual({})
    expect(detached.failed).toEqual([])
    expect(quotedSymbols(detachSymbol(PROFILE, 'etf'), exampleSnapshot)).toEqual([])
  })
})
