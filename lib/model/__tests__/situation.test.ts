import { describe, expect, it } from 'vitest'
import {
  MissingRateError,
  UncategorisedLineError,
  UnknownLineError,
  categoryOf,
  computeSituation,
  entryMinorUnits,
  entryValue,
  toEuroCents,
} from '@/lib/model/situation'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
  unitsEntry,
} from './fixtures'

const valueOf = (s: ReturnType<typeof computeSituation>, id: string) =>
  s.categories.find((c) => c.category === id)!.value

const caught = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

describe('computeSituation', () => {
  it('computes the example', () => {
    const s = computeSituation(exampleProfile, exampleSnapshot)
    expect(s.owned).toBe(38_200_000)
    expect(s.owed).toBe(18_000_000)
    expect(s.net).toBe(20_200_000)
    expect(s.categories.map((c) => [c.category, c.value])).toEqual([
      ['available', 2_000_000],
      ['secured', 3_000_000],
      ['markets', 3_000_000],
      ['gold', 200_000],
      ['property', 12_000_000],
    ])
    expect(s.categories[4].lines).toEqual([{ lineId: 'house-line', category: 'property', value: 12_000_000 }])
  })

  it('keeps what each line holds before any loan', () => {
    const s = computeSituation(exampleProfile, exampleSnapshot)
    expect(s.holdings.find((h) => h.lineId === 'house-line')).toEqual({
      lineId: 'house-line',
      category: 'property',
      value: 30_000_000,
    })
    expect(s.holdings.map((h) => h.lineId)).not.toContain('mortgage-line')
    expect(s.holdings.reduce((sum, h) => sum + h.value, 0)).toBe(s.owned)
  })

  it('ignores lines absent from the snapshot', () => {
    const s = computeSituation(exampleProfile, { ...exampleSnapshot, entries: [amountEntry('gold-line', 2_000)] })
    expect(s.owned).toBe(200_000)
    expect(s.owed).toBe(0)
  })

  it('refuses an unknown line', () => {
    const err = caught(() => computeSituation(exampleProfile, snapshotOf([amountEntry('x', 1)])))
    expect(err).toBeInstanceOf(UnknownLineError)
    expect((err as UnknownLineError).lineId).toBe('x')
  })

  it('an unattached loan lowers available money', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('car', 'loan')],
      [line('cur-l', 'cur'), line('car-l', 'car')],
    )
    const s = computeSituation(profile, snapshotOf([amountEntry('cur-l', 10_000), amountEntry('car-l', 6_000)]))
    expect(valueOf(s, 'available')).toBe(400_000)
    expect(s.owed).toBe(600_000)
    expect(s.net).toBe(400_000)
    // the lines themselves stay gross
    expect(s.categories[0].lines).toEqual([{ lineId: 'cur-l', category: 'available', value: 1_000_000 }])
  })

  it("a person’s category choice wins", () => {
    const profile = profileOf([account('o', 'other')], [line('o-l', 'o', { category: 'secured' })])
    const s = computeSituation(profile, snapshotOf([amountEntry('o-l', 500)]))
    expect(valueOf(s, 'secured')).toBe(50_000)
  })

  it('refuses an uncategorised line of an other account', () => {
    const profile = profileOf([account('o', 'other')], [line('o-l', 'o')])
    expect(caught(() => computeSituation(profile, snapshotOf([amountEntry('o-l', 500)])))).toBeInstanceOf(
      UncategorisedLineError,
    )
  })

  it('refuses an entry whose kind differs from its line', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    expect(() => computeSituation(profile, snapshotOf([unitsEntry('cur-l', 1, 1, null)]))).toThrow()
  })

  it('subtracts a loan whose property is absent from available money', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('l', 'loan', { financedLineId: 'gone' })],
      [line('cur-l', 'cur'), line('l-l', 'l')],
    )
    const s = computeSituation(profile, snapshotOf([amountEntry('cur-l', 1_000), amountEntry('l-l', 400)]))
    expect(valueOf(s, 'available')).toBe(60_000)
  })

  it('lets a category go negative', () => {
    const profile = profileOf([account('l', 'loan')], [line('l-l', 'l')])
    const s = computeSituation(profile, snapshotOf([amountEntry('l-l', 100)]))
    expect(valueOf(s, 'available')).toBe(-10_000)
    expect(s.net).toBe(-10_000)
  })
})

describe('entryValue', () => {
  it('converts at the snapshot rate', () => {
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    expect(entryValue(unitsEntry('l', 10, 150, null), l, { USD: 0.95 })).toBe(142_500)
  })

  it('rounds once', () => {
    const l = line('l', 'a', { kind: 'units' })
    const v = entryValue(unitsEntry('l', 0.00123456, 61_234.56, null), l, {})
    expect(v).toBe(Math.round(0.00123456 * 61_234.56 * 100))
    expect(v).toBe(7_560)
  })

  it('converts an amount in a foreign currency', () => {
    const l = line('l', 'a', { currency: 'USD' })
    expect(entryValue(amountEntry('l', 100), l, { USD: 0.5 })).toBe(5_000)
  })

  it('refuses a missing rate', () => {
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    const err = caught(() => entryValue(unitsEntry('l', 1, 1, null), l, {}))
    expect(err).toBeInstanceOf(MissingRateError)
    expect((err as MissingRateError).currency).toBe('USD')
  })

  it('converts the value the bank shows, in the line’s own currency, rounded to the cent', () => {
    // 3 × 0,333 $ is 99,9 cents: the bank shows 1,00 $, and 1,00 $ at 0,895656 is 90 cents (not 89).
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    const entry = unitsEntry('l', 3, 0.333, null)
    expect(entryValue(entry, l, { USD: 0.895656 })).toBe(90)
    expect(entryValue(entry, l, { USD: 0.895656 })).toBe(Math.round(entryMinorUnits(entry) * 0.895656))
  })
})

describe('toEuroCents', () => {
  it('rounds in the line’s currency, then once more with the rate', () => {
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    expect(toEuroCents(99.9, l, { USD: 0.895656 })).toBe(90)
    expect(toEuroCents(15_533.48888, l, { USD: 1 / 1.1165 })).toBe(13_912)
  })

  it('needs no rate for the euro', () => {
    expect(toEuroCents(99.9, line('l', 'a'), {})).toBe(100)
  })

  it('refuses a missing rate', () => {
    const err = caught(() => toEuroCents(100, line('l', 'a', { currency: 'USD' }), {}))
    expect(err).toBeInstanceOf(MissingRateError)
    expect((err as MissingRateError).currency).toBe('USD')
  })

  it('is the rounding entryValue uses', () => {
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    const entry = unitsEntry('l', 11.228, 13.8346, null)
    expect(entryValue(entry, l, { USD: 1 / 1.1165 })).toBe(toEuroCents(11.228 * 13.8346 * 100, l, { USD: 1 / 1.1165 }))
  })
})

describe('entryMinorUnits', () => {
  it('gives an amount as it is', () => {
    expect(entryMinorUnits(amountEntry('l', 1_200))).toBe(120_000)
  })

  it('gives parts × price of one part, in cents', () => {
    expect(entryMinorUnits(unitsEntry('l', 100, 250, null))).toBe(2_500_000)
  })

  it('rounds to the cent', () => {
    expect(entryMinorUnits(unitsEntry('l', 3, 0.333, null))).toBe(100)
  })

  it('needs no rate: it stays in the line’s own currency', () => {
    const l = line('l', 'a', { kind: 'units', currency: 'USD' })
    const entry = unitsEntry('l', 10, 150, null)
    expect(entryMinorUnits(entry)).toBe(150_000)
    expect(entryValue(entry, l, { USD: 0.95 })).toBe(142_500)
  })
})

describe('categoryOf', () => {
  it('is null for a loan', () => {
    expect(categoryOf(line('l', 'a'), account('a', 'loan'))).toBeNull()
  })

  it('uses the account default for the line kind', () => {
    const a = account('a', 'life-insurance')
    expect(categoryOf(line('x', 'a'), a)).toBe('secured')
    expect(categoryOf(line('y', 'a', { kind: 'units' }), a)).toBe('markets')
  })
})
