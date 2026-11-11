// The available money aimed at in months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md):
// its target squares come from the budget, the four others share the rest.
import { expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { goalSquares, goalTargets } from '@/lib/model/goals'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid, type Grid } from '@/lib/model/squares'
import type { Budget, GoalAllocation } from '@/lib/model/types'
import { PROFILES } from '@/lib/screens/__tests__/profils/profiles'

type GridOnly = Extract<Grid, { kind: 'grid' }>

function gridOf(model: Model): GridOnly {
  const snapshot = model.snapshots[model.snapshots.length - 1].value
  const grid = buildGrid(computeSituation(model.profile!.value, snapshot))
  if (grid.kind !== 'grid') throw new Error('no grid')
  return grid
}

const inMonths = (months: number): GoalAllocation => ({
  schema: 1,
  validFrom: '2026-01-01',
  shares: { available: 0, secured: 17, markets: 72, gold: 11, rental: 0 },
  cushionMonths: months,
})
const expenses = (euros: number): Budget => ({ basis: 'expenses', monthly: euros * 100 })

test('Léa, 4 months of 1 600 €: 6 400 € over squares of 155 € is 41; the others share the 59 left', () => {
  expect(goalTargets(inMonths(4), gridOf(PROFILES.lea()), expenses(1_600))).toEqual({
    available: 41,
    secured: 10,
    markets: 42,
    gold: 7,
    rental: 0,
  })
})

test('a cushion beyond everything outside the home takes every square, the others none, never less', () => {
  expect(goalTargets(inMonths(24), gridOf(PROFILES.lucie()), expenses(1_400))).toEqual({
    available: 100,
    secured: 0,
    markets: 0,
    gold: 0,
    rental: 0,
  })
})

test('a budget of 1 €: no square for the cushion, the others share the hundred', () => {
  expect(goalTargets(inMonths(24), gridOf(PROFILES.lea()), { basis: 'expenses', monthly: 100 })).toEqual({
    available: 0,
    secured: 17,
    markets: 72,
    gold: 11,
    rental: 0,
  })
})

test('« Chez toi » taking every square leaves no target to anyone', () => {
  const grid = gridOf(PROFILES.lea())
  const home: GridOnly = {
    ...grid,
    categories: [{ category: 'property', value: grid.total, squares: 100, lines: [], tooSmall: [], pockets: { 'chez-toi': { value: grid.total, squares: 100 }, location: { value: 0, squares: 0 } } }],
  } as GridOnly
  expect(goalTargets(inMonths(4), home, expenses(1_600))).toEqual({ available: 0, secured: 0, markets: 0, gold: 0, rental: 0 })
})

test('months and no budget: no target can be said', () => {
  expect(goalTargets(inMonths(4), gridOf(PROFILES.lea()), null)).toBeNull()
  expect(goalTargets(inMonths(4), gridOf(PROFILES.lea()), { basis: 'expenses', monthly: 0 })).toBeNull()
})

test('a goal in percents is read as before, budget or not', () => {
  const percents: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: { available: 10, secured: 15, markets: 65, gold: 10, rental: 0 } }
  const grid = gridOf(PROFILES.lea())
  expect(goalTargets(percents, grid, expenses(1_600))).toEqual(goalSquares(percents.shares, grid))
  expect(goalTargets(percents, grid, null)).toEqual(goalSquares(percents.shares, grid))
})
