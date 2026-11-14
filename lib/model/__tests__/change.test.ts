import { describe, expect, it } from 'vitest'
import { hasBothTotals, splitChange, wholeAccountChanges } from '@/lib/model/change'
import { UnknownLineError } from '@/lib/model/situation'
import type { Snapshot } from '@/lib/model/types'
import { account, amountEntry, line, profileOf, snapshotOf, unitsEntry } from './fixtures'

const check = (split: ReturnType<typeof splitChange>) =>
  expect(split.effort + split.markets + split.property + split.existingAdded).toBe(split.total)

const withExtra = (s: Snapshot, extra: Partial<Snapshot>): Snapshot => ({ ...s, ...extra })

describe('splitChange', () => {
  it('counts a savings account increase as your effort', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const r = splitChange(profile, snapshotOf([amountEntry('l', 10_000)]), snapshotOf([amountEntry('l', 10_300)]))
    expect(r).toEqual({ effort: 30_000, markets: 0, property: 0, existingAdded: 0, total: 30_000, estimatedInterest: 0 })
    check(r)
  })

  it('splits an ETF line between purchases at cost and markets', () => {
    const profile = profileOf([account('a', 'pea')], [line('l', 'a', { kind: 'units' })])
    const r = splitChange(
      profile,
      snapshotOf([unitsEntry('l', 100, 250, 200)]),
      snapshotOf([unitsEntry('l', 120, 260, 210)]),
    )
    expect(r.effort).toBe(520_000)
    expect(r.markets).toBe(100_000)
    check(r)
  })

  it('handles a contributions account at account level', () => {
    const profile = profileOf([account('a', 'life-insurance')], [line('f', 'a'), line('u', 'a')])
    const r = splitChange(
      profile,
      snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)]),
      withExtra(snapshotOf([amountEntry('f', 31_500), amountEntry('u', 5_400)]), { contributions: { a: 120_000 } }),
    )
    expect(r.effort).toBe(120_000)
    expect(r.markets).toBe(70_000)
    check(r)
  })

  it('counts a loan repayment as your effort', () => {
    const profile = profileOf([account('a', 'loan')], [line('l', 'a')])
    const r = splitChange(profile, snapshotOf([amountEntry('l', 180_000)]), snapshotOf([amountEntry('l', 176_000)]))
    expect(r.effort).toBe(400_000)
    check(r)
  })

  it('counts a re-estimated home as property', () => {
    const profile = profileOf([account('a', 'home')], [line('l', 'a')])
    const r = splitChange(profile, snapshotOf([amountEntry('l', 300_000)]), snapshotOf([amountEntry('l', 310_000)]))
    expect(r.property).toBe(1_000_000)
    expect(r.effort).toBe(0)
    check(r)
  })

  it('counts an opened account as effort and a forgotten one as existingAdded', () => {
    const profile = profileOf(
      [account('a', 'livret-a'), account('b', 'livret-a'), account('c', 'livret-a')],
      [line('base', 'a'), line('new', 'b'), line('old', 'c')],
    )
    const before = snapshotOf([amountEntry('base', 1_000)])
    const after = withExtra(
      snapshotOf([amountEntry('base', 1_000), amountEntry('new', 2_000), amountEntry('old', 5_000)]),
      { arrivals: { new: 'opened', old: 'existing' } },
    )
    const r = splitChange(profile, before, after)
    expect(r.effort).toBe(200_000)
    expect(r.existingAdded).toBe(500_000)
    expect(r.total).toBe(700_000)
    check(r)
  })

  it('treats a missing arrival flag as existing', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const r = splitChange(profile, snapshotOf([]), snapshotOf([amountEntry('l', 100)]))
    expect(r.existingAdded).toBe(10_000)
    expect(r.effort).toBe(0)
    check(r)
  })

  it('counts a disappeared line as negative effort', () => {
    const profile = profileOf([account('a', 'securities')], [line('x', 'a'), line('y', 'a')])
    const r = splitChange(
      profile,
      snapshotOf([amountEntry('x', 1_000), amountEntry('y', 3_000)]),
      snapshotOf([amountEntry('x', 1_000)]),
    )
    expect(r.effort).toBe(-300_000)
    check(r)
  })

  it('sends a currency gap to markets', () => {
    const profile = profileOf([account('a', 'securities')], [line('l', 'a', { kind: 'units', currency: 'USD' })])
    const r = splitChange(
      profile,
      snapshotOf([unitsEntry('l', 10, 150, 100)], { USD: 0.9 }),
      snapshotOf([unitsEntry('l', 10, 150, 100)], { USD: 0.95 }),
    )
    expect(r.effort).toBe(0)
    expect(r.markets).toBe(7_500)
    check(r)
  })

  it('parts in dollars bought at an unchanged price are all effort: what was spent rounds like the value', () => {
    const profile = profileOf([account('a', 'securities')], [line('l', 'a', { kind: 'units', currency: 'USD' })])
    const fx = { USD: 1 / 1.1165 }
    for (const average of [13.8346, null]) {
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 4, 13.8346, average)], fx),
        snapshotOf([unitsEntry('l', 15.228, 13.8346, average)], fx),
      )
      expect(r.effort, `average ${average}`).toBe(13_912)
      expect(r.markets, `average ${average}`).toBe(0)
      check(r)
    }
  })

  // A partial sale: 10 parts bought 100, worth 150; 5 sold at 150, the 750 € landing on the current account.
  describe('a sale of parts with an average price', () => {
    const profile = profileOf(
      [account('a', 'securities'), account('c', 'current')],
      [line('l', 'a', { kind: 'units' }), line('cash', 'c')],
    )

    it('a partial sale at an unchanged price is neither effort nor markets', () => {
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100), amountEntry('cash', 0)]),
        snapshotOf([unitsEntry('l', 5, 150, 100), amountEntry('cash', 750)]),
      )
      expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
    })

    it('a partial sale after the price moved keeps only the price change as markets', () => {
      // 10 parts at 150 become 5 at 160, the 5 sold at 160 (800 € on the current account).
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100), amountEntry('cash', 0)]),
        snapshotOf([unitsEntry('l', 5, 160, 100), amountEntry('cash', 800)]),
      )
      expect(r.markets).toBe(10_000) // 10 parts × 10 €
      expect(r.effort).toBe(0)
      check(r)
    })

    it('selling every part, the line kept at zero, is neither effort nor markets', () => {
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100), amountEntry('cash', 0)]),
        snapshotOf([unitsEntry('l', 0, 150, 100), amountEntry('cash', 1_500)]),
      )
      expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
    })

    it('a line closed and removed is unchanged: what it was worth leaves as effort', () => {
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100), amountEntry('cash', 0)]),
        snapshotOf([amountEntry('cash', 1_500)]),
      )
      expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
    })

    it('fewer parts and a new average price (a sale and a purchase) count as a sale at the day’s price', () => {
      // 10 parts, average 100, worth 150; 5 sold and 3 bought at 150: 8 parts, average 110, worth 150.
      // The rule pinned here: the 2 parts fewer leave at 150, the change of the average is not read.
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100)]),
        snapshotOf([unitsEntry('l', 8, 150, 110)]),
      )
      expect(r).toEqual({ effort: -30_000, markets: 0, property: 0, existingAdded: 0, total: -30_000, estimatedInterest: 0 })
    })

    it('a purchase still counts the parts bought at their cost', () => {
      // 10 parts, average 100, worth 150; 5 more bought at 160: average (1000 + 800) / 15 = 120, worth 160.
      const r = splitChange(
        profile,
        snapshotOf([unitsEntry('l', 10, 150, 100)]),
        snapshotOf([unitsEntry('l', 15, 160, 120)]),
      )
      expect(r.effort).toBe(80_000)
      expect(r.markets).toBe(10_000)
      check(r)
    })
  })

  describe('parts in dollars whose purchase the person described', () => {
    // 10 parts, average 100, worth 150 $; 5 more bought: the average becomes 120, worth 160 $; 1 $ = 0,90 €.
    // The average grew by 15 × 120 − 10 × 100 = 800 in the average's money.
    const before = snapshotOf([unitsEntry('l', 10, 150, 100)], { USD: 0.9 })
    const after = snapshotOf([unitsEntry('l', 15, 160, 120)], { USD: 0.9 })
    const total = 81_000 // 15 × 160 × 0,9 − 10 × 150 × 0,9

    it('an average price in euros is what was spent, with no rate', () => {
      const profile = profileOf(
        [account('a', 'securities')],
        [line('l', 'a', { kind: 'units', currency: 'USD', purchase: { inEuros: true } })],
      )
      const r = splitChange(profile, before, after)
      expect(r.effort).toBe(80_000)
      expect(r.markets).toBe(total - 80_000)
      check(r)
    })

    it('a typed rate (1 € = 1,25 $) turns the dollars spent into euros', () => {
      const profile = profileOf(
        [account('a', 'securities')],
        [line('l', 'a', { kind: 'units', currency: 'USD', purchase: { perEuro: 1.25 } })],
      )
      const r = splitChange(profile, before, after)
      expect(r.effort).toBe(64_000)
      expect(r.markets).toBe(total - 64_000)
      check(r)
    })
  })

  it('falls back to the price when the average price is missing', () => {
    const profile = profileOf([account('a', 'pea')], [line('l', 'a', { kind: 'units' })])
    const r = splitChange(
      profile,
      snapshotOf([unitsEntry('l', 10, 50, null)]),
      snapshotOf([unitsEntry('l', 12, 50, null)]),
    )
    expect(r.effort).toBe(10_000)
    check(r)
  })

  describe('an amount in dollars', () => {
    // 1 000 $ on both dates; the dollar goes from 0,90 € to 0,95 €: 50 € that the rate made.
    for (const type of ['securities', 'current'] as const) {
      it(`on a ${type} account, what the rate did is markets, not effort`, () => {
        const profile = profileOf([account('a', type)], [line('l', 'a', { currency: 'USD' })])
        const r = splitChange(
          profile,
          snapshotOf([amountEntry('l', 1_000)], { USD: 0.9 }),
          snapshotOf([amountEntry('l', 1_000)], { USD: 0.95 }),
        )
        expect(r).toEqual({ effort: 0, markets: 5_000, property: 0, existingAdded: 0, total: 5_000, estimatedInterest: 0 })
      })
    }

    it('what was put in stays effort, at the rate of the day', () => {
      // 1 000 $ become 1 200 $: the 200 $ added are 190 € of effort, the 50 € of the rate markets.
      const profile = profileOf([account('a', 'current')], [line('l', 'a', { currency: 'USD' })])
      const r = splitChange(
        profile,
        snapshotOf([amountEntry('l', 1_000)], { USD: 0.9 }),
        snapshotOf([amountEntry('l', 1_200)], { USD: 0.95 }),
      )
      expect(r.markets).toBe(5_000)
      expect(r.effort).toBe(19_000)
      check(r)
    })
  })

  it('counts an amount line in a cost-basis account as effort', () => {
    const profile = profileOf([account('a', 'securities')], [line('l', 'a')])
    const r = splitChange(profile, snapshotOf([amountEntry('l', 100)]), snapshotOf([amountEntry('l', 150)]))
    expect(r.effort).toBe(5_000)
    check(r)
  })

  it('buying a home with a loan changes nothing', () => {
    const profile = profileOf(
      [account('cash', 'livret-a'), account('h', 'home'), account('m', 'loan')],
      [line('cash-l', 'cash'), line('h-l', 'h'), line('m-l', 'm')],
    )
    const before = snapshotOf([amountEntry('cash-l', 100_000)])
    const after = withExtra(
      snapshotOf([amountEntry('cash-l', 40_000), amountEntry('h-l', 300_000), amountEntry('m-l', 240_000)]),
      { arrivals: { 'h-l': 'opened', 'm-l': 'opened' } },
    )
    const r = splitChange(profile, before, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
  })

  it('ignores the contributions of an entirely new contributions account', () => {
    const profile = profileOf([account('a', 'life-insurance')], [line('l', 'a')])
    const after = withExtra(snapshotOf([amountEntry('l', 1_000)]), {
      contributions: { a: 50_000 },
      arrivals: { l: 'existing' },
    })
    const r = splitChange(profile, snapshotOf([]), after)
    expect(r.existingAdded).toBe(100_000)
    expect(r.effort).toBe(0)
    check(r)
  })

  // A contributions account followed in both snapshots, with its fonds euros, and a fund
  // that appears in it this time.
  const lifeWithFund = profileOf([account('a', 'life-insurance')], [line('f', 'a'), line('u', 'a')])
  const lifeBefore = snapshotOf([amountEntry('f', 30_000)])

  it('a fund the person already had, added to a life insurance followed before, stays out of the split', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 30_300), amountEntry('u', 5_000)]), {
      arrivals: { u: 'existing' },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 0, markets: 30_000, property: 0, existingAdded: 500_000, total: 530_000, estimatedInterest: 0 })
    check(r)
  })

  it('a fund with no arrival, added to a life insurance followed before, counts as one the person already had', () => {
    const after = snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)])
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 500_000, total: 500_000, estimatedInterest: 0 })
    check(r)
  })

  it('a fund the person already had keeps what was paid in on the account as effort', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 31_100), amountEntry('u', 5_000)]), {
      arrivals: { u: 'existing' },
      contributions: { a: 100_000 },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 100_000, markets: 10_000, property: 0, existingAdded: 500_000, total: 610_000, estimatedInterest: 0 })
    check(r)
  })

  // An opened fund is money that entered the account: noted under « Combien a été versé
  // dessus ? » when it came from outside, or moved from another fund of the same account.
  it('a fund opened with money paid in is counted once, through what was paid in', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)]), {
      arrivals: { u: 'opened' },
      contributions: { a: 500_000 },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 500_000, markets: 0, property: 0, existingAdded: 0, total: 500_000, estimatedInterest: 0 })
    check(r)
  })

  it('a fund opened with money moved from the fonds euros is neither effort nor markets', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 25_000), amountEntry('u', 5_000)]), {
      arrivals: { u: 'opened' },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
    check(r)
  })

  it('a fund sold into the fonds euros of the same account is neither effort nor markets', () => {
    const before = snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)])
    const after = snapshotOf([amountEntry('f', 35_000)])
    const r = splitChange(lifeWithFund, before, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0, estimatedInterest: 0 })
    check(r)
  })

  it('gives the change of each account handled as a whole, before what was paid in', () => {
    const profile = profileOf(
      [account('a', 'life-insurance'), account('b', 'pea'), account('c', 'per')],
      [line('f', 'a'), line('u', 'a'), line('e', 'b'), line('p', 'c')],
    )
    const after = withExtra(
      snapshotOf([amountEntry('f', 30_300), amountEntry('u', 5_000), amountEntry('e', 2_000), amountEntry('p', 1_000)]),
      { arrivals: { u: 'existing', p: 'opened' }, contributions: { a: 10_000 } },
    )
    const changes = wholeAccountChanges(profile, snapshotOf([amountEntry('f', 30_000), amountEntry('e', 1_000)]), after)
    expect(changes).toEqual(new Map([['a', 30_000]]))
  })

  it('throws on a line unknown to the profile', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    expect(() => splitChange(profile, snapshotOf([amountEntry('zzz', 1)]), snapshotOf([]))).toThrow(UnknownLineError)
  })
})

// The total paid in since the opening, copied from the bank at each snapshot
// (docs/superpowers/specs/2026-11-14-total-verse-design.md).
describe('splitChange with the total paid in', () => {
  const lifeProfile = profileOf([account('a', 'life-insurance')], [line('f', 'a')])
  const lifeBefore = (extra: Partial<Snapshot> = {}) => withExtra(snapshotOf([amountEntry('f', 30_000)]), extra)
  const lifeAfter = (extra: Partial<Snapshot> = {}) => withExtra(snapshotOf([amountEntry('f', 31_000)]), extra)

  it('takes the effort of a contributions account from the two totals', () => {
    const r = splitChange(lifeProfile, lifeBefore({ paidTotals: { a: 1_840_000 } }), lifeAfter({ paidTotals: { a: 1_900_000 } }))
    expect(r.effort).toBe(60_000)
    expect(r.markets).toBe(40_000)
    check(r)
  })

  it('lets the totals win over a payment typed the old way', () => {
    const r = splitChange(
      lifeProfile,
      lifeBefore({ paidTotals: { a: 1_840_000 } }),
      lifeAfter({ paidTotals: { a: 1_900_000 }, contributions: { a: 50_000 } }),
    )
    expect(r.effort).toBe(60_000)
    expect(r.markets).toBe(40_000)
  })

  it('ignores a total on one side only: the old payment, else all markets', () => {
    const typed = splitChange(lifeProfile, lifeBefore(), lifeAfter({ contributions: { a: 50_000 } }))
    expect(splitChange(lifeProfile, lifeBefore(), lifeAfter({ contributions: { a: 50_000 }, paidTotals: { a: 1_900_000 } }))).toEqual(
      typed,
    )
    expect(splitChange(lifeProfile, lifeBefore({ paidTotals: { a: 1_840_000 } }), lifeAfter({ contributions: { a: 50_000 } }))).toEqual(
      typed,
    )
    const none = splitChange(lifeProfile, lifeBefore(), lifeAfter())
    expect(none.markets).toBe(100_000)
    expect(splitChange(lifeProfile, lifeBefore(), lifeAfter({ paidTotals: { a: 1_900_000 } }))).toEqual(none)
  })

  it('handles a cost-basis account with both totals as a whole, its units line not counted twice', () => {
    const profile = profileOf([account('a', 'securities')], [line('u', 'a', { kind: 'units' }), line('m', 'a')])
    const before = withExtra(snapshotOf([unitsEntry('u', 10, 100, 90), amountEntry('m', 5_000)]), {
      paidTotals: { a: 600_000 },
    })
    const after = withExtra(snapshotOf([unitsEntry('u', 12, 110, 95), amountEntry('m', 5_600)]), {
      paidTotals: { a: 650_000 },
    })
    const r = splitChange(profile, before, after)
    // 6 000 € → 6 920 €: 500 € paid in, 420 € of markets (line by line it would be 840 € of effort).
    expect(r.effort).toBe(50_000)
    expect(r.markets).toBe(42_000)
    check(r)
    expect(wholeAccountChanges(profile, before, after)).toEqual(new Map([['a', 92_000]]))
    expect(hasBothTotals(before, after, 'a')).toBe(true)
  })

  it('keeps the line by line split of a cost-basis account with a total on one side only', () => {
    const profile = profileOf([account('a', 'securities')], [line('u', 'a', { kind: 'units' }), line('m', 'a')])
    const before = snapshotOf([unitsEntry('u', 10, 100, 90), amountEntry('m', 5_000)])
    const after = snapshotOf([unitsEntry('u', 12, 110, 95), amountEntry('m', 5_600)])
    const today = splitChange(profile, before, after)
    expect(today.effort).toBe(84_000)
    expect(splitChange(profile, before, withExtra(after, { paidTotals: { a: 650_000 } }))).toEqual(today)
    expect(splitChange(profile, withExtra(before, { paidTotals: { a: 600_000 } }), after)).toEqual(today)
    expect(hasBothTotals(before, withExtra(after, { paidTotals: { a: 650_000 } }), 'a')).toBe(false)
    expect(wholeAccountChanges(profile, before, withExtra(after, { paidTotals: { a: 650_000 } }))).toEqual(new Map())
  })

  it('keeps the usual withdrawal for an account closed in the period, its total left after', () => {
    const profile = profileOf([account('c', 'livret-a'), account('a', 'securities')], [line('cash', 'c'), line('m', 'a')])
    const before = withExtra(snapshotOf([amountEntry('cash', 1_000), amountEntry('m', 5_000)]), { paidTotals: { a: 400_000 } })
    const after = withExtra(snapshotOf([amountEntry('cash', 1_000)]), { paidTotals: { a: 400_000 } })
    const r = splitChange(profile, before, after)
    expect(r.effort).toBe(-500_000)
    expect(r.markets).toBe(0)
    check(r)
    expect(wholeAccountChanges(profile, before, after)).toEqual(new Map())
  })

  it('falls back to the usual rules for an account with a total after and a line not marked opened', () => {
    const profile = profileOf([account('p', 'pea')], [line('x', 'p'), line('y', 'p')])
    const after = withExtra(snapshotOf([amountEntry('x', 3_000), amountEntry('y', 1_000)]), {
      arrivals: { x: 'opened', y: 'existing' },
    })
    const r = splitChange(profile, snapshotOf([]), withExtra(after, { paidTotals: { p: 100_000 } }))
    expect(r).toEqual(splitChange(profile, snapshotOf([]), after))
    expect(r.effort).toBe(300_000)
    expect(r.existingAdded).toBe(100_000)
  })

  it('takes the total of an account opened in the period as effort, the rest of its value as markets', () => {
    const profile = profileOf(
      [account('c', 'livret-a'), account('p', 'pea')],
      [line('cash', 'c'), line('x', 'p'), line('y', 'p', { kind: 'units' })],
    )
    const before = snapshotOf([amountEntry('cash', 1_000)])
    const after = withExtra(snapshotOf([amountEntry('cash', 1_000), amountEntry('x', 3_000), unitsEntry('y', 10, 110, 100)]), {
      arrivals: { x: 'opened', y: 'opened' },
      paidTotals: { p: 380_000 },
    })
    const r = splitChange(profile, before, after)
    expect(r.effort).toBe(380_000)
    expect(r.markets).toBe(30_000)
    check(r)
  })
})

// docs/superpowers/specs/2026-11-14-interets-livrets-design.md
describe('splitChange, the estimated interest of a livret', () => {
  const dated = (s: Snapshot, takenOn: string): Snapshot => ({ ...s, takenOn })
  // 10 000 € on a Livret A over 31 December 2025: 2025 at its average rate, 215,75 €.
  const y2025 = 21_575

  it('moves the interest of a Livret A from effort to markets, the total unchanged', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const before = dated(snapshotOf([amountEntry('l', 10_000)]), '2025-11-30')
    const after = dated(snapshotOf([amountEntry('l', 10_215.75)]), '2026-01-15')
    const r = splitChange(profile, before, after)
    expect(r).toEqual({ effort: 0, markets: y2025, property: 0, existingAdded: 0, total: y2025, estimatedInterest: y2025 })
    check(r)
  })

  it('estimates the LDDS at the Livret A rate and the LEP at its own', () => {
    const profile = profileOf([account('d', 'ldds'), account('p', 'lep')], [line('d1', 'd'), line('p1', 'p')])
    const before = dated(snapshotOf([amountEntry('d1', 10_000), amountEntry('p1', 10_000)]), '2025-11-30')
    const after = dated(snapshotOf([amountEntry('d1', 10_000), amountEntry('p1', 10_000)]), '2026-01-15')
    // LEP 2025: 4 % in January (31 days), 3,5 % from 1 February (181), 2,7 % from 1 August (153).
    const lep = Math.round((1_000_000 * (31 * 0.04 + 181 * 0.035 + 153 * 0.027)) / 365)
    const r = splitChange(profile, before, after)
    expect(r.estimatedInterest).toBe(y2025 + lep)
    expect(r.markets).toBe(y2025 + lep)
    expect(r.effort).toBe(-(y2025 + lep))
    check(r)
  })

  it('takes a withdrawal net of the interest: effort is the change less the interest', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const before = dated(snapshotOf([amountEntry('l', 10_000)]), '2025-11-30')
    const after = dated(snapshotOf([amountEntry('l', 7_000)]), '2026-01-15')
    const r = splitChange(profile, before, after)
    expect(r.total).toBe(-300_000)
    expect(r.markets).toBe(y2025)
    expect(r.effort).toBe(-300_000 - y2025)
    check(r)
  })

  it('estimates only on the lines present on both sides: a line closed or opened in the period adds nothing', () => {
    const profile = profileOf(
      [account('a', 'livret-a'), account('b', 'livret-a'), account('c', 'livret-a')],
      [line('kept', 'a'), line('closed', 'a'), line('opened', 'b'), line('gone', 'c')],
    )
    const before = dated(
      snapshotOf([amountEntry('kept', 10_000), amountEntry('closed', 5_000), amountEntry('gone', 8_000)]),
      '2025-11-30',
    )
    const after = withExtra(dated(snapshotOf([amountEntry('kept', 10_000), amountEntry('opened', 3_000)]), '2026-01-15'), {
      arrivals: { opened: 'opened' },
    })
    const r = splitChange(profile, before, after)
    expect(r.estimatedInterest).toBe(y2025) // only the 10 000 € of « kept »
    expect(r.markets).toBe(y2025)
    expect(r.effort).toBe(-500_000 + 300_000 - 800_000 - y2025)
    check(r)
  })

  it('estimates each 31 December of a long period on the balance held at its start', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const before = dated(snapshotOf([amountEntry('l', 10_000)]), '2024-11-30')
    const after = dated(snapshotOf([amountEntry('l', 12_000)]), '2026-01-15')
    expect(splitChange(profile, before, after).estimatedInterest).toBe(30_000 + y2025)
  })

  it('leaves a relevé taken on 31 December without that year’s interest', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a')])
    const june = dated(snapshotOf([amountEntry('l', 10_000)]), '2025-06-30')
    const december31 = dated(snapshotOf([amountEntry('l', 10_000)]), '2025-12-31')
    const march = dated(snapshotOf([amountEntry('l', 10_000)]), '2026-03-01')
    expect(splitChange(profile, june, december31).estimatedInterest).toBe(0)
    expect(splitChange(profile, december31, march).estimatedInterest).toBe(y2025)
  })

  it('changes nothing for a livret jeune, a PEL or CEL, another livret or a current account', () => {
    const types = ['livret-jeune', 'pel-cel', 'other-savings', 'current'] as const
    const profile = profileOf(
      types.map((t) => account(t, t)),
      types.map((t) => line(`${t}-l`, t)),
    )
    const before = dated(snapshotOf(types.map((t) => amountEntry(`${t}-l`, 10_000))), '2025-11-30')
    const after = dated(snapshotOf(types.map((t) => amountEntry(`${t}-l`, 10_300))), '2026-01-15')
    expect(splitChange(profile, before, after)).toEqual({
      effort: 120_000,
      markets: 0,
      property: 0,
      existingAdded: 0,
      total: 120_000,
      estimatedInterest: 0,
    })
  })

  it('does not estimate a line in another currency on a livret', () => {
    const profile = profileOf([account('a', 'livret-a')], [line('l', 'a', { currency: 'USD' })])
    const before = dated(snapshotOf([amountEntry('l', 10_000)], { USD: 1.1 }), '2025-11-30')
    const after = dated(snapshotOf([amountEntry('l', 10_000)], { USD: 1.1 }), '2026-01-15')
    expect(splitChange(profile, before, after).estimatedInterest).toBe(0)
  })
})
