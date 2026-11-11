// The gain of a line in another currency counts the exchange
// (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md).
import { beforeAll, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import type { Line } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { PROFILES, TODAY } from './profils/profiles'

beforeAll(() => setAmountsHidden(false))

const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')

// Karim's 40 American shares bought at 180 $ when 1 € = 1,20 $, worth 230 $ now that 1 € = 1,08 $.
function karim(purchase?: Line['purchase']): Model {
  const model = PROFILES.karim()
  const latest = model.snapshots[0].value
  const first = structuredClone(latest)
  first.takenOn = '2025-10-31'
  first.fx = { USD: 1 / 1.2 }
  for (const entry of first.entries) entry.seenOn = '2025-10-31'
  model.snapshots = [{ id: 'releve-0', value: first, updatedAt: '2025-11-01T00:00:00Z' }, ...model.snapshots]
  if (purchase) model.profile!.value.lines.find((l) => l.id === 'us')!.purchase = purchase
  return model
}

const gain = (model: Model) =>
  plain(categoryDetailView(model, 'markets', TODAY)?.lines.find((l) => l.name === 'Actions américaines')?.result?.euros)

test('bought when the dollar was worth less: the gain counts the exchange, 2 519 € and not 1 852 €', () => {
  // 40 × 230 $ ÷ 1,08 = 8 518,52 €, against 40 × 180 $ ÷ 1,20 = 6 000 € paid.
  expect(gain(karim())).toBe('a gagné 2 519 € depuis l’achat')
})

test('a rate typed by the person stands for the whole cost', () => {
  // 7 200 $ ÷ 1,25 = 5 760 €.
  expect(gain(karim({ perEuro: 1.25 }))).toBe('a gagné 2 759 € depuis l’achat')
})

test('an average price said to be in euros is the cost itself', () => {
  // The broker gave 180, change included: 40 × 180 € = 7 200 €.
  expect(gain(karim({ inEuros: true }))).toBe('a gagné 1 319 € depuis l’achat')
})

test('a single snapshot gives the gain as before', () => {
  expect(plain(categoryDetailView(PROFILES.karim(), 'markets', TODAY)?.lines[0].result?.euros)).toBe('a gagné 1 852 € depuis l’achat')
})
