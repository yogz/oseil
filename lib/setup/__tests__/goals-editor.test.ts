import { describe, expect, it, test } from 'vitest'
import { CUSHION_PRESETS, GOAL_PRESETS } from '@/lib/catalog'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid, type Grid } from '@/lib/model/squares'
import { parseGoalAllocation } from '@/lib/model/documents'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import {
  applyPreset,
  chezToiHomes,
  editorCategories,
  monthsFromShare,
  nothingToSplit,
  othersOf,
  outsideHome,
  remaining,
  shownGoalCategories,
  startGoals,
  step,
  stepMonths,
  toAllocation,
} from '../goals-editor'

describe('nothingToSplit: all the money in Chez toi', () => {
  test('one home: « dans ton logement », a no-break space before the colon', () => {
    expect(nothingToSplit(1)).toBe('Tout ton argent est dans ton logement : il n’y a rien à répartir pour l’instant.')
  })
  test('more than one: « dans tes logements »', () => {
    expect(nothingToSplit(2)).toBe('Tout ton argent est dans tes logements : il n’y a rien à répartir pour l’instant.')
  })
  test('no home at all (a property line on another account): the singular', () => {
    expect(nothingToSplit(0)).toBe(nothingToSplit(1))
  })
})

describe('chezToiHomes', () => {
  const homes = profileOf(
    [account('h', 'home'), account('s', 'home', { residence: 'secondary' }), account('o', 'other'), account('r', 'home', { residence: 'rental' })],
    [line('home', 'h'), line('cabin', 's'), line('scpi', 'o', { category: 'property' }), line('rent', 'r')],
  )
  test('counts the homes of Chez toi, neither a rental nor a property line on another account', () => {
    const situation = computeSituation(
      homes,
      snapshotOf([amountEntry('home', 100_000), amountEntry('cabin', 50_000), amountEntry('scpi', 10_000), amountEntry('rent', 10_000)]),
    )
    expect(chezToiHomes(homes, situation)).toBe(2)
  })
  test('one home: one', () => {
    const one = profileOf([account('h', 'home')], [line('home', 'h')])
    expect(chezToiHomes(one, computeSituation(one, snapshotOf([amountEntry('home', 100_000)])))).toBe(1)
  })
})

function gridOf(grid: Grid) {
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  return grid
}
// Outside the home: 20 000 € available, 30 000 € secured, 30 000 € in markets, 2 000 € of gold.
const example = gridOf(buildGrid(computeSituation(exampleProfile, exampleSnapshot)))

describe('shownGoalCategories', () => {
  it('leaves the rental out while its share is 0, so nothing changes for a person without one', () => {
    expect(shownGoalCategories({ available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })).toEqual(['available', 'secured', 'markets', 'gold'])
    expect(shownGoalCategories({ available: 25, secured: 25, markets: 40, gold: 0, rental: 10 })).toEqual([
      'available',
      'secured',
      'markets',
      'gold',
      'rental',
    ])
  })
})

describe('editorCategories', () => {
  const four = ['available', 'secured', 'markets', 'gold']
  test('without a rental and no rental share saved: today’s four rows', () => {
    expect(editorCategories(false, null)).toEqual(four)
    expect(editorCategories(false, { available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })).toEqual(four)
  })
  test('with a rental: the fifth row « Immobilier locatif », last', () => {
    expect(editorCategories(true, null)).toEqual([...four, 'rental'])
    expect(editorCategories(true, { available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })).toEqual([...four, 'rental'])
  })
  test('a goal with a rental share and no rental any more keeps the row, so the sum still shows 100', () => {
    expect(editorCategories(false, { available: 25, secured: 25, markets: 40, gold: 0, rental: 10 })).toEqual([...four, 'rental'])
  })
})

describe('goals editor', () => {
  it('counts the money outside the home: 82 000 €', () => {
    expect(outsideHome(example)).toBe(8_200_000)
  })

  it('starts from today’s split of that money, in whole percents totalling 100', () => {
    const start = startGoals(example)!
    expect(start).toEqual({ available: 24, secured: 37, markets: 37, gold: 2, rental: 0 })
    expect(remaining(start)).toBe(0)
  })

  it('has nothing to split when everything is in the home', () => {
    const grid = gridOf(
      buildGrid(
        computeSituation(
          profileOf([account('h', 'home')], [line('l', 'h', { category: 'property' })]),
          snapshotOf([amountEntry('l', 100_000)]),
        ),
      ),
    )
    expect(outsideHome(grid)).toBe(0)
    expect(startGoals(grid)).toBeNull()
  })

  it('the examples take their exact shares: « Équilibré » is 25/25/45/5', () => {
    const start = startGoals(example)!
    expect(applyPreset('balanced', start)).toEqual({ available: 25, secured: 25, markets: 45, gold: 5, rental: 0 })
    expect(applyPreset('prudent', start)).toEqual({ available: 40, secured: 45, markets: 15, gold: 0, rental: 0 })
    expect(applyPreset('dynamic', start)).toEqual(GOAL_PRESETS.dynamic.shares)
    expect(remaining(applyPreset('balanced', start))).toBe(0)
  })

  it('each pocket moves one way from Prudent to Dynamique', () => {
    const order = ['prudent', 'balanced', 'dynamic'] as const
    for (let i = 1; i < order.length; i++) {
      const a = GOAL_PRESETS[order[i - 1]].shares
      const b = GOAL_PRESETS[order[i]].shares
      expect(b.available).toBeLessThanOrEqual(a.available)
      expect(b.secured).toBeLessThanOrEqual(a.secured)
      expect(b.markets).toBeGreaterThanOrEqual(a.markets)
      expect(b.gold).toBeGreaterThanOrEqual(a.gold)
    }
    for (const k of order) expect(remaining(GOAL_PRESETS[k].shares)).toBe(0)
  })

  it('« current » brings back today’s split', () => {
    const start = startGoals(example)!
    expect(applyPreset('current', start)).toEqual(start)
  })

  it('steps by one percent: two minus leave 2 % to place', () => {
    let draft = applyPreset('balanced', startGoals(example)!)
    draft = step(step(draft, 'markets', -1), 'secured', -1)
    expect(draft).toEqual({ available: 25, secured: 24, markets: 44, gold: 5, rental: 0 })
    expect(remaining(draft)).toBe(2)
  })

  it('never goes below 0 nor beyond 100 in total', () => {
    const draft = applyPreset('balanced', startGoals(example)!)
    expect(step(draft, 'markets', 1)).toBe(draft)
    const zero = { available: 0, secured: 0, markets: 0, gold: 0, rental: 0 }
    expect(step(zero, 'gold', -1)).toBe(zero)
    expect(step(zero, 'gold', 1).gold).toBe(1)
  })

  it('saves the percents as they are, which the document accepts', () => {
    const draft = applyPreset('balanced', startGoals(example)!)
    const allocation = toAllocation(draft, '2026-11-06')
    expect(allocation).toEqual({ schema: 1, validFrom: '2026-11-06', shares: { available: 25, secured: 25, markets: 45, gold: 5, rental: 0 } })
    expect(parseGoalAllocation(allocation)).toEqual(allocation)
  })

  it('refuses to save while percents are unplaced', () => {
    const draft = step(applyPreset('balanced', startGoals(example)!), 'markets', -1)
    expect(() => toAllocation(draft, '2026-11-06')).toThrow()
  })
})

// The available money aimed at in months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
describe('the cushion in months', () => {
  const budget = { basis: 'expenses' as const, monthly: 2_500_00 }

  test('a share of the money outside the home reads as the nearest months allowed', () => {
    expect(monthsFromShare(25, 40_000_00, budget)).toBe(4)
    expect(monthsFromShare(24, 82_000_00, budget)).toBe(8)
    expect(monthsFromShare(1, 82_000_00, budget)).toBe(1)
    expect(monthsFromShare(4, 82_000_00, budget)).toBe(1.5)
    expect(monthsFromShare(100, 1_000_000_00, budget)).toBe(24)
  })

  test('the four other shares, their part of what is left, make 100', () => {
    expect(othersOf({ available: 24, secured: 37, markets: 37, gold: 2, rental: 0 })).toEqual({
      available: 0,
      secured: 49,
      markets: 49,
      gold: 2,
      rental: 0,
    })
    expect(othersOf({ available: 100, secured: 0, markets: 0, gold: 0, rental: 0 })).toEqual({
      available: 0,
      secured: 100,
      markets: 0,
      gold: 0,
      rental: 0,
    })
  })

  test('the three examples: months, then the shares of what is left', () => {
    expect(CUSHION_PRESETS.prudent).toEqual({ months: 6, shares: { available: 0, secured: 75, markets: 25, gold: 0, rental: 0 } })
    expect(CUSHION_PRESETS.balanced).toEqual({ months: 4, shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 } })
    expect(CUSHION_PRESETS.dynamic).toEqual({ months: 3, shares: { available: 0, secured: 17, markets: 72, gold: 11, rental: 0 } })
  })

  test('one step of months: by halves under 3, never below 1 nor above 24', () => {
    expect(stepMonths(4, 1)).toBe(5)
    expect(stepMonths(3, -1)).toBe(2.5)
    expect(stepMonths(1, -1)).toBe(1)
    expect(stepMonths(24, 1)).toBe(24)
  })

  test('saving with months writes them, the available share at 0', () => {
    expect(toAllocation({ available: 0, secured: 33, markets: 60, gold: 7, rental: 0 }, '2026-11-11', 4)).toEqual({
      schema: 1,
      validFrom: '2026-11-11',
      shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 },
      cushionMonths: 4,
    })
  })
})
