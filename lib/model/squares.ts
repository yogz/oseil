import { POCKET_ORDER, type LineHolding, type PocketId, type Situation } from '@/lib/model/situation'
import type { CategoryId, Cents } from '@/lib/model/types'

const GRID_SIZE = 100

// Shares `total` whole units between entries in proportion to their weights.
// An `atLeastOne` entry with a positive weight never ends at 0.
export function largestRemainder(
  weights: readonly number[],
  total: number,
  options: { atLeastOne?: readonly boolean[] } = {},
): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(w, 0), 0)
  if (sum <= 0) return weights.map(() => 0)

  const quotas = weights.map((w) => (Math.max(w, 0) * total) / sum)
  const parts = quotas.map((q) => Math.floor(q))
  const remainders = quotas.map((q, i) => q - parts[i])
  const bumped = weights.map(() => false)
  const protectedAtOne = weights.map(() => false)

  weights.forEach((w, i) => {
    if (options.atLeastOne?.[i] && w > 0) {
      protectedAtOne[i] = true
      if (parts[i] === 0) {
        parts[i] = 1
        bumped[i] = true
      }
    }
  })

  let left = total - parts.reduce((s, p) => s + p, 0)

  // Hand out what is left: biggest remainder first, then biggest weight, then first in line.
  while (left > 0) {
    let best = -1
    weights.forEach((w, i) => {
      if (bumped[i] || w <= 0) return
      if (
        best === -1 ||
        remainders[i] > remainders[best] ||
        (remainders[i] === remainders[best] && w > weights[best])
      ) {
        best = i
      }
    })
    if (best === -1) break
    parts[best] += 1
    remainders[best] = -1 // each entry receives at most one extra square
    left -= 1
  }

  // The minimums overflowed: take from the biggest unprotected parts, the last one on a tie.
  while (left < 0) {
    let worst = -1
    parts.forEach((p, i) => {
      if (p === 0 || (protectedAtOne[i] && p === 1)) return
      if (worst === -1 || p >= parts[worst]) worst = i
    })
    if (worst === -1) break
    parts[worst] -= 1
    left += 1
  }

  return parts
}

export type GridLine = { lineId: string; value: Cents; squares: number }
export type GridPocket = { value: Cents; squares: number }

export type GridCategory = {
  category: CategoryId
  // What its squares show: for Immobilier, the sum of its positive pockets only.
  value: Cents
  squares: number
  // For Immobilier: the rental lines first, then the Chez toi ones (a pocket under water: 0 squares).
  lines: GridLine[]
  tooSmall: string[]
  // On Immobilier only: each pocket's net value (negative when under water) and its squares.
  pockets?: Record<PocketId, GridPocket>
}

export type Grid =
  | { kind: 'none'; reason: 'nothing-owned' | 'net-not-positive' }
  | {
      kind: 'grid'
      total: Cents
      squareValue: number
      categories: GridCategory[]
      excluded: CategoryId[]
      // The pockets under water while Immobilier keeps squares from the other one: no square, and a
      // sentence to say it. When both are under water, Immobilier is in `excluded` as a whole.
      excludedPockets: PocketId[]
    }

// One block of squares shared at the top: a category, or one pocket of Immobilier.
type Block = { category: CategoryId; pocket: PocketId | null; value: Cents; lines: LineHolding[] }

export function buildGrid(situation: Situation): Grid {
  if (situation.owned === 0) return { kind: 'none', reason: 'nothing-owned' }
  if (situation.net <= 0) return { kind: 'none', reason: 'net-not-positive' }

  // Each pocket of Immobilier is shared as a block of its own: one under water drops out alone and
  // never lowers the other. Without a rental, the one Chez toi block is the category as it was.
  const blocks: Block[] = situation.categories.flatMap((c): Block[] =>
    c.pockets
      ? POCKET_ORDER.map((pocket) => ({ category: c.category, pocket, ...c.pockets![pocket] }))
      : [{ category: c.category, pocket: null, value: c.value, lines: c.lines }],
  )
  const positive = blocks.filter((b) => b.value > 0)
  // Less than half a square has no square (Nicolas, 10 November 2026): 1 € of crypto drawn as one
  // square of 6 000 €, and « pile à ton objectif » under it, was a false figure that looked good. Its
  // row stays, with its true amount and « moins de 1 % »; its square goes to the others. From half a
  // square on, a block keeps at least one, so that what is there is seen.
  const sum = positive.reduce((total, b) => total + b.value, 0)
  const counted = positive.map((b) => (b.value * GRID_SIZE) / sum >= 0.5)
  const shares = largestRemainder(
    positive.map((b, i) => (counted[i] ? b.value : 0)),
    GRID_SIZE,
    { atLeastOne: counted },
  )
  const squaresOf = new Map(positive.map((b, i) => [b, shares[i]]))

  const inGrid = situation.categories.filter((c) => positive.some((b) => b.category === c.category))
  const excluded = situation.categories
    .filter((c) => c.value < 0 && !inGrid.includes(c))
    .map((c) => c.category)
  const excludedPockets: PocketId[] = []

  const categories = inGrid.map((c): GridCategory => {
    const own = blocks.filter((b) => b.category === c.category)
    const lines: GridLine[] = []
    const tooSmall: string[] = []
    for (const block of own) {
      const squares = squaresOf.get(block) ?? 0
      if (block.pocket && block.value < 0) excludedPockets.push(block.pocket)
      const lineSquares = largestRemainder(
        block.lines.map((l) => l.value),
        squares,
      )
      block.lines.forEach((l, j) => {
        lines.push({ lineId: l.lineId, value: l.value, squares: lineSquares[j] })
        // A line of a pocket with no square is not too small: it has nothing to show.
        if (squares > 0 && lineSquares[j] === 0) tooSmall.push(l.lineId)
      })
    }
    const value = own.filter((b) => b.value > 0).reduce((s, b) => s + b.value, 0)
    const entry: GridCategory = { category: c.category, value, squares: own.reduce((s, b) => s + (squaresOf.get(b) ?? 0), 0), lines, tooSmall }
    if (c.pockets) {
      const pocket = (id: PocketId): GridPocket => {
        const block = own.find((b) => b.pocket === id)!
        return { value: block.value, squares: squaresOf.get(block) ?? 0 }
      }
      entry.pockets = { location: pocket('location'), 'chez-toi': pocket('chez-toi') }
    }
    return entry
  })

  const total = positive.reduce((s, b) => s + b.value, 0)
  return { kind: 'grid', total, squareValue: total / GRID_SIZE, categories, excluded, excludedPockets }
}

// The squares of one pocket of Immobilier; 0 when it has none. In the cells, the rental squares are
// the first of Immobilier's, the Chez toi ones the last.
export function pocketSquares(grid: Extract<Grid, { kind: 'grid' }>, pocket: PocketId): number {
  return grid.categories.find((c) => c.pockets)?.pockets?.[pocket].squares ?? 0
}

// The squares of « Chez toi », from `from` up to `to` (not included), shown in their own green;
// null unless the grid holds both pockets (without a rental, nothing changes on screen). They are
// the last squares of Immobilier.
export function homeRange(categories: readonly GridCategory[]): { from: number; to: number } | null {
  let start = 0
  for (const category of categories) {
    if (category.pockets) {
      const home = category.pockets['chez-toi'].squares
      if (home === 0 || category.pockets.location.squares === 0) return null
      const end = start + category.squares
      return { from: end - home, to: end }
    }
    start += category.squares
  }
  return null
}

// The category of each square, in reading order: the grid filled row by row, category after category.
// Two grids compared cell by cell (Évolution, the result of an update) never move a square.
export function cellsOf(grid: Extract<Grid, { kind: 'grid' }>): CategoryId[] {
  return grid.categories.flatMap((c) => Array<CategoryId>(c.squares).fill(c.category))
}

export function shareLabel(squares: number): string {
  return squares < 1 ? 'moins de 1 %' : `${squares} %`
}
