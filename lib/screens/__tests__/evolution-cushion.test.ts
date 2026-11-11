// Repères and Évolution with the available money aimed at in months
// (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
import { beforeAll, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import type { GoalAllocation } from '@/lib/model/types'
import { evolutionView } from '@/lib/screens/evolution'
import { EVOLUTION_BUDGET_NOTE } from '@/lib/screens/evolution-words'
import { reperesView } from '@/lib/screens/reperes'
import { PROFILES, TODAY } from './profils/profiles'

beforeAll(() => setAmountsHidden(false))

const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')

function inMonths(model: Model, validFrom: string): Model {
  const goal: GoalAllocation = {
    schema: 1,
    validFrom,
    shares: { available: 0, secured: 17, markets: 72, gold: 11, rental: 0 },
    cushionMonths: 4,
  }
  model.goals = [{ id: 'objectifs', value: goal, updatedAt: '2026-11-01T00:00:00Z' }]
  return model
}

test('Repères says the goal of the cushion beside what it covers', () => {
  const view = reperesView(inMonths(PROFILES.lea(), '2026-10-01'), TODAY)
  if (view.kind !== 'ready' || !('months' in view.cushion)) throw new Error('no cushion')
  expect(plain(view.cushion.sentence)).toBe(
    'Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ 7 mois de dépenses, pour un objectif de 4.',
  )
})

test('Repères with a goal in percents says the cushion as before', () => {
  const view = reperesView(PROFILES.lea(), TODAY)
  if (view.kind !== 'ready' || !('months' in view.cushion)) throw new Error('no cushion')
  expect(plain(view.cushion.sentence)).toBe('Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ 7 mois de dépenses.')
})

// Thomas, 4 months of 2 200 € = 8 800 €, over 27 500, 34 000, 25 800 then 30 800 € outside the home.
test('Évolution aims the available money, snapshot by snapshot, at the cushion in months', () => {
  const view = evolutionView(inMonths(PROFILES.thomas(), '2025-11-30'), TODAY)
  if (view.kind !== 'history' || !view.goals) throw new Error('no goals')
  const available = view.goals.traces.find((t) => t.category === 'available')!
  const held = [10_000 + 2_500, 12_000 + 2_800, 7_000 + 2_600, 7_500 + 3_000]
  const outside = [27_500, 34_000, 25_800, 30_800]
  const aimed = outside.map((o) => (8_800 / o) * 100)
  available.gaps.forEach((gap, i) => expect(gap).toBeCloseTo((held[i] / outside[i]) * 100 - aimed[i], 6))
  expect(available.target).toBeCloseTo(aimed[3], 6)
  // The others: their share of what the cushion leaves, that day.
  const markets = view.goals.traces.find((t) => t.category === 'markets')!
  expect(markets.target).toBeCloseTo(72 * (1 - aimed[3] / 100), 6)
  expect(view.goals.note).toBe(EVOLUTION_BUDGET_NOTE.expenses)
})

test('Évolution with a goal in percents has no note', () => {
  const view = evolutionView(PROFILES.thomas(), TODAY)
  if (view.kind !== 'history' || !view.goals) throw new Error('no goals')
  expect(view.goals.note).toBeNull()
})
