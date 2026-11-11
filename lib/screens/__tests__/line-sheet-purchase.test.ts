// The rate of a line's purchases on its fiche (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md).
import { beforeAll, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { setPurchase } from '@/lib/correct/profile-changes'
import { setAmountsHidden } from '@/lib/format'
import type { Line } from '@/lib/model/types'
import { lineSheetView } from '@/lib/screens/line-sheet'
import { PURCHASE_COMPUTED, PURCHASE_EUROS, PURCHASE_TYPED } from '@/lib/screens/line-words'
import { PROFILES, TODAY } from './profils/profiles'

beforeAll(() => setAmountsHidden(false))

const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')

function karim(purchase?: Line['purchase']): Model {
  const model = PROFILES.karim()
  if (purchase) model.profile!.value.lines.find((l) => l.id === 'us')!.purchase = purchase
  return model
}
const purchaseRow = (model: Model, lineId = 'us') => lineSheetView(model, lineId, TODAY, null)?.rows.find((r) => r.kind === 'purchase')

test('a line in dollars with a purchase price shows the rate of its purchases, and where it comes from', () => {
  const row = purchaseRow(karim())
  expect(row && row.kind === 'purchase' ? row.label : null).toBe('Le dollar à l’achat')
  expect(row && row.kind === 'purchase' ? [plain(row.value), row.note, row.source] : null).toEqual(['1 € = 1,08 $US', PURCHASE_COMPUTED, 'computed'])
})

test('a typed rate, or an average price in euros, says so', () => {
  const typed = purchaseRow(karim({ perEuro: 1.2 }))
  expect(typed && typed.kind === 'purchase' ? [plain(typed.value), typed.note] : null).toEqual(['1 € = 1,20 $US', PURCHASE_TYPED])
  const euros = purchaseRow(karim({ inEuros: true }))
  expect(euros && euros.kind === 'purchase' ? [euros.value, euros.note] : null).toEqual(['en euros', PURCHASE_EUROS])
})

test('no such row for a line in euros, or without a purchase price', () => {
  expect(purchaseRow(karim(), 'btc')).toBeUndefined()
  const model = karim()
  const entry = model.snapshots[0].value.entries.find((e) => e.lineId === 'us')!
  if (entry.kind === 'units') entry.averagePrice = null
  expect(purchaseRow(model)).toBeUndefined()
})

test('setPurchase writes a typed rate or euros on the line, and clears it back to the computed one', () => {
  const profile = PROFILES.karim().profile!.value
  const set = setPurchase(profile, 'us', { perEuro: 1.2 })
  expect(set.lines.find((l) => l.id === 'us')!.purchase).toEqual({ perEuro: 1.2 })
  const cleared = setPurchase(set, 'us', null)
  expect(cleared.lines.find((l) => l.id === 'us')).not.toHaveProperty('purchase')
  expect(() => setPurchase(profile, 'btc', { perEuro: 1.2 })).toThrow()
})
