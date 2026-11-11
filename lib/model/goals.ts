import { GOAL_CATEGORIES, GOAL_COLOR } from '@/lib/catalog'
import { holdsRental, type Situation } from '@/lib/model/situation'
import { cellsOf, largestRemainder, pocketSquares, type Grid } from '@/lib/model/squares'
import type { Budget, CategoryId, Cents, GoalAllocation, GoalCategory, GoalShares, IsoDate } from '@/lib/model/types'

type GridOnly = Extract<Grid, { kind: 'grid' }>

const GRID_SIZE = 100

// The allocation with the greatest validFrom on or before `on`; the last one in the array on a tie.
export function goalInEffect(allocations: readonly GoalAllocation[], on: IsoDate): GoalAllocation | null {
  let found: GoalAllocation | null = null
  for (const allocation of allocations) {
    if (allocation.validFrom > on) continue
    if (!found || allocation.validFrom >= found.validFrom) found = allocation
  }
  return found
}

// The squares a goal share holds today: the rental share holds the squares of the rental pocket of
// Immobilier; Chez toi has no goal and holds none of them.
export function heldSquares(grid: GridOnly, category: GoalCategory): number {
  if (category === 'rental') return pocketSquares(grid, 'location')
  return grid.categories.find((c) => c.category === category)?.squares ?? 0
}

// What a goal share holds today, in cents: a rental pocket under its loans holds nothing.
export function heldValue(grid: GridOnly, category: GoalCategory): Cents {
  if (category === 'rental') return Math.max(0, grid.categories.find((c) => c.pockets)?.pockets?.location.value ?? 0)
  return grid.categories.find((c) => c.category === category)?.value ?? 0
}

// Whether Immobilier is told in its two pockets, Chez toi and En location: with a rental, or with a
// rental share still to reach in the goals in force (the goals then still add up on screen), even
// with no rental left. `targets`: the goals in squares, null when there is nothing to compare. The
// one rule of Mon argent and of the detail of Immobilier.
export function splitsProperty(situation: Situation, targets: Record<GoalCategory, number> | null): boolean {
  return holdsRental(situation) || (targets !== null && targets.rental > 0)
}

// Whether any square is steered by the goals: every square but the Chez toi ones (the rental's
// included). Without one, there is nothing to compare with the goals. The one rule of every screen.
export function hasSteeredSquares(grid: GridOnly): boolean {
  return pocketSquares(grid, 'chez-toi') < GRID_SIZE
}

// The goal share each cell belongs to, in the order of `cellsOf`; null for a Chez toi cell, which
// no goal moves. The rental squares are the first of Immobilier's.
function cellGoals(grid: GridOnly): Array<GoalCategory | null> {
  return grid.categories.flatMap((c): Array<GoalCategory | null> => {
    if (c.category !== 'property') return Array<GoalCategory>(c.squares).fill(c.category)
    const rental = pocketSquares(grid, 'location')
    return [...Array<GoalCategory>(rental).fill('rental'), ...Array<null>(c.squares - rental).fill(null)]
  })
}

// The goal shares as whole squares, over what Chez toi leaves of the 100 squares.
export function goalSquares(shares: GoalShares, grid: GridOnly): Record<GoalCategory, number> {
  const room = GRID_SIZE - pocketSquares(grid, 'chez-toi')
  const parts = largestRemainder(
    GOAL_CATEGORIES.map((c) => shares[c]),
    room,
  )
  return Object.fromEntries(GOAL_CATEGORIES.map((c, i) => [c, parts[i]])) as Record<GoalCategory, number>
}

// The squares a cushion of `months` of the budget is worth, never more than the goals steer.
export function cushionTargetSquares(months: number, budget: Budget, grid: GridOnly): number {
  const room = GRID_SIZE - pocketSquares(grid, 'chez-toi')
  return Math.min(room, Math.round((months * budget.monthly) / grid.squareValue))
}

// The goal in squares, whatever its form (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
// In percents: as goalSquares. In months: the cushion first, from the budget, then the four others share
// what is left by their percents. Null when months are asked and no budget says what a month is.
export function goalTargets(allocation: GoalAllocation, grid: GridOnly, budget: Budget | null): Record<GoalCategory, number> | null {
  if (allocation.cushionMonths === undefined) return goalSquares(allocation.shares, grid)
  if (!budget || budget.monthly <= 0) return null
  const room = GRID_SIZE - pocketSquares(grid, 'chez-toi')
  const available = cushionTargetSquares(allocation.cushionMonths, budget, grid)
  const others = GOAL_CATEGORIES.filter((c) => c !== 'available')
  const parts = largestRemainder(
    others.map((c) => allocation.shares[c]),
    room - available,
  )
  return { available, ...Object.fromEntries(others.map((c, i) => [c, parts[i]])) } as Record<GoalCategory, number>
}

// The goal as shares of what is outside the home, for the traces of Évolution. In months: the cushion's
// share of that day (never more than 100), the four others their percent of what it leaves.
export function goalSharesOf(allocation: GoalAllocation, grid: GridOnly, budget: Budget | null): GoalShares | null {
  if (allocation.cushionMonths === undefined) return allocation.shares
  if (!budget || budget.monthly <= 0) return null
  const outside = GOAL_CATEGORIES.reduce((sum, c) => sum + heldValue(grid, c), 0)
  if (outside <= 0) return null
  const available = Math.min(100, ((allocation.cushionMonths * budget.monthly) / outside) * 100)
  const rest = 1 - available / 100
  return Object.fromEntries(
    GOAL_CATEGORIES.map((c) => [c, c === 'available' ? available : allocation.shares[c] * rest]),
  ) as GoalShares
}

// Squares held beyond the target, summed over the goal categories.
export function misplacedSquares(grid: GridOnly, targets: Record<GoalCategory, number>): number {
  return GOAL_CATEGORIES.reduce((sum, c) => sum + Math.max(0, heldSquares(grid, c) - targets[c]), 0)
}

// The grid as it would be at the goals (planche 3), for a simulation the person asks for. Every
// square keeps its cell: the last squares of a goal share held beyond its target take, in the order
// of the shares, the colour of a share short of its own. The rental squares can change; the Chez
// toi ones never do. As many squares change as `misplacedSquares` counts.
export function squaresAtGoals(
  grid: GridOnly,
  targets: Record<GoalCategory, number>,
): { real: CategoryId[]; atGoals: CategoryId[] } {
  const real = cellsOf(grid)
  const goals = cellGoals(grid)
  const atGoals = [...real]
  const excess: number[] = []
  for (const category of GOAL_CATEGORIES) {
    const cells = goals.flatMap((c, i) => (c === category ? [i] : []))
    excess.push(...cells.slice(targets[category]))
  }
  for (const category of GOAL_CATEGORIES) {
    const lack = targets[category] - heldSquares(grid, category)
    for (let i = 0; i < lack; i++) {
      const cell = excess.shift()
      if (cell === undefined) break
      atGoals[cell] = GOAL_COLOR[category]
    }
  }
  return { real, atGoals }
}

// « Montre-moi mes objectifs », option F (Nicolas, 10 November 2026, after three specialists): where the
// squares leave from, the places they go to, and the grid at the goals in blocks, as a real grid is.
// - `sources`: the cells held beyond a target, the last of their share (as `squaresAtGoals` picks them);
// - `blocks`: the grid at the goals, every share in one block in the order of the shares; the Chez toi
//   cells never change;
// - `arrivals`: in the block of each share short of its target, as many cells as it lacks, the first
//   of its block that were not already its own: the places the squares come to;
// - `moves`: how many squares go from one share to another, in the order of the shares.
export type GoalsJourney = {
  real: CategoryId[]
  blocks: CategoryId[]
  sources: number[]
  arrivals: number[]
  moves: Array<{ from: GoalCategory; to: GoalCategory; squares: number }>
}

export function goalsJourney(grid: GridOnly, targets: Record<GoalCategory, number>): GoalsJourney {
  const real = cellsOf(grid)
  const goals = cellGoals(grid)
  const sources: number[] = []
  const leaving: GoalCategory[] = []
  for (const category of GOAL_CATEGORIES) {
    const cells = goals.flatMap((c, i) => (c === category ? [i] : []))
    for (const cell of cells.slice(targets[category])) {
      sources.push(cell)
      leaving.push(category)
    }
  }
  // The steered cells, in order; the Chez toi ones keep their place and their colour.
  const steered = goals.flatMap((c, i) => (c === null ? [] : [i]))
  const blocks = [...real]
  const blockOf: Array<GoalCategory | null> = goals.map(() => null)
  let next = 0
  for (const category of GOAL_CATEGORIES) {
    for (let k = 0; k < targets[category] && next < steered.length; k++) {
      const cell = steered[next++]
      blocks[cell] = GOAL_COLOR[category]
      blockOf[cell] = category
    }
  }
  const arrivals: number[] = []
  const moves: GoalsJourney['moves'] = []
  let taken = 0
  for (const category of GOAL_CATEGORIES) {
    const lack = targets[category] - heldSquares(grid, category)
    if (lack <= 0) continue
    const places = blockOf.flatMap((c, i) => (c === category && goals[i] !== category ? [i] : []))
    arrivals.push(...places.slice(0, lack))
    for (let k = 0; k < lack && taken < leaving.length; k++) {
      const from = leaving[taken++]
      const last = moves[moves.length - 1]
      if (last && last.from === from && last.to === category) last.squares++
      else moves.push({ from, to: category, squares: 1 })
    }
  }
  return { real, blocks, sources, arrivals, moves }
}

export const NOTHING_YET = 'rien pour l’instant'

// The gap is actual - target, in squares. A category that holds nothing says so, whatever the
// gap: « presque à ton objectif » on 0 € would be a reassuring word on an empty category.
export function gapWords(actual: number, target: number, held = true): string {
  if (!held) return NOTHING_YET
  const gap = actual - target
  if (gap === 0) return 'pile à ton objectif'
  if (Math.abs(gap) === 1) return 'presque à ton objectif'
  if (gap > 0) return gap <= 5 ? 'un peu au-dessus de ton objectif' : 'au-dessus de ton objectif'
  return gap >= -5 ? 'un peu en dessous de ton objectif' : 'en dessous de ton objectif'
}

// Each goal share's part of all of them together (Chez toi left out), times 100, not rounded.
export function currentShares(grid: GridOnly): GoalShares {
  const values = GOAL_CATEGORIES.map((c) => heldValue(grid, c))
  const sum = values.reduce((s, v) => s + v, 0)
  if (sum <= 0) throw new Error('Nothing is held outside the home: there is no current split to show')
  return Object.fromEntries(GOAL_CATEGORIES.map((c, i) => [c, (values[i] / sum) * 100])) as GoalShares
}
