// The demo wealth must show everything Oseil can do, and import as the site imports a file: the demo
// reset goes through the real import, so a refusal here is a reset that cannot fill the accounts.
import { describe, expect, test } from 'vitest'
import { goalInEffect } from '@/lib/model/goals'
import { purchaseGaps } from '@/lib/model/purchase-gaps'
import { computeSituation, holdsRental } from '@/lib/model/situation'
import type { CategoryId } from '@/lib/model/types'
import { exportSheets } from '@/lib/transfer/export'
import { readImport } from '@/lib/transfer/import'
import { readWorkbook, writeWorkbook } from '@/lib/transfer/xlsx'
import { showcaseInput } from '../showcase'

const CATEGORIES: CategoryId[] = ['available', 'secured', 'markets', 'gold', 'property']

describe('the demo wealth', () => {
  test('imports as the site imports a file, with its 25 relevés', async () => {
    const book = await readWorkbook(await writeWorkbook(exportSheets(showcaseInput())))
    const read = readImport(book)
    if (!read.ok) throw new Error(`The demo wealth does not import: ${JSON.stringify(read.errors)}`)
    expect(read.summary.relevés).toHaveLength(25)
    expect(read.summary.relevés.every((r) => r.total !== null && r.total > 0)).toBe(true)
  })

  test('holds every category in its last relevé, and both pockets of Immobilier', () => {
    const { profile, snapshots } = showcaseInput()
    const situation = computeSituation(profile, snapshots[snapshots.length - 1])
    for (const category of CATEGORIES) {
      expect(situation.categories.find((c) => c.category === category)?.value ?? 0, category).toBeGreaterThan(0)
    }
    expect(holdsRental(situation)).toBe(true)
    const property = situation.categories.find((c) => c.category === 'property')!
    expect(property.pockets?.['chez-toi'].value).toBeGreaterThan(0)
    expect(property.pockets?.location.value).toBeGreaterThan(0)
  })

  test('covers two years, a line in dollars, crypto, a closed line, an opened one, and totals paid in', () => {
    const { profile, snapshots } = showcaseInput()
    expect(snapshots[0].takenOn).toBe('2024-10-31')
    expect(snapshots[snapshots.length - 1].takenOn).toBe('2026-10-31')
    expect(profile.lines.some((l) => l.currency === 'USD')).toBe(true)
    expect(profile.accounts.some((a) => a.type === 'crypto')).toBe(true)
    expect(profile.lines.some((l) => l.closedOn)).toBe(true)
    expect(snapshots.some((s) => Object.values(s.arrivals).includes('opened'))).toBe(true)
    expect(snapshots.every((s) => Object.keys(s.paidTotals ?? {}).length > 0)).toBe(true)
    expect(profile.accounts.filter((a) => a.type === 'loan').every((a) => a.financedLineId)).toBe(true)
  })

  test('has a goal with a cushion in months in effect, and gaps for « À compléter »', () => {
    const { profile, snapshots, goals } = showcaseInput()
    const last = snapshots[snapshots.length - 1]
    expect(goalInEffect(goals, last.takenOn)?.cushionMonths).toBe(6)
    expect(goals).toHaveLength(2)
    expect(purchaseGaps(profile, last).length).toBeGreaterThan(0)
  })

  test('is the same at every reset', () => {
    expect(showcaseInput()).toEqual(showcaseInput())
  })
})
