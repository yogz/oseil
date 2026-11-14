// « Ta grille : sans chez toi » (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md): a snapshot
// without the lines of the pocket Chez toi and the loans that finance them; the rental, and any loan that
// finances something else, stay. Taken off the snapshot itself, before any computation, so that every
// screen that reads snapshots (the split of Évolution too) follows (review of 12 November 2026).
import { expect, test } from 'vitest'
import { parseSettings } from '@/lib/model/documents'
import { computeSituation, snapshotWithoutHome } from '@/lib/model/situation'
import { buildGrid } from '@/lib/model/squares'
import { account, amountEntry, line, profileOf, snapshotOf } from './fixtures'

// 280 000 € of home under an 80 000 € loan (200 000 € net), a 100 000 € rental, 50 000 € of cash, a
// 10 000 € consumer loan that finances nothing (it lowers the cash).
const profile = profileOf(
  [
    account('c', 'current'),
    account('h', 'home'),
    account('hl', 'loan', { financedLineId: 'home' }),
    account('r', 'home', { residence: 'rental' }),
    account('car', 'loan'),
  ],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('rent', 'r'), line('car-loan', 'car')],
)
const snapshot = snapshotOf([
  amountEntry('cash', 50_000),
  amountEntry('home', 280_000),
  amountEntry('home-loan', 80_000),
  amountEntry('rent', 100_000),
  amountEntry('car-loan', 10_000),
])
const all = computeSituation(profile, snapshot)

test('the home and its loan leave; the rental and the other loan stay', () => {
  const out = computeSituation(profile, snapshotWithoutHome(profile, snapshot))
  expect(out.net).toBe(all.net - 200_000 * 100)
  expect(out.owned).toBe(all.owned - 280_000 * 100)
  expect(out.owed).toBe(all.owed - 80_000 * 100)
  expect(out.holdings.map((h) => h.lineId)).toEqual(['cash', 'rent'])
  const property = out.categories.find((c) => c.category === 'property')!
  expect(property.value).toBe(100_000 * 100)
  expect(property.pockets!['chez-toi']).toEqual({ value: 0, lines: [] })
  expect(out.categories.find((c) => c.category === 'available')!.value).toBe(40_000 * 100)
})

test('the grid is recalculated on what is left: 100 squares without the home', () => {
  const grid = buildGrid(computeSituation(profile, snapshotWithoutHome(profile, snapshot)))
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  expect(grid.categories.reduce((s, c) => s + c.squares, 0)).toBe(100)
  expect(grid.squareValue).toBe(1_400 * 100)
})

test('a snapshot with nothing but the home is left with nothing, never given back whole', () => {
  const onlyHome = snapshotOf([amountEntry('home', 280_000), amountEntry('home-loan', 80_000)])
  expect(snapshotWithoutHome(profile, onlyHome).entries).toEqual([])
})

test('a loan whose home is not in the snapshot stays: it lowers the cash, as in the whole computation', () => {
  const sold = snapshotOf([amountEntry('cash', 50_000), amountEntry('home-loan', 80_000)])
  expect(snapshotWithoutHome(profile, sold).entries.map((e) => e.lineId)).toEqual(['cash', 'home-loan'])
})

test('the setting is read back when true, and refused when it is anything else', () => {
  const base = { schema: 1, budget: null, display: 'euros', hideAmounts: false }
  expect(parseSettings({ ...base, withoutHome: true })?.withoutHome).toBe(true)
  expect(parseSettings(base)).not.toHaveProperty('withoutHome')
  expect(parseSettings({ ...base, withoutHome: 'oui' })).toBeNull()
})

test('the totals paid in of the accounts that left go with them, the others stay', () => {
  const withTotals = { ...snapshot, contributions: { h: 100, c: 200 }, paidTotals: { h: 300, c: 400 } }
  const out = snapshotWithoutHome(profile, withTotals)
  expect(out.contributions).toEqual({ c: 200 })
  expect(out.paidTotals).toEqual({ c: 400 })
  expect(snapshotWithoutHome(profile, snapshot)).not.toHaveProperty('paidTotals')
})
