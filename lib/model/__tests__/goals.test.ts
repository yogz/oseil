import { describe, expect, it } from 'vitest'
import { GOAL_PRESETS } from '@/lib/catalog'
import { cushion } from '@/lib/model/cushion'
import {
  currentShares,
  gapWords,
  goalInEffect,
  goalSquares,
  goalsJourney,
  heldSquares,
  misplacedSquares,
  squaresAtGoals,
} from '@/lib/model/goals'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid } from '@/lib/model/squares'
import type { Grid } from '@/lib/model/squares'
import type { GoalAllocation } from '@/lib/model/types'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from './fixtures'

function gridOf(grid: Grid) {
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  return grid
}

const example = gridOf(buildGrid(computeSituation(exampleProfile, exampleSnapshot)))

describe('goalSquares and misplacedSquares', () => {
  it('shares what is left after the home among the four goal categories', () => {
    const targets = goalSquares(GOAL_PRESETS.balanced.shares, example)
    expect(targets).toEqual({ available: 10, secured: 10, markets: 19, gold: 2, rental: 0 })
    expect(misplacedSquares(example, targets)).toBe(5)
  })

  it('gives the whole grid to the goal when there is no home', () => {
    const grid = gridOf(
      buildGrid(
        computeSituation(
          profileOf([account('a', 'current')], [line('l', 'a', { category: 'available' })]),
          snapshotOf([amountEntry('l', 1_000)]),
        ),
      ),
    )
    const targets = goalSquares(GOAL_PRESETS.balanced.shares, grid)
    expect(Object.values(targets).reduce((s, n) => s + n, 0)).toBe(100)
  })
})

describe('squaresAtGoals (planche 3)', () => {
  const targets = goalSquares(GOAL_PRESETS.balanced.shares, example)
  const { real, atGoals } = squaresAtGoals(example, targets)

  it('keeps every square in its cell, in the order of the grid', () => {
    expect(real).toHaveLength(100)
    expect(atGoals).toHaveLength(100)
    expect(real).toEqual(example.categories.flatMap((c) => Array(c.squares).fill(c.category)))
  })

  it('recolours exactly the misplaced squares, and only those', () => {
    const changed = real.filter((c, i) => c !== atGoals[i]).length
    expect(changed).toBe(misplacedSquares(example, targets))
    expect(changed).toBeGreaterThan(0)
  })

  it('gives each goal category its target, and leaves the home as it is', () => {
    const count = (cells: string[], c: string) => cells.filter((x) => x === c).length
    for (const [category, target] of Object.entries(targets)) expect(count(atGoals, category)).toBe(target)
    real.forEach((c, i) => {
      if (c === 'property') expect(atGoals[i]).toBe('property')
    })
  })

  it('takes the last squares of a category in excess, those at its end', () => {
    real.forEach((c, i) => {
      if (atGoals[i] !== c) expect(real[i + 1] === c && atGoals[i + 1] === c).toBe(false)
    })
  })
})

// « Montre-moi mes objectifs », option F (Nicolas, 10 November 2026): where the squares leave from,
// the places they go to, and the grid at the goals in blocks.
describe('goalsJourney (option F)', () => {
  const targets = goalSquares(GOAL_PRESETS.balanced.shares, example)
  const journey = goalsJourney(example, targets)
  const misplaced = misplacedSquares(example, targets)

  it('leaves from the squares the simulation always recoloured', () => {
    const { real, atGoals } = squaresAtGoals(example, targets)
    expect(journey.real).toEqual(real)
    expect(journey.sources).toEqual(real.flatMap((c, i) => (atGoals[i] !== c ? [i] : [])))
    expect(journey.sources).toHaveLength(misplaced)
  })

  it('ends on the grid at the goals in blocks, each share in one piece, the home unchanged', () => {
    const count = (c: string) => journey.blocks.filter((x) => x === c).length
    for (const [category, target] of Object.entries(targets)) {
      if (category === 'rental') continue
      expect(count(category)).toBe(target)
      const first = journey.blocks.indexOf(category as never)
      if (target > 0) expect(journey.blocks.slice(first, first + target).every((x) => x === category)).toBe(true)
    }
    journey.real.forEach((c, i) => {
      if (c === 'property') expect(journey.blocks[i]).toBe('property')
    })
  })

  it('arrives in the block of each share short of its target, on as many cells as it lacks, none of them its own before', () => {
    expect(journey.arrivals).toHaveLength(misplaced)
    for (const cell of journey.arrivals) expect(journey.real[cell]).not.toBe(journey.blocks[cell])
  })

  it('says how many squares go from one share to another, as many as are misplaced', () => {
    expect(journey.moves.reduce((n, m) => n + m.squares, 0)).toBe(misplaced)
    for (const move of journey.moves) {
      expect(heldSquares(example, move.from)).toBeGreaterThan(targets[move.from])
      expect(heldSquares(example, move.to)).toBeLessThan(targets[move.to])
    }
  })
})

describe('gapWords on an empty category', () => {
  it.each([
    [0, 1],
    [0, 2],
    [0, 0],
    [0, 8],
  ])('a category holding nothing (%i squares, goal %i) says so, never « presque » or « pile »', (actual, target) => {
    expect(gapWords(actual, target, false)).toBe('rien pour l’instant')
  })

  it('a category that holds something keeps the words of the gap', () => {
    expect(gapWords(1, 2, true)).toBe('presque à ton objectif')
  })
})

describe('gapWords', () => {
  it.each([
    [10, 6, 'un peu au-dessus de ton objectif'],
    [15, 19, 'un peu en dessous de ton objectif'],
    [15, 14, 'presque à ton objectif'],
    [1, 2, 'presque à ton objectif'],
    [7, 7, 'pile à ton objectif'],
    [30, 20, 'au-dessus de ton objectif'],
    [20, 30, 'en dessous de ton objectif'],
    [12, 7, 'un peu au-dessus de ton objectif'],
    [13, 7, 'au-dessus de ton objectif'],
  ])('gapWords(%i, %i)', (actual, target, words) => {
    expect(gapWords(actual, target)).toBe(words)
  })
})

describe('goalInEffect', () => {
  const shares = GOAL_PRESETS.balanced.shares
  const a: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares }
  const b: GoalAllocation = { schema: 1, validFrom: '2026-06-01', shares: GOAL_PRESETS.prudent.shares }

  it('picks the latest validFrom not after the date', () => {
    expect(goalInEffect([a, b], '2026-03-15')).toBe(a)
    expect(goalInEffect([b, a], '2026-06-01')).toBe(b)
    expect(goalInEffect([a, b], '2025-12-31')).toBeNull()
  })

  it('takes the last one of the array on a tie', () => {
    const c: GoalAllocation = { ...b, shares: GOAL_PRESETS.dynamic.shares }
    expect(goalInEffect([a, b, c], '2026-07-01')).toBe(c)
  })
})

describe('currentShares', () => {
  it('is each goal category over their sum, times 100', () => {
    const s = currentShares(example)
    expect(s.available).toBeCloseTo(24.39, 2)
    expect(s.secured).toBeCloseTo(36.59, 2)
    expect(s.markets).toBeCloseTo(36.59, 2)
    expect(s.gold).toBeCloseTo(2.44, 2)
    expect(s.available + s.secured + s.markets + s.gold).toBeCloseTo(100, 9)
  })

  it('refuses to answer when only the home is held', () => {
    const grid = gridOf(
      buildGrid(
        computeSituation(
          profileOf([account('h', 'home')], [line('l', 'h', { category: 'property' })]),
          snapshotOf([amountEntry('l', 200_000)]),
        ),
      ),
    )
    expect(() => currentShares(grid)).toThrow()
  })
})

describe('cushion', () => {
  const expenses = { basis: 'expenses', monthly: 500_000 } as const
  it('rounds to the nearest half month', () => {
    expect(cushion(2_750_000, expenses)).toEqual({ months: 5.5, basis: 'expenses' })
    expect(cushion(2_600_000, expenses)).toEqual({ months: 5, basis: 'expenses' })
  })
  it('floors a negative balance at 0 months', () => {
    expect(cushion(-300_000, expenses)).toEqual({ months: 0, basis: 'expenses' })
  })
  it('says nothing without a usable budget', () => {
    expect(cushion(1_000_000, null)).toBeNull()
    expect(cushion(1_000_000, { basis: 'expenses', monthly: 0 })).toBeNull()
  })
})
