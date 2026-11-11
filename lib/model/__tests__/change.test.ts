import { describe, expect, it } from 'vitest'
import { splitChange, wholeAccountChanges } from '@/lib/model/change'
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
    expect(r).toEqual({ effort: 30_000, markets: 0, property: 0, existingAdded: 0, total: 30_000 })
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
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0 })
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
    expect(r).toEqual({ effort: 0, markets: 30_000, property: 0, existingAdded: 500_000, total: 530_000 })
    check(r)
  })

  it('a fund with no arrival, added to a life insurance followed before, counts as one the person already had', () => {
    const after = snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)])
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 500_000, total: 500_000 })
    check(r)
  })

  it('a fund the person already had keeps what was paid in on the account as effort', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 31_100), amountEntry('u', 5_000)]), {
      arrivals: { u: 'existing' },
      contributions: { a: 100_000 },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 100_000, markets: 10_000, property: 0, existingAdded: 500_000, total: 610_000 })
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
    expect(r).toEqual({ effort: 500_000, markets: 0, property: 0, existingAdded: 0, total: 500_000 })
    check(r)
  })

  it('a fund opened with money moved from the fonds euros is neither effort nor markets', () => {
    const after = withExtra(snapshotOf([amountEntry('f', 25_000), amountEntry('u', 5_000)]), {
      arrivals: { u: 'opened' },
    })
    const r = splitChange(lifeWithFund, lifeBefore, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0 })
    check(r)
  })

  it('a fund sold into the fonds euros of the same account is neither effort nor markets', () => {
    const before = snapshotOf([amountEntry('f', 30_000), amountEntry('u', 5_000)])
    const after = snapshotOf([amountEntry('f', 35_000)])
    const r = splitChange(lifeWithFund, before, after)
    expect(r).toEqual({ effort: 0, markets: 0, property: 0, existingAdded: 0, total: 0 })
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
