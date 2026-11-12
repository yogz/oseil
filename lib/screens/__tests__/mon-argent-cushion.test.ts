// Mon argent with the available money aimed at in months
// (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md, « Les mots »).
import { beforeAll, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { setAmountsHidden } from '@/lib/format'
import type { GoalAllocation } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'
import { CUSHION_BEYOND_ALL, cushionHeader, GOALS_NEED_BUDGET } from '@/lib/screens/words'
import { PROFILES, TODAY } from './profils/profiles'

beforeAll(() => setAmountsHidden(false))

const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')

const IN_MONTHS: GoalAllocation = {
  schema: 1,
  validFrom: '2026-01-01',
  shares: { available: 0, secured: 17, markets: 72, gold: 11, rental: 0 },
  cushionMonths: 4,
}

// Léa (budget 1 600 €), her goal in months, her livret set to `livret` euros.
function lea(livret: number, change: (model: Model) => void = () => {}): Board {
  const model = PROFILES.lea()
  model.goals = [{ id: 'objectifs', value: IN_MONTHS, updatedAt: '2026-11-01T00:00:00Z' }]
  const entry = model.snapshots[0].value.entries.find((e) => e.lineId === 'livret-ligne')!
  if (entry.kind === 'amount') entry.amount = livret * 100
  change(model)
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error('no board')
  return view
}

const row = (view: Board, category: string) => view.categories.find((c) => c.category === category)

test('the available row tells its goal in months, and in euros', () => {
  const goal = row(lea(9_500), 'available')?.goal
  expect(goal?.cushion).toEqual({ months: 4, euros: expect.stringMatching(/^6\s400\s€$/), basis: 'expenses' })
})

test('its words are judged in months: beyond, complete, not complete', () => {
  // 1 800 + 9 500 = 11 300 €, 7 months; 1 800 + 4 600 = 6 400 €, 4 months; 1 800 + 3 000 = 4 800 €, 3 months.
  expect(row(lea(9_500), 'available')?.goal?.words).toBe('au-delà de ton coussin')
  expect(row(lea(4_600), 'available')?.goal?.words).toBe('ton coussin est complet')
  expect(row(lea(3_000), 'available')?.goal?.words).toBe('ton coussin n’est pas complet')
})

test('the four other rows keep their words', () => {
  expect(row(lea(9_500), 'markets')?.goal?.words).toBe('en dessous de ton objectif')
  expect(row(lea(9_500), 'markets')?.goal?.cushion).toBeUndefined()
})

test('a goal in months with the budget erased: no gap anywhere, and it is said', () => {
  const view = lea(9_500, (model) => {
    model.settings!.value.budget = null
  })
  expect(view.categories.every((c) => c.goal === null)).toBe(true)
  expect(view.goals).toEqual({
    headline: GOALS_NEED_BUDGET,
    detail: null,
    scale: 0,
    simulation: null,
    link: { href: '/premier-lancement/depenses?depuis=reglages', label: 'Renseigner mes dépenses' },
  })
})

// Planche 2, option B (Nicolas, 12 November 2026): one unit, the months, as in Repères; no square
// count that repeats the big figure, no euro amount, and « au-delà » no longer hides how far beyond.
function leaDetail(livret: number) {
  const model = PROFILES.lea()
  model.goals = [{ id: 'objectifs', value: IN_MONTHS, updatedAt: '2026-11-01T00:00:00Z' }]
  const entry = model.snapshots[0].value.entries.find((e) => e.lineId === 'livret-ligne')!
  if (entry.kind === 'amount') entry.amount = livret * 100
  return categoryDetailView(model, 'available', TODAY)
}

test('the detail of the available money says its months, then its goal in months', () => {
  expect(plain(leaDetail(9_500)?.header)).toBe('Environ 7 mois de côté, pour un objectif de 4.')
  expect(plain(leaDetail(4_600)?.header)).toBe('Environ 4 mois de côté, pour un objectif de 4.')
  expect(plain(leaDetail(3_000)?.header)).toBe('Environ 3 mois de côté, pour un objectif de 4.')
})

test('the header’s words: under half a month, half months, a goal of one and a half', () => {
  expect(plain(cushionHeader(0, 4))).toBe('Moins d’un demi-mois de côté, pour un objectif de 4.')
  expect(plain(cushionHeader(2.5, 1.5))).toBe('Environ 2 mois et demi de côté, pour un objectif de 1,5.')
})

test('a goal in percents is told as before', () => {
  const model = PROFILES.lea()
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error('no board')
  expect(row(view, 'available')?.goal).toEqual({ actual: 73, target: 10, words: 'au-dessus de ton objectif' })
})

// The cushion aimed at is more than everything outside the home: the others get nothing, and it is said.
test('a cushion beyond everything outside the home says so in the goals headline', () => {
  const model = PROFILES.lucie()
  model.goals = [{ id: 'objectifs', value: { ...IN_MONTHS, cushionMonths: 24 }, updatedAt: '2026-11-01T00:00:00Z' }]
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error('no board')
  expect(view.goals?.detail).toBe(CUSHION_BEYOND_ALL)
})

test('a cushion within reach keeps the usual detail', () => {
  expect(lea(9_500).goals?.detail).not.toBe(CUSHION_BEYOND_ALL)
})
