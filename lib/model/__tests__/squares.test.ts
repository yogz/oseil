import { describe, expect, it } from 'vitest'
import { buildGrid, largestRemainder, shareLabel } from '@/lib/model/squares'
import { computeSituation } from '@/lib/model/situation'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
} from '@/lib/model/__tests__/fixtures'

describe('largestRemainder', () => {
  it('shares a total by weight', () => {
    expect(largestRemainder([1, 1, 1], 100)).toEqual([34, 33, 33])
    expect(largestRemainder([50, 30, 20], 100)).toEqual([50, 30, 20])
    expect(largestRemainder([10, 0], 100)).toEqual([100, 0])
    expect(largestRemainder([0, 0], 100)).toEqual([0, 0])
  })

  it('gives at least one to protected entries', () => {
    expect(largestRemainder([0.4, 99.6], 100, { atLeastOne: [true, true] })).toEqual([1, 99])
    expect(largestRemainder([0.2, 0.2, 99.6], 100, { atLeastOne: [true, true, true] })).toEqual([1, 1, 98])
  })
})

// Nicolas, 10 November 2026: 1 € of crypto among 626 000 € was drawn as one square of 6 260 €.
describe('less than half a square', () => {
  const profile = profileOf(
    [account('cc', 'current'), account('wallet', 'crypto')],
    [line('cash', 'cc'), line('btc', 'wallet')],
  )
  const gridWith = (crypto: number) => {
    const grid = buildGrid(computeSituation(profile, snapshotOf([amountEntry('cash', 626_460), amountEntry('btc', crypto)])))
    if (grid.kind !== 'grid') throw new Error('expected a grid')
    return grid
  }
  const squaresOf = (grid: ReturnType<typeof gridWith>) => grid.categories.map((c) => [c.category, c.squares])

  it('has no square: its square is not taken from the others', () => {
    expect(squaresOf(gridWith(1))).toEqual([['available', 100], ['gold', 0]])
    expect(shareLabel(0)).toMatch(/^moins de 1\s%$/u)
  })

  it('from half a square, keeps at least one, so that what is there is seen', () => {
    expect(squaresOf(gridWith(3_200))).toEqual([['available', 99], ['gold', 1]])
  })
})

describe('the example grid', () => {
  const grid = buildGrid(computeSituation(exampleProfile, exampleSnapshot))
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  const cat = (id: string) => grid.categories.find((c) => c.category === id)!

  it('shares 100 squares between categories', () => {
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual([
      ['available', 10],
      ['secured', 15],
      ['markets', 15],
      ['gold', 1],
      ['property', 59],
    ])
    expect(grid.squareValue).toBe(202_000)
    expect(grid.excluded).toEqual([])
  })

  it('shares a category between its lines', () => {
    expect(cat('markets').lines.map((l) => [l.lineId, l.squares])).toEqual([
      ['etf', 13],
      ['life-uc', 2],
    ])
    expect(cat('available').lines.map((l) => [l.lineId, l.squares])).toEqual([
      ['current-line', 4],
      ['livret-a-line', 6],
    ])
  })
})

describe('too small for a square', () => {
  it('lists the lines that get no square', () => {
    // Gold weighs 190 000 against 10 050 of cash: available gets 5 squares of 100.
    const p = profileOf(
      [account('a', 'current'), account('g', 'gold')],
      [line('big', 'a'), line('tiny', 'a'), line('gold', 'g')],
    )
    const grid = buildGrid(
      computeSituation(
        p,
        snapshotOf([amountEntry('big', 10_000), amountEntry('tiny', 50), amountEntry('gold', 190_000)]),
      ),
    )
    if (grid.kind !== 'grid') throw new Error('expected a grid')
    const available = grid.categories.find((c) => c.category === 'available')!
    expect(available.squares).toBe(5)
    expect(available.lines.map((l) => l.squares)).toEqual([5, 0])
    expect(available.tooSmall).toEqual(['tiny'])
  })
})

describe('a negative category leaves the grid', () => {
  it('excludes it and shares 100 squares among the rest', () => {
    const p = profileOf(
      [
        account('c', 'current'),
        account('h', 'home'),
        account('l', 'loan', { financedLineId: 'house' }),
        account('m', 'pea'),
      ],
      [line('cash', 'c'), line('house', 'h'), line('loan', 'l'), line('etf', 'm')],
    )
    const grid = buildGrid(
      computeSituation(
        p,
        snapshotOf([
          amountEntry('cash', 50_000),
          amountEntry('house', 150_000),
          amountEntry('loan', 180_000),
          amountEntry('etf', 30_000),
        ]),
      ),
    )
    if (grid.kind !== 'grid') throw new Error('expected a grid')
    expect(grid.excluded).toEqual(['property'])
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual([
      ['available', 63],
      ['markets', 37],
    ])
    expect(grid.total).toBe(8_000_000)
  })
})

describe('no grid when nothing is really yours', () => {
  it('says net-not-positive', () => {
    const p = profileOf(
      [account('c', 'current'), account('h', 'home'), account('l', 'loan', { financedLineId: 'house' })],
      [line('cash', 'c'), line('house', 'h'), line('loan', 'l')],
    )
    const s = computeSituation(
      p,
      snapshotOf([amountEntry('cash', 5_000), amountEntry('house', 150_000), amountEntry('loan', 180_000)]),
    )
    expect(buildGrid(s)).toEqual({ kind: 'none', reason: 'net-not-positive' })
  })

  it('says nothing-owned for an empty statement', () => {
    expect(buildGrid(computeSituation(exampleProfile, snapshotOf([])))).toEqual({
      kind: 'none',
      reason: 'nothing-owned',
    })
  })
})

describe('shareLabel', () => {
  it('writes a percentage with a narrow no-break space', () => {
    expect(shareLabel(3)).toBe('3 %')
    expect(shareLabel(0)).toBe('moins de 1 %')
  })
})
