// The cost in euros of a line in another currency, from its snapshots
// (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md). The figures are the reviewer's.
import { expect, test } from 'vitest'
import type { Line, Snapshot } from '@/lib/model/types'
import { purchaseCost } from '../purchase-cost'

const line: Line = { id: 'us', accountId: 'cto', name: 'Actions', kind: 'units', currency: 'USD' }

// One snapshot: `units` at an average price of `average` dollars, the day when 1 € = `perEuro` $.
const at = (takenOn: string, units: number, average: number | null, perEuro: number): Snapshot => ({
  schema: 1,
  takenOn,
  fx: { USD: 1 / perEuro },
  entries: [{ lineId: 'us', kind: 'units', units, unitPrice: 230, averagePrice: average, seenOn: takenOn }],
  contributions: {},
  arrivals: {},
})

const euros = (snapshots: Snapshot[], purchase?: Line['purchase']) => {
  const found = purchaseCost({ ...line, ...(purchase ? { purchase } : {}) }, snapshots)
  return found ? Math.round(found.cost) / 100 : null
}

test('the first purchase is converted at the rate of its snapshot: 10 × 180 $ at 1,20 is 1 500 €', () => {
  expect(euros([at('2025-01-31', 10, 180, 1.2)])).toBe(1_500)
  expect(purchaseCost(line, [at('2025-01-31', 10, 180, 1.2)])).toMatchObject({ perEuro: 1.2, source: 'computed' })
})

test('a purchase later is converted at its own rate: 10 more at 230 $ when 1 € = 1,08 $ make 3 629,63 €', () => {
  expect(euros([at('2025-01-31', 10, 180, 1.2), at('2025-06-30', 20, 205, 1.08)])).toBe(3_629.63)
})

test('a sale lowers the cost by the share of the parts sold, the average rate unchanged', () => {
  const sold = [at('2025-01-31', 10, 180, 1.2), at('2025-06-30', 20, 205, 1.08), at('2025-09-30', 15, 205, 1.1)]
  expect(euros(sold)).toBe(2_722.22)
  const before = purchaseCost(line, sold.slice(0, 2))!
  const after = purchaseCost(line, sold)!
  expect(after.perEuro).toBeCloseTo(before.perEuro!, 9)
})

test('a split (twice the parts, half the price) changes nothing', () => {
  expect(euros([at('2025-01-31', 10, 180, 1.2), at('2025-06-30', 20, 90, 1.08)])).toBe(1_500)
})

test('a corrected average price follows at the average rate of the line, not today’s', () => {
  // 10 × 190 $ instead of 180 $: the cost in dollars goes up by 100 $, at 1,20.
  expect(euros([at('2025-01-31', 10, 180, 1.2), at('2025-06-30', 10, 190, 1.08)])).toBeCloseTo(1_583.33, 2)
})

test('a sale and a correction in the same snapshot: the sale first, then the correction', () => {
  // 10 → 5 parts (750 € left, 900 $), then 5 × 200 $ = 1 000 $: +100 $ at 1,20.
  expect(euros([at('2025-01-31', 10, 180, 1.2), at('2025-06-30', 5, 200, 1.08)])).toBeCloseTo(833.33, 2)
})

test('a rounding of fractional parts is no purchase', () => {
  expect(euros([at('2025-01-31', 0.3, 1_000, 1.2), at('2025-06-30', 0.1 + 0.2, 1_000, 1.08)])).toBe(250)
})

test('a rate typed by the person stands for the whole cost', () => {
  expect(euros([at('2025-01-31', 10, 180, 1.08)], { perEuro: 1.2 })).toBe(1_500)
  expect(purchaseCost({ ...line, purchase: { perEuro: 1.2 } }, [at('2025-01-31', 10, 180, 1.08)])).toMatchObject({ source: 'typed' })
})

test('an average price already in euros is the cost itself, with no rate', () => {
  const found = purchaseCost({ ...line, purchase: { inEuros: true } }, [at('2025-01-31', 10, 150, 1.08)])!
  expect(found.cost).toBe(150_000)
  expect(found.source).toBe('euros')
})

test('no average price, a line in euros, or no snapshot: no cost to give', () => {
  expect(purchaseCost(line, [at('2025-01-31', 10, null, 1.2)])).toBeNull()
  expect(purchaseCost({ ...line, currency: 'EUR' }, [at('2025-01-31', 10, 180, 1.2)])).toBeNull()
  expect(purchaseCost(line, [])).toBeNull()
})

test('a snapshot without the rate of the line gives no cost, never an invented one', () => {
  const missing = { ...at('2025-01-31', 10, 180, 1.2), fx: {} }
  expect(purchaseCost(line, [missing])).toBeNull()
})
