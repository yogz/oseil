import { afterEach, describe, expect, test } from 'vitest'
import { plain } from '@/lib/__tests__/plain'
import { setAmountsHidden } from '@/lib/format'
import { parseGoalAllocation, parseProfile, parseSettings, parseSnapshot } from '@/lib/model/documents'
import { computeSituation } from '@/lib/model/situation'
import { evolutionView } from '@/lib/screens/evolution'
import { monArgentView } from '@/lib/screens/mon-argent'
import { EXAMPLE_TODAY, examplePerson } from '../person'
import { exampleBoard, exampleDetail, exampleEvolution } from '../views'

afterEach(() => setAmountsHidden(false))

describe('the invented person', () => {
  test('passes every parser, unchanged', () => {
    const model = examplePerson()
    expect(model.profile).not.toBeNull()
    expect(parseProfile(model.profile!.value)).toEqual(model.profile!.value)
    for (const snapshot of model.snapshots) expect(parseSnapshot(snapshot.value)).toEqual(snapshot.value)
    expect(model.goals.length).toBeGreaterThan(0)
    for (const goal of model.goals) expect(parseGoalAllocation(goal.value)).toEqual(goal.value)
    expect(parseSettings(model.settings!.value)).toEqual(model.settings!.value)
    expect(model.draft).toBeNull()
    expect(model.unreadable).toEqual({ profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 })
  })

  test('owns exactly 100 000 € at its latest snapshot, split 12 / 23 / 30 / 5 / 30', () => {
    const model = examplePerson()
    const latest = model.snapshots[model.snapshots.length - 1].value
    expect(computeSituation(model.profile!.value, latest).net).toBe(10_000_000)
    const view = monArgentView(model, EXAMPLE_TODAY)
    if (view.kind !== 'board') throw new Error(`expected a board, got ${view.kind}`)
    expect(plain(view.net ?? '')).toBe('100 000 €')
    if (view.grid.kind !== 'grid') throw new Error('expected a grid')
    expect(view.grid.categories.map((c) => [c.category, c.squares])).toEqual([
      ['available', 12],
      ['secured', 23],
      ['markets', 30],
      ['gold', 5],
      ['property', 30],
    ])
  })

  // Nicolas, 10 November 2026: the evolution shows a rebalancing. The savings pile up on the
  // livret, then in July she moves them to her PEA and life insurance, and the gap to her goals
  // falls; it creeps up a little by October, so Mon argent still has gaps to show.
  test('drifts from its goals, rebalances in July, and drifts a little again', () => {
    const evolution = evolutionView(examplePerson(), EXAMPLE_TODAY)
    if (evolution.kind !== 'history') throw new Error('expected a history')
    const misplaced = evolution.goals!.rows.map((row) => row.misplaced.reduce((sum, m) => sum + m.count, 0))
    expect(misplaced).toEqual([12, 14, 2, 4])
  })

  test('the rebalancing is a move: the year still adds 25 000 €, and nothing reads as a loss', () => {
    const evolution = evolutionView(examplePerson(), EXAMPLE_TODAY)
    if (evolution.kind !== 'history') throw new Error('expected a history')
    expect(evolution.snapshots.map((s) => plain(s.net))).toEqual(['100 000 €', '94 000 €', '85 340 €', '75 000 €'])
    expect(plain(evolution.sinceFirst.euros)).toBe('+25 000 €')
    for (const row of evolution.split.rows) expect(row.loss).toBe(false)
  })

  test('follows no price: no line has a symbol', () => {
    for (const line of examplePerson().profile!.value.lines) expect(line.quoteSymbol).toBeUndefined()
  })

  test('has at least three snapshots over a year, each with its own total', () => {
    const model = examplePerson()
    const dates = model.snapshots.map((s) => s.value.takenOn)
    expect(dates.length).toBeGreaterThanOrEqual(3)
    expect([...dates].sort()).toEqual(dates)
    const days = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000
    expect(days).toBeGreaterThanOrEqual(330)
    const totals = model.snapshots.map((s) => computeSituation(model.profile!.value, s.value).net)
    expect(new Set(totals).size).toBe(totals.length)
    expect(dates[dates.length - 1] <= EXAMPLE_TODAY).toBe(true)
  })

  test('has finished its first launch, shows its amounts in euros, and is visibly invented', () => {
    const model = examplePerson()
    const profile = model.profile!.value
    expect(profile.firstLaunch?.complete).toBe(true)
    expect(model.settings!.value).toMatchObject({ display: 'euros', hideAmounts: false })
    const names = [...profile.establishments, ...profile.accounts, ...profile.lines].map((x) => x.name)
    for (const name of ['Banque Exemple', 'Livret d’exemple', 'Appartement d’exemple', 'Fonds monde (exemple)']) {
      expect(names).toContain(name)
    }
  })

  test('ids are plain words, as the example’s addresses require', () => {
    const model = examplePerson()
    const profile = model.profile!.value
    const ids = [
      ...profile.establishments.map((x) => x.id),
      ...profile.accounts.map((x) => x.id),
      ...profile.lines.map((x) => x.id),
      ...model.snapshots.map((x) => x.id),
    ]
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('gives a fresh copy each time: a screen cannot change the next one’s person', () => {
    const first = examplePerson()
    first.profile!.value.lines.length = 0
    expect(examplePerson().profile!.value.lines.length).toBeGreaterThan(0)
  })
})

describe('the example’s views', () => {
  test('a board, a detail per category, and a history', () => {
    expect(exampleBoard()).not.toBeNull()
    for (const category of ['available', 'secured', 'markets', 'gold', 'property'] as const) {
      expect(exampleDetail(category)).not.toBeNull()
    }
    expect(exampleEvolution().kind).toBe('history')
  })

  test('never hidden, even after a real account hid its amounts in this tab', () => {
    setAmountsHidden(true)
    expect(plain(exampleBoard().net ?? '')).toBe('100 000 €')
    setAmountsHidden(true)
    expect(plain(exampleDetail('available')!.euros)).toBe('12 000 €')
    setAmountsHidden(true)
    const evolution = exampleEvolution()
    if (evolution.kind !== 'history') throw new Error('expected a history')
    expect(evolution.snapshots.some((s) => plain(s.net) === '100 000 €')).toBe(true)
  })
})
