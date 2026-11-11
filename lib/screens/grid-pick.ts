// Touching the grid (decided by Nicolas on 9 November 2026): on Mon argent, a square opens its
// category's detail, as its row does; on that detail, a square of the same category lights its line
// alone; on a computer, the square under the mouse is told under the grid. What is needed: whose a
// square is, which squares a line holds, and what a square tells. Pure: no React.

import { homeRange, type GridCategory } from '@/lib/model/squares'
import type { CategoryId } from '@/lib/model/types'
import type { CategoryDetailView } from '@/lib/screens/category-detail'

export type Owner = { category: CategoryId; lineId: string }
// `euros` and `percent` are the line's figures as its category's detail shows them; the screen's
// € / % mode picks one. `note`: what the figure already leaves out, said after it.
// `home`: a square of « Chez toi » beside a rental, whose small square takes its own green.
export type Told = {
  category: CategoryId
  name: string
  categoryName: string
  euros: string
  percent: string
  note: string | null
  home?: boolean
}

// A line a loan finances (a house): its figure is already net of the loan (Nicolas, 9 November 2026).
export const LOAN_DEDUCTED = 'crédit déduit'

// The square at `index`, in the order the grid draws them: category after category, and inside a
// category its lines one after the other (a line too small for a square owns none).
export function squareOwner(categories: readonly GridCategory[], index: number): Owner | null {
  let start = 0
  for (const category of categories) {
    for (const line of category.lines) {
      if (index < start + line.squares) return { category: category.category, lineId: line.lineId }
      start += line.squares
    }
  }
  return null
}

// What the square at `index` tells under the grid while the mouse is over it, on a computer (9 November
// 2026): its line, its category, and the line's figures as the category's detail shows them, so that a
// hidden amount reads « ••• » there too; « crédit déduit » when a loan is already taken off. Null: no
// square there, or a line the detail does not show.
export function squareTold(
  categories: readonly GridCategory[],
  index: number,
  detailOf: (category: CategoryId) => CategoryDetailView | null,
): Told | null {
  const owner = squareOwner(categories, index)
  const detail = owner ? detailOf(owner.category) : null
  const line = detail?.lines.find((l) => l.lineId === owner?.lineId)
  if (!owner || !detail || !line) return null
  const home = homeRange(categories)
  return {
    ...(home && index >= home.from && index < home.to ? { home: true } : {}),
    category: owner.category,
    name: line.name,
    categoryName: detail.name,
    euros: line.euros,
    percent: line.percent,
    note: line.loans.length > 0 ? LOAN_DEDUCTED : null,
  }
}

// The squares `lineId` holds, from `from` up to `to` (not included); null: it holds none.
export function lineRange(categories: readonly GridCategory[], lineId: string): { from: number; to: number } | null {
  let start = 0
  for (const category of categories) {
    for (const line of category.lines) {
      if (line.lineId === lineId) return line.squares > 0 ? { from: start, to: start + line.squares } : null
      start += line.squares
    }
  }
  return null
}
