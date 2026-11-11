import { describe, expect, it } from 'vitest'
import { buildGrid, cellsOf, homeRange, pocketSquares, type Grid } from '@/lib/model/squares'
import { computeSituation, pocketOf } from '@/lib/model/situation'
import type { Profile, Snapshot } from '@/lib/model/types'
import { examplePerson } from '@/lib/example/person'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
} from '@/lib/model/__tests__/fixtures'

// The grid as it read before the two pockets, in one string: every category with its squares and
// value, its lines with theirs, the excluded categories, the cells in reading order.
const shapeOf = (grid: Grid): string => {
  if (grid.kind === 'none') return `none:${grid.reason}`
  const categories = grid.categories
    .map(
      (c) =>
        `${c.category}=${c.squares}/${c.value}[${c.lines.map((l) => `${l.lineId}=${l.squares}/${l.value}`).join(',')}]` +
        `{${c.tooSmall.join(',')}}`,
    )
    .join(' ')
  const runs: string[] = []
  let previous = ''
  let count = 0
  for (const cell of [...cellsOf(grid), '']) {
    if (cell === previous) {
      count += 1
      continue
    }
    if (count > 0) runs.push(`${previous}*${count}`)
    previous = cell
    count = 1
  }
  return `${grid.total}|${grid.squareValue}|${categories}|excluded:${grid.excluded.join(',')}|${runs.join(',')}`
}

const shape = (profile: Profile, snapshot: Snapshot) => shapeOf(buildGrid(computeSituation(profile, snapshot)))

// Profiles with no rental home: their grid must stay exactly what it was before the pockets.
const homeUnderWater = profileOf(
  [account('c', 'current'), account('h', 'home'), account('l', 'loan', { financedLineId: 'house' }), account('m', 'pea')],
  [line('cash', 'c'), line('house', 'h'), line('loan', 'l'), line('etf', 'm')],
)
const otherAccountProperty = profileOf(
  [account('c', 'current'), account('o', 'other'), account('h', 'home', { residence: 'secondary' })],
  [line('cash', 'c'), line('scpi', 'o', { category: 'property' }), line('flat', 'h')],
)
const twoHomes = profileOf(
  [
    account('c', 'current'),
    account('h1', 'home'),
    account('h2', 'home', { residence: 'secondary' }),
    account('l', 'loan', { financedLineId: 'h2-line' }),
  ],
  [line('cash', 'c'), line('h1-line', 'h1'), line('h2-line', 'h2'), line('loan', 'l')],
)

describe('a profile without a rental home keeps exactly its grid', () => {
  it('on the example', () => {
    expect(shape(exampleProfile, exampleSnapshot)).toBe(EXAMPLE)
  })

  it('on every statement of the invented person', () => {
    const person = examplePerson()
    const profile = person.profile!.value
    expect(person.snapshots.map((s) => shape(profile, s.value))).toEqual(PERSON)
  })

  it('with a home under water, a property line on another account, two homes', () => {
    expect(
      shape(
        homeUnderWater,
        snapshotOf([amountEntry('cash', 50_000), amountEntry('house', 150_000), amountEntry('loan', 180_000), amountEntry('etf', 30_000)]),
      ),
    ).toBe(UNDER_WATER)
    expect(
      shape(otherAccountProperty, snapshotOf([amountEntry('cash', 10_000), amountEntry('scpi', 20_000), amountEntry('flat', 70_000)])),
    ).toBe(OTHER_ACCOUNT)
    expect(
      shape(
        twoHomes,
        snapshotOf([amountEntry('cash', 10_000), amountEntry('h1-line', 200_000), amountEntry('h2-line', 80_000), amountEntry('loan', 100_000)]),
      ),
    ).toBe(TWO_HOMES)
  })
})

// A home, a rental, cash; each home with its own loan.
const withRental = profileOf(
  [
    account('c', 'current'),
    account('h', 'home'),
    account('hl', 'loan', { financedLineId: 'home' }),
    account('r', 'home', { residence: 'rental' }),
    account('rl', 'loan', { financedLineId: 'rent' }),
  ],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('rent', 'r'), line('rent-loan', 'rl')],
)
const statement = (cash: number, home: number, homeLoan: number, rent: number, rentLoan: number) =>
  snapshotOf([
    amountEntry('cash', cash),
    amountEntry('home', home),
    amountEntry('home-loan', homeLoan),
    amountEntry('rent', rent),
    amountEntry('rent-loan', rentLoan),
  ])
const gridOf = (profile: Profile, snapshot: Snapshot) => {
  const grid = buildGrid(computeSituation(profile, snapshot))
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  return grid
}
const propertyOf = (grid: Extract<Grid, { kind: 'grid' }>) => grid.categories.find((c) => c.category === 'property')
const total = (grid: Extract<Grid, { kind: 'grid' }>) => grid.categories.reduce((s, c) => s + c.squares, 0)

describe('the two pockets of the situation', () => {
  it('nets each pocket of its own loans', () => {
    const s = computeSituation(withRental, statement(20_000, 300_000, 180_000, 200_000, 150_000))
    const property = s.categories.find((c) => c.category === 'property')!
    expect(property.value).toBe(17_000_000)
    expect(property.pockets?.['chez-toi'].value).toBe(12_000_000)
    expect(property.pockets?.['chez-toi'].lines.map((l) => [l.lineId, l.value])).toEqual([['home', 12_000_000]])
    expect(property.pockets?.location.value).toBe(5_000_000)
    expect(property.pockets?.location.lines.map((l) => [l.lineId, l.value])).toEqual([['rent', 5_000_000]])
  })

  it('carries pockets on the property entry only, the rental one empty without a rental', () => {
    const s = computeSituation(exampleProfile, exampleSnapshot)
    expect(s.categories.filter((c) => c.pockets).map((c) => c.category)).toEqual(['property'])
    const property = s.categories.find((c) => c.category === 'property')!
    expect(property.pockets?.location).toEqual({ value: 0, lines: [] })
    expect(property.pockets?.['chez-toi'].value).toBe(property.value)
  })

  it('puts a property line on another account in Chez toi', () => {
    const p = profileOf(
      [account('o', 'other'), account('r', 'home', { residence: 'rental' })],
      [line('scpi', 'o', { category: 'property' }), line('rent', 'r')],
    )
    const s = computeSituation(p, snapshotOf([amountEntry('scpi', 20_000), amountEntry('rent', 100_000)]))
    const property = s.categories.find((c) => c.category === 'property')!
    expect(property.pockets?.['chez-toi'].lines.map((l) => l.lineId)).toEqual(['scpi'])
    expect(property.pockets?.location.lines.map((l) => l.lineId)).toEqual(['rent'])
  })

  it('tells which pocket a property line belongs to', () => {
    expect(pocketOf(account('h', 'home'))).toBe('chez-toi')
    expect(pocketOf(account('h', 'home', { residence: 'main' }))).toBe('chez-toi')
    expect(pocketOf(account('h', 'home', { residence: 'secondary' }))).toBe('chez-toi')
    expect(pocketOf(account('h', 'home', { residence: 'rental' }))).toBe('location')
    expect(pocketOf(account('o', 'other'))).toBe('chez-toi')
  })
})

describe('the two pockets of the grid', () => {
  it('a rental worth less than its loan has no square and never takes from Chez toi', () => {
    const grid = gridOf(withRental, statement(20_000, 300_000, 180_000, 100_000, 150_000))
    // The same person without the rental: Chez toi keeps exactly these squares.
    const without = gridOf(
      profileOf(
        withRental.accounts.filter((a) => a.id !== 'r' && a.id !== 'rl'),
        withRental.lines.filter((l) => l.accountId !== 'r' && l.accountId !== 'rl'),
      ),
      snapshotOf([amountEntry('cash', 20_000), amountEntry('home', 300_000), amountEntry('home-loan', 180_000)]),
    )
    const property = propertyOf(grid)!
    expect(property.squares).toBe(propertyOf(without)!.squares)
    expect(property.value).toBe(12_000_000)
    expect(property.pockets).toEqual({
      location: { value: -5_000_000, squares: 0 },
      'chez-toi': { value: 12_000_000, squares: propertyOf(without)!.squares },
    })
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual(
      without.categories.map((c) => [c.category, c.squares]),
    )
    expect(grid.total).toBe(without.total)
    expect(grid.excluded).toEqual([])
    expect(grid.excludedPockets).toEqual(['location'])
    expect(property.lines.map((l) => [l.lineId, l.squares])).toEqual([
      ['rent', 0],
      ['home', property.squares],
    ])
    // Under water is not too small: the pocket's own sentence says it.
    expect(property.tooSmall).toEqual([])
    expect(total(grid)).toBe(100)
  })

  it('the same rule the other way: a home under water never takes from the rental', () => {
    const grid = gridOf(withRental, statement(20_000, 150_000, 180_000, 200_000, 120_000))
    const property = propertyOf(grid)!
    expect(property.value).toBe(8_000_000)
    expect(property.pockets?.['chez-toi']).toEqual({ value: -3_000_000, squares: 0 })
    expect(property.pockets?.location.squares).toBe(property.squares)
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual([
      ['available', 20],
      ['property', 80],
    ])
    expect(grid.excluded).toEqual([])
    expect(grid.excludedPockets).toEqual(['chez-toi'])
    expect(total(grid)).toBe(100)
  })

  it('two rentals compensate inside their pocket', () => {
    const p = profileOf(
      [
        account('c', 'current'),
        account('a', 'home', { residence: 'rental' }),
        account('al', 'loan', { financedLineId: 'a-line' }),
        account('b', 'home', { residence: 'rental' }),
        account('bl', 'loan', { financedLineId: 'b-line' }),
      ],
      [line('cash', 'c'), line('a-line', 'a'), line('a-loan', 'al'), line('b-line', 'b'), line('b-loan', 'bl')],
    )
    const s = snapshotOf([
      amountEntry('cash', 70_000),
      amountEntry('a-line', 200_000),
      amountEntry('a-loan', 150_000),
      amountEntry('b-line', 100_000),
      amountEntry('b-loan', 120_000),
    ])
    const grid = gridOf(p, s)
    const property = propertyOf(grid)!
    expect(property.pockets?.location).toEqual({ value: 3_000_000, squares: 30 })
    expect(grid.excludedPockets).toEqual([])
    expect(property.lines.map((l) => [l.lineId, l.squares])).toEqual([
      ['a-line', 30],
      ['b-line', 0],
    ])
    // As for two homes today: the rental under its loan, inside a pocket that has squares, is listed
    // among the lines too small for a square.
    expect(property.tooSmall).toEqual(['b-line'])
    expect(total(grid)).toBe(100)
  })

  it('a rental exactly paid by its loan: no square, no sentence, Chez toi as without it', () => {
    const grid = gridOf(withRental, statement(20_000, 300_000, 180_000, 150_000, 150_000))
    const without = gridOf(
      profileOf(
        withRental.accounts.filter((a) => a.id !== 'r' && a.id !== 'rl'),
        withRental.lines.filter((l) => l.accountId !== 'r' && l.accountId !== 'rl'),
      ),
      snapshotOf([amountEntry('cash', 20_000), amountEntry('home', 300_000), amountEntry('home-loan', 180_000)]),
    )
    const property = propertyOf(grid)!
    expect(property.pockets).toEqual({
      location: { value: 0, squares: 0 },
      'chez-toi': { value: 12_000_000, squares: propertyOf(without)!.squares },
    })
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual(without.categories.map((c) => [c.category, c.squares]))
    expect(grid.excludedPockets).toEqual([])
    expect(grid.excluded).toEqual([])
    expect(property.tooSmall).toEqual([])
    expect(total(grid)).toBe(100)
  })

  it('fills the rental lines before the home lines, whatever the order of the statement', () => {
    const grid = gridOf(withRental, statement(100_000, 300_000, 0, 100_000, 0))
    const property = propertyOf(grid)!
    expect(property.lines.map((l) => [l.lineId, l.squares])).toEqual([
      ['rent', 20],
      ['home', 60],
    ])
    expect(property.pockets).toEqual({
      location: { value: 10_000_000, squares: 20 },
      'chez-toi': { value: 30_000_000, squares: 60 },
    })
    expect(pocketSquares(grid, 'location')).toBe(20)
    expect(pocketSquares(grid, 'chez-toi')).toBe(60)
    expect(cellsOf(grid)).toEqual([...Array(20).fill('available'), ...Array(80).fill('property')])
    expect(total(grid)).toBe(100)
  })

  // Nicolas, 10 November 2026: less than half a square has no square (a false figure that looks good).
  it('gives a small positive pocket at least one square from half a square, none below', () => {
    const tiny = gridOf(withRental, statement(0, 1_000_000, 0, 1_000, 0))
    expect(propertyOf(tiny)!.pockets).toEqual({
      location: { value: 100_000, squares: 0 },
      'chez-toi': { value: 100_000_000, squares: 100 },
    })
    expect(total(tiny)).toBe(100)
    const small = gridOf(withRental, statement(0, 1_000_000, 0, 6_000, 0))
    expect(propertyOf(small)!.pockets).toEqual({
      location: { value: 600_000, squares: 1 },
      'chez-toi': { value: 100_000_000, squares: 99 },
    })
    expect(total(small)).toBe(100)
  })

  it('both pockets under water: Immobilier leaves the grid as a whole', () => {
    const grid = gridOf(withRental, statement(50_000, 100_000, 120_000, 100_000, 110_000))
    expect(grid.categories.map((c) => [c.category, c.squares])).toEqual([['available', 100]])
    expect(grid.excluded).toEqual(['property'])
    expect(grid.excludedPockets).toEqual([])
    expect(pocketSquares(grid, 'location')).toBe(0)
    expect(pocketSquares(grid, 'chez-toi')).toBe(0)
  })

  it('a profile without a rental has no pocket excluded', () => {
    const grid = gridOf(
      homeUnderWater,
      snapshotOf([amountEntry('cash', 50_000), amountEntry('house', 150_000), amountEntry('loan', 180_000), amountEntry('etf', 30_000)]),
    )
    expect(grid.excludedPockets).toEqual([])
    const example = gridOf(exampleProfile, exampleSnapshot)
    expect(propertyOf(example)!.pockets).toEqual({
      location: { value: 0, squares: 0 },
      'chez-toi': { value: 12_000_000, squares: 59 },
    })
  })
})

// Read from the code before the pockets (10 November 2026), and never rewritten since.
const EXAMPLE =
  '20200000|202000|available=10/2000000[current-line=4/800000,livret-a-line=6/1200000]{} secured=15/3000000[euro-fund=15/3000000]{} markets=15/3000000[etf=13/2500000,life-uc=2/500000]{} gold=1/200000[gold-line=1/200000]{} property=59/12000000[house-line=59/12000000]{}|excluded:|available*10,secured*15,markets*15,gold*1,property*59'
const PERSON = [
  '7500000|75000|available=21/1600000[courant-ligne=4/300000,livret-ligne=17/1300000]{} secured=23/1700000[fonds-euros=23/1700000]{} markets=23/1720000[fonds-monde=23/1720000]{} gold=6/430000[or-ligne=6/430000]{} property=27/2050000[appartement-ligne=27/2050000]{}|excluded:|available*21,secured*23,markets*23,gold*6,property*27',
  '8534000|85340|available=24/2014000[courant-ligne=5/380000,livret-ligne=19/1634000]{} secured=21/1820000[fonds-euros=21/1820000]{} markets=22/1840000[fonds-monde=22/1840000]{} gold=5/460000[or-ligne=5/460000]{} property=28/2400000[appartement-ligne=28/2400000]{}|excluded:|available*24,secured*21,markets*22,gold*5,property*28',
  '9400000|94000|available=10/960000[courant-ligne=5/450000,livret-ligne=5/510000]{} secured=24/2210000[fonds-euros=24/2210000]{} markets=32/3000000[fonds-monde=32/3000000]{} gold=5/480000[or-ligne=5/480000]{} property=29/2750000[appartement-ligne=29/2750000]{}|excluded:|available*10,secured*24,markets*32,gold*5,property*29',
  '10000000|100000|available=12/1200000[courant-ligne=4/400000,livret-ligne=8/800000]{} secured=23/2300000[fonds-euros=23/2300000]{} markets=30/3000000[fonds-monde=23/2250000,fonds-europe=5/500000,fonds-usa=2/250000]{} gold=5/500000[or-ligne=5/500000]{} property=30/3000000[appartement-ligne=30/3000000]{}|excluded:|available*12,secured*23,markets*30,gold*5,property*30',
]
const UNDER_WATER =
  '8000000|80000|available=63/5000000[cash=63/5000000]{} markets=37/3000000[etf=37/3000000]{}|excluded:property|available*63,markets*37'
const OTHER_ACCOUNT =
  '10000000|100000|available=10/1000000[cash=10/1000000]{} property=90/9000000[scpi=20/2000000,flat=70/7000000]{}|excluded:|available*10,property*90'
const TWO_HOMES =
  '19000000|190000|available=5/1000000[cash=5/1000000]{} property=95/18000000[h1-line=95/20000000,h2-line=0/-2000000]{h2-line}|excluded:|available*5,property*95'

// « Chez toi » in its own green (Nicolas, 11 November 2026): the last squares of Immobilier, and only
// when the grid holds both pockets.
describe('homeRange', () => {
  it('is the last squares of Immobilier when both pockets have squares', () => {
    const grid = gridOf(withRental, statement(1_000_000, 12_000_000, 0, 5_000_000, 0))
    const range = homeRange(grid.categories)
    const property = propertyOf(grid)!
    const start = total(grid) - property.squares
    expect(range).toEqual({ from: start + property.squares - pocketSquares(grid, 'chez-toi'), to: start + property.squares })
    expect(cellsOf(grid).slice(range!.from, range!.to).every((c) => c === 'property')).toBe(true)
  })

  it('is null without a rental, so nothing changes on screen', () => {
    expect(homeRange(gridOf(withRental, statement(1_000_000, 12_000_000, 0, 0, 0)).categories)).toBeNull()
    expect(homeRange(gridOf(exampleProfile, exampleSnapshot).categories)).toBeNull()
  })

  it('is null when one pocket has no square (under water)', () => {
    const grid = gridOf(withRental, statement(1_000_000, 12_000_000, 13_000_000, 5_000_000, 0))
    expect(pocketSquares(grid, 'chez-toi')).toBe(0)
    expect(homeRange(grid.categories)).toBeNull()
  })
})
