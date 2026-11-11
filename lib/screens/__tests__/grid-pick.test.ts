import { expect, test } from 'vitest'
import type { GridCategory } from '@/lib/model/squares'
import type { CategoryDetailView, DetailLine } from '@/lib/screens/category-detail'
import { lineRange, squareOwner, squareTold } from '../grid-pick'

const cat = (category: GridCategory['category'], lines: Array<[string, number]>): GridCategory => ({
  category,
  value: 0,
  squares: lines.reduce((t, [, n]) => t + n, 0),
  lines: lines.map(([lineId, squares]) => ({ lineId, value: 0, squares })),
  tooSmall: lines.filter(([, n]) => n === 0).map(([id]) => id),
})
// 3 squares of available (2 for the current account, 1 for the booklet), then 97 of markets, of
// which a line too small to hold a square.
const GRID = [cat('available', [['current', 2], ['booklet', 1]]), cat('markets', [['tiny', 0], ['pea', 60], ['cto', 37]])]

test('each square belongs to a category and to one of its lines, in the order of the grid', () => {
  expect(squareOwner(GRID, 0)).toEqual({ category: 'available', lineId: 'current' })
  expect(squareOwner(GRID, 1)).toEqual({ category: 'available', lineId: 'current' })
  expect(squareOwner(GRID, 2)).toEqual({ category: 'available', lineId: 'booklet' })
  // A line with no square owns none: the next square is the next line's.
  expect(squareOwner(GRID, 3)).toEqual({ category: 'markets', lineId: 'pea' })
  expect(squareOwner(GRID, 62)).toEqual({ category: 'markets', lineId: 'pea' })
  expect(squareOwner(GRID, 63)).toEqual({ category: 'markets', lineId: 'cto' })
  expect(squareOwner(GRID, 99)).toEqual({ category: 'markets', lineId: 'cto' })
  expect(squareOwner(GRID, 100)).toBeNull()
})

// C (Nicolas, 9 November 2026): on a computer, the square under the mouse is told under the grid.
const detail = (name: string, lines: Array<[string, string, string, string]>, loans: DetailLine['loans'] = []) =>
  ({
    name,
    lines: lines.map(([lineId, lineName, euros, percent]) => ({ lineId, name: lineName, euros, percent, loans }) as DetailLine),
  }) as CategoryDetailView
const DETAILS: Partial<Record<GridCategory['category'], CategoryDetailView>> = {
  available: detail('Argent disponible', [['current', 'Compte courant', '2 000 €', '1 %'], ['booklet', 'Livret A', '1 000 €', '0,5 %']]),
  markets: detail('Placements en bourse', [['pea', 'PEA', '68 893 €', '31 %'], ['cto', 'CTO', '41 000 €', '19 %']]),
}
const detailOf = (category: GridCategory['category']) => DETAILS[category] ?? null

test('a square tells its line, its category and the figures the detail shows for that line', () => {
  expect(squareTold(GRID, 3, detailOf)).toEqual({
    category: 'markets',
    name: 'PEA',
    categoryName: 'Placements en bourse',
    euros: '68 893 €',
    percent: '31 %',
    note: null,
  })
  expect(squareTold(GRID, 2, detailOf)).toMatchObject({ category: 'available', name: 'Livret A', categoryName: 'Argent disponible', euros: '1 000 €' })
  // The detail's own figure: a hidden amount reads as it does there.
  const hidden = () => detail('Placements en bourse', [['pea', 'PEA', '•••', '31 %']])
  expect(squareTold(GRID, 3, hidden)?.euros).toBe('•••')
})

// The review of 9 November 2026: a house's figure is already net of its loan; the touch said nothing.
test('a line a loan finances says that the loan is taken off', () => {
  const house = () =>
    detail('Immobilier', [['pea', 'Ma maison', '221 100 €', '41 %']], [{ lineId: 'loan', sentence: 'une fois déduits 178 900 € encore dus à Caisse d’Épargne' }])
  expect(squareTold(GRID, 3, house)?.note).toBe('crédit déduit')
})

test('nothing is told for a square with no owner, or a line the detail does not know', () => {
  expect(squareTold(GRID, 100, detailOf)).toBeNull()
  expect(squareTold(GRID, 3, () => null)).toBeNull()
  expect(squareTold(GRID, 3, () => detail('Placements en bourse', []))).toBeNull()
})

test('the range of squares a line holds, for the grid to light it alone', () => {
  expect(lineRange(GRID, 'pea')).toEqual({ from: 3, to: 63 })
  expect(lineRange(GRID, 'booklet')).toEqual({ from: 2, to: 3 })
  expect(lineRange(GRID, 'tiny')).toBeNull()
})
