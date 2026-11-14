import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { GOAL_PRESETS } from '@/lib/catalog'
import { splitChange } from '@/lib/model/change'
import { parseGoalAllocation } from '@/lib/model/documents'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import { evolutionView, traceWord, type EvolutionView } from '@/lib/screens/evolution'
import { COMPARED_TO_FIRST_GOALS, EVOLUTION_UNREADABLE, goalsLead, unknownPaymentsSentence } from '@/lib/screens/evolution-words'

const TODAY = '2026-11-08'
const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? null
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const goal = (validFrom: string): GoalAllocation => ({ schema: 1, validFrom, shares: GOAL_PRESETS.balanced.shares })

const profile: Profile = profileOf(
  [account('a-liv', 'livret-a'), account('a-per', 'per', { name: 'PER' }), account('a-usd', 'securities')],
  [
    line('liv', 'a-liv', { category: 'available' }),
    line('per-line', 'a-per'),
    line('usd', 'a-usd', { currency: 'USD', category: 'markets' }),
  ],
)

const at = (takenOn: string, snapshot: Snapshot): Snapshot => ({ ...snapshot, takenOn })
const older = at(
  '2025-06-30',
  snapshotOf([amountEntry('liv', 10_000), amountEntry('per-line', 20_000), amountEntry('usd', 10_000)], { USD: 0.85 }),
)
const newer = at(
  '2026-09-30',
  snapshotOf([amountEntry('liv', 12_000), amountEntry('per-line', 22_000), amountEntry('usd', 10_000)], { USD: 0.86 }),
)

function modelOf(snapshots: Snapshot[], goals: GoalAllocation[] = [goal('2026-01-01')], p: Profile | null = profile): Model {
  return {
    profile: p === null ? null : loaded(p),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: goals.map((g, i) => loaded(g, `g${i}`)),
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

function history(view: EvolutionView) {
  if (view.kind !== 'history') throw new Error(`expected a history, got ${view.kind}`)
  return view
}

describe('the number of snapshots', () => {
  test('has nothing to say without a snapshot', () => {
    expect(evolutionView(modelOf([]), TODAY).kind).toBe('none')
    expect(evolutionView(modelOf([older], [], null), TODAY).kind).toBe('none')
  })

  test('has no curve with one snapshot', () => {
    const view = evolutionView(modelOf([older]), TODAY)
    expect(view.kind).toBe('single')
    if (view.kind === 'single') {
      expect(view.point.date).toBe('2025-06-30')
      expect(plain(view.dateLabel)).toBe('30 juin 2025')
    }
  })
})

describe('the date of the figures', () => {
  test('a history says of when its figures are: the latest snapshot, like Mon argent', () => {
    expect(history(evolutionView(modelOf([older, newer]), TODAY)).dateLabel).toBe('Chiffres du 30 septembre')
    expect(history(evolutionView(modelOf([newer, older]), TODAY)).dateLabel).toBe('Chiffres du 30 septembre')
    // From another year, the year is said.
    expect(history(evolutionView(modelOf([older, at('2025-09-30', newer)]), TODAY)).dateLabel).toBe(
      'Chiffres du 30 septembre 2025',
    )
    expect(history(evolutionView(modelOf([older, at(TODAY, newer)]), TODAY)).dateLabel).toBe('Chiffres du 8 novembre')
  })
})

describe('a vault that cannot be read in full', () => {
  const withUnreadable = (model: Model, part: 'profile' | 'snapshots' | 'goals'): Model => ({
    ...model,
    unreadable: { ...model.unreadable, [part]: 1 },
  })

  test('says it, with no curve, when the profile cannot be read', () => {
    const view = evolutionView(withUnreadable(modelOf([older, newer], [goal('2026-01-01')], null), 'profile'), TODAY)
    expect(view.kind).toBe('unreadable')
    expect(EVOLUTION_UNREADABLE).toBe('Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.')
  })

  test('says it, with no curve, when a snapshot cannot be decrypted', () => {
    expect(evolutionView(withUnreadable(modelOf([older, newer]), 'snapshots'), TODAY).kind).toBe('unreadable')
  })

  test('does not say there is no snapshot when every snapshot fails to add up', () => {
    const broken = at('2026-09-30', snapshotOf([amountEntry('ghost', 1)]))
    const view = evolutionView(modelOf([broken]), TODAY)
    expect(view.kind).toBe('unreadable')
    if (view.kind === 'unreadable') expect(plain(view.notes[0])).toContain('30 septembre 2026')
  })

  test('keeps the notes with a single snapshot', () => {
    const noRate = at('2026-09-30', snapshotOf([amountEntry('liv', 12_000), amountEntry('usd', 10_000)], {}))
    const view = evolutionView(modelOf([noRate]), TODAY)
    expect(view.kind).toBe('single')
    if (view.kind === 'single') expect(plain(view.notes[0])).toContain('usd')
  })

  test('says a snapshot left off the curve when only one is left', () => {
    const broken = at('2026-09-30', snapshotOf([amountEntry('ghost', 1)]))
    const view = evolutionView(modelOf([older, broken]), TODAY)
    expect(view.kind).toBe('single')
    if (view.kind === 'single') expect(view.notes).toHaveLength(1)
  })

  test('hides the goals when one of them cannot be read', () => {
    expect(history(evolutionView(withUnreadable(modelOf([older, newer]), 'goals'), TODAY)).goals).toBeNull()
  })
})

describe('the curve', () => {
  test('gives one point per snapshot, oldest first, each at its own rates', () => {
    // 10 000 $ at 0.85, then at 0.86: never at today's rate.
    const view = history(evolutionView(modelOf([newer, older]), TODAY))
    expect(view.points.map((p) => p.date)).toEqual(['2025-06-30', '2026-09-30'])
    expect(view.points.map((p) => p.net)).toEqual([3_850_000, 4_260_000])
    expect(view.points.map((p) => p.squareValue)).toEqual([38_500, 42_600])
  })

  test('says the first and the latest square values, and the gain since the first snapshot', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    expect(plain(view.sinceFirst.euros)).toBe('+4 100 €')
    expect(plain(view.sinceFirst.squareThen)).toBe('385 €')
    expect(plain(view.sinceFirst.squareNow)).toBe('426 €')
    expect(view.sinceFirst.firstLabel).toBe('juin 2025')
  })

  test('rounds the next cap up to a round square value', () => {
    // 426 € a square: the next step of 100 € is 500 €.
    expect(history(evolutionView(modelOf([older, newer]), TODAY)).nextCap).toBe(50_000)
    // 1 720 € a square (above 1 000 €): the next step of 500 € is 2 000 €.
    const rich = at('2026-09-30', snapshotOf([amountEntry('liv', 172_000)]))
    expect(history(evolutionView(modelOf([older, rich]), TODAY)).nextCap).toBe(200_000)
    // Exactly on a step: the next one above.
    const exact = at('2026-09-30', snapshotOf([amountEntry('liv', 200_000)]))
    expect(history(evolutionView(modelOf([older, exact]), TODAY)).nextCap).toBe(250_000)
  })

  test('makes one point of the snapshots of the same day: the latest of that day', () => {
    const sameDay = at('2026-09-30', snapshotOf([amountEntry('liv', 13_000), amountEntry('per-line', 22_000), amountEntry('usd', 10_000)], { USD: 0.86 }))
    const view = history(evolutionView(modelOf([older, newer, sameDay]), TODAY))
    expect(view.curve).toBe('chart')
    expect(view.points.map((p) => p.date)).toEqual(['2025-06-30', '2026-09-30'])
    expect(view.points[1]).toMatchObject({ snapshotId: 's2', net: 4_360_000 })
    // The list still shows every snapshot, each with its own id.
    expect(view.snapshots.map((s) => s.id)).toEqual(['s2', 's1', 's0'])
  })

  test('draws no curve when every snapshot is of the same day', () => {
    const view = history(evolutionView(modelOf([newer, newer]), TODAY))
    expect(view.curve).toBe('one-day')
    expect(view.snapshots).toHaveLength(2)
  })

  test('draws no curve while what is yours is never positive', () => {
    const p: Profile = profileOf(
      [account('a-liv', 'livret-a'), account('a-loan', 'loan')],
      [line('liv', 'a-liv', { category: 'available' }), line('loan', 'a-loan')],
    )
    const owing = (takenOn: string, owed: number) => at(takenOn, snapshotOf([amountEntry('liv', 1_000), amountEntry('loan', owed)]))
    expect(history(evolutionView(modelOf([owing('2025-06-30', 5_000), owing('2026-09-30', 1_000)], [], p), TODAY)).curve).toBe('not-positive')
    expect(history(evolutionView(modelOf([owing('2025-06-30', 5_000), owing('2026-09-30', 500)], [], p), TODAY)).curve).toBe('chart')
  })

  test('draws no curve while the gap is too small to be seen on a scale that starts at 0 (never stretched)', () => {
    // From 38 500 €, with the next cap at 500 € a square the scale reaches 50 000 €.
    const barely = at('2026-09-30', snapshotOf([amountEntry('liv', 12_000), amountEntry('per-line', 20_000), amountEntry('usd', 10_000)], { USD: 0.85 }))
    const view = history(evolutionView(modelOf([older, barely]), TODAY))
    expect(view.curve).toBe('chart') // 2 000 € more: 4 % of the scale, seen
    const flat = at('2026-09-30', snapshotOf([amountEntry('liv', 10_010), amountEntry('per-line', 20_000), amountEntry('usd', 10_000)], { USD: 0.85 }))
    const tiny = history(evolutionView(modelOf([older, flat]), TODAY))
    expect(tiny.curve).toBe('flat')
    // The figures are still given, so the screen can say them in words.
    expect(plain(tiny.sinceFirst.euros)).toBe('+10 €')
    expect(tiny.points).toHaveLength(2)
    expect(tiny.snapshots).toHaveLength(2)
  })

  test('says the gain since the first snapshot in percent too, of the first one, when it was positive', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    // 4 100 € on 38 500 €.
    expect(plain(view.sinceFirst.percent)).toBe('+10,6 %')
  })

  test('names the month of the first snapshot, with its year only when it is not this year', () => {
    expect(history(evolutionView(modelOf([older, newer]), TODAY)).sinceFirst.sinceLabel).toBe('juin 2025')
    expect(history(evolutionView(modelOf([at('2026-03-31', older), newer]), TODAY)).sinceFirst.sinceLabel).toBe('mars')
  })

  test('keys the goal rows by snapshot', () => {
    const view = history(evolutionView(modelOf([older, newer, newer]), TODAY))
    expect(view.goals!.rows.map((r) => r.snapshotId)).toEqual(['s0', 's1', 's2'])
  })

  test('keeps only what converts, and says so, when a snapshot lacks a rate', () => {
    const noRate = at('2026-09-30', snapshotOf([amountEntry('liv', 12_000), amountEntry('usd', 10_000)], {}))
    const view = history(evolutionView(modelOf([older, noRate]), TODAY))
    expect(view.points[1].net).toBe(1_200_000)
    expect(plain(view.notes[0])).toContain('usd')
    expect(plain(view.notes[0])).toContain('30 septembre 2026')
  })
})

describe('the goals', () => {
  test('compares snapshots older than every goal to the first goal, and says so', () => {
    const view = history(evolutionView(modelOf([older, newer], [goal('2026-01-01')]), TODAY))
    expect(view.goals?.comparedToFirst).toBe(true)
    expect(view.goals?.rows.map((r) => r.date)).toEqual(['2025-06-30', '2026-09-30'])
    expect(COMPARED_TO_FIRST_GOALS).toBe('comparé à tes premiers objectifs')
  })

  test('does not say it when every snapshot has a goal in force', () => {
    const view = history(evolutionView(modelOf([older, newer], [goal('2025-01-01')]), TODAY))
    expect(view.goals?.comparedToFirst).toBe(false)
  })

  test('has no goals section without a goal', () => {
    expect(history(evolutionView(modelOf([older, newer], []), TODAY)).goals).toBeNull()
  })

  test('counts the squares held beyond the target, by category', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    const rows = view.goals!.rows
    for (const row of rows) {
      expect(row.misplaced.every((m) => m.count > 0)).toBe(true)
      expect(row.misplaced.map((m) => m.category)).not.toContain('property')
    }
    // 100 squares, almost all in the livret / PER / dollars: some squares are beyond the goal.
    expect(rows[1].misplaced.reduce((s, m) => s + m.count, 0)).toBeGreaterThan(0)
  })

  test('the goals lead speaks of the gap, never of « tu »', () => {
    expect(goalsLead(10, 4).startsWith('L’écart se réduit. Au premier relevé, 10 carrés n’étaient pas à leur place. Aujourd’hui, 4.')).toBe(true)
    expect(goalsLead(4, 10).startsWith('L’écart grandit. ')).toBe(true)
    expect(goalsLead(5, 5)).toBe('Au premier relevé comme aujourd’hui, 5 carrés ne sont pas à leur place.')
  })

  test('words each category trace', () => {
    expect(traceWord([8, 4, 0])).toBe('atteint')
    expect(traceWord([8, 4, 2])).toBe('presque atteint')
    expect(traceWord([10, 8, 4])).toBe('se rapproche')
    expect(traceWord([2, 4, 6])).toBe('s’éloigne')
    expect(traceWord([5, 5])).toBe('à peu près stable')
    expect(traceWord([5, 3, 5])).toBe('à peu près stable')
  })

  test('does not see progress in a category held at 0 while the home grows', () => {
    const withHome: Profile = profileOf(
      [account('a-liv', 'livret-a'), account('a-home', 'home')],
      [line('liv', 'a-liv', { category: 'available' }), line('home', 'a-home')],
    )
    const goldGoal: GoalAllocation = { schema: 1, validFrom: '2025-01-01', shares: { available: 30, secured: 30, markets: 20, gold: 20, rental: 0 } }
    const small = at('2025-06-30', snapshotOf([amountEntry('liv', 50_000), amountEntry('home', 100_000)]))
    const big = at('2026-09-30', snapshotOf([amountEntry('liv', 50_000), amountEntry('home', 300_000)]))
    const view = history(evolutionView(modelOf([small, big], [goldGoal], withHome), TODAY))
    const gold = view.goals!.traces.find((t) => t.category === 'gold')!
    expect(gold.word).toBe('à peu près stable')
    // Each dot sits against its own snapshot's target: 20 points below it, both times.
    expect(gold.gaps).toEqual([-20, -20])
    expect(gold.target).toBe(20)
  })

  test('draws one trace per goal category, with the target of the latest snapshot', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    const traces = view.goals!.traces
    expect(traces.map((t) => t.category)).toEqual(['available', 'secured', 'markets', 'gold'])
    for (const t of traces) {
      expect(t.gaps).toHaveLength(2)
      expect(typeof t.word).toBe('string')
    }
  })

  test('reads a goal saved with four keys, and adds a rental trace only once a rental share is aimed at', () => {
    const fourKeys = parseGoalAllocation({ schema: 1, validFrom: '2025-01-01', shares: { available: 30, secured: 30, markets: 20, gold: 20 } })!
    const four = history(evolutionView(modelOf([older, newer], [fourKeys]), TODAY))
    expect(four.goals!.traces.map((t) => t.category)).toEqual(['available', 'secured', 'markets', 'gold'])
    const withRental: GoalAllocation = { schema: 1, validFrom: '2025-01-01', shares: { available: 30, secured: 30, markets: 20, gold: 10, rental: 10 } }
    const five = history(evolutionView(modelOf([older, newer], [withRental]), TODAY))
    expect(five.goals!.traces.map((t) => t.category)).toEqual(['available', 'secured', 'markets', 'gold', 'rental'])
  })
})

describe('where it comes from', () => {
  test('says unknown payments on a PER, not when a 0 payment is given', () => {
    const unknown = history(evolutionView(modelOf([older, newer]), TODAY))
    expect(unknown.split.unknownPayments).toEqual([unknownPaymentsSentence('PER')])

    const known = { ...newer, contributions: { 'a-per': 0 } }
    expect(history(evolutionView(modelOf([older, known]), TODAY)).split.unknownPayments).toEqual([])
  })

  test('does not say it for an account whose value did not move', () => {
    const still = at('2026-09-30', snapshotOf([amountEntry('liv', 12_000), amountEntry('per-line', 20_000), amountEntry('usd', 10_000)], { USD: 0.86 }))
    expect(history(evolutionView(modelOf([older, still]), TODAY)).split.unknownPayments).toEqual([])
  })

  test('words it as a change, which may be a drop', () => {
    expect(unknownPaymentsSentence('PER')).toBe('Les versements sur ton PER ne sont pas connus\u00A0: sa variation est comptée dans les marchés.')
  })

  test('does not say it for an account that is held in only one of the two snapshots', () => {
    const without = at('2025-06-30', snapshotOf([amountEntry('liv', 10_000)]))
    expect(history(evolutionView(modelOf([without, newer]), TODAY)).split.unknownPayments).toEqual([])
  })

  test('says the accounts already held were added along the way, not this time', () => {
    const without = at('2025-06-30', snapshotOf([amountEntry('liv', 10_000), amountEntry('per-line', 20_000)]))
    const row = history(evolutionView(modelOf([without, newer]), TODAY)).split.rows.find((r) => r.part === 'existing')!
    expect(row.label).toBe('Ce que tu avais déjà')
    expect(row.detail).toContain('des comptes ajoutés en cours de route')
    expect(row.detail).not.toContain('cette fois')
  })

  test('sums the split over consecutive snapshots, as the update result does', () => {
    const middle = at('2026-03-31', snapshotOf([amountEntry('liv', 11_000), amountEntry('per-line', 21_000), amountEntry('usd', 10_000)], { USD: 0.85 }))
    const view = history(evolutionView(modelOf([older, middle, newer]), TODAY))
    const a = splitChange(profile, older, middle)
    const b = splitChange(profile, middle, newer)
    const effort = view.split.rows.find((r) => r.part === 'effort')!
    const markets = view.split.rows.find((r) => r.part === 'markets')!
    const euros = (cents: number) => plain(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100))
    expect(plain(effort.amount)).toBe(euros(a.effort + b.effort))
    expect(plain(markets.amount)).toBe(euros(a.markets + b.markets))
    expect(effort.label).toBe('Ton effort')
    expect(markets.label).toBe('Les marchés et les intérêts')
  })
})

describe('Tes relevés', () => {
  test('lists the snapshots newest first, each a link to its own page', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    expect(view.snapshots.map((s) => plain(s.date))).toEqual(['30 septembre 2026', '30 juin 2025'])
    expect(view.snapshots.map((s) => plain(s.net))).toEqual(['42 600 €', '38 500 €'])
    expect(view.snapshots.map((s) => s.href)).toEqual(['/releve/s1', '/releve/s0'])
  })

  test('marks the latest snapshot « le dernier », and only it', () => {
    const view = history(evolutionView(modelOf([older, newer]), TODAY))
    expect(view.snapshots.map((s) => s.last)).toEqual([true, false])
  })

  // Review Focus 2: two snapshots of the same day, the latest is the last in the repository's order.
  test('of two snapshots of the same day, the latest is the last one stored', () => {
    const view = history(evolutionView(modelOf([older, newer, newer]), TODAY))
    expect(view.snapshots.map((s) => [s.id, s.last])).toEqual([
      ['s2', true],
      ['s1', false],
      ['s0', false],
    ])
  })

  test('marks nothing « le dernier » when the latest snapshot is not in the list', () => {
    // A line the profile does not know: this snapshot cannot be read, it is left out of the list.
    const unknown = at('2026-10-30', snapshotOf([amountEntry('liv', 12_000), amountEntry('ghost', 10_000)]))
    const view = history(evolutionView(modelOf([older, newer, unknown]), TODAY))
    expect(view.snapshots.map((s) => s.id)).toEqual(['s1', 's0'])
    expect(view.snapshots.some((s) => s.last)).toBe(false)
  })
})

// Planche 4: the grid snapshot after snapshot, only real snapshots, oldest first.
describe('the grid, snapshot by snapshot', () => {
  test('one step per snapshot with a grid, oldest first, each with its own date, net and square', () => {
    const view = history(evolutionView(modelOf([newer, older]), TODAY))
    expect(view.steps).not.toBeNull()
    const steps = view.steps!
    expect(steps.map((s) => s.snapshotId)).toEqual(['s1', 's0'])
    expect(steps.map((s) => plain(s.date))).toEqual(['30 juin 2025', '30 septembre 2026'])
    expect(steps.every((s) => s.cells.length === 100)).toBe(true)
    expect(plain(steps[1].net)).toBe(plain(view.snapshots[0].net))
    expect(plain(steps[1].squareValue)).toBe(plain(view.snapshots[0].squareValue))
  })

  // B2 (Nicolas, 11 November 2026): the cap, told as a total on the curve, and what a square will be worth there.
  test('under the curve, what a square will be worth at the next cap', () => {
    const view = history(evolutionView(modelOf([newer, older]), TODAY))
    expect(view.nextCap).not.toBeNull()
    expect(plain(view.capSentence)).toMatch(/^À \d[\d ]* €, un carré vaudra \d[\d ]* €\.$/)
  })

  // « Chez toi » in its own green (Nicolas, 11 November 2026): the grid of each step says it as Mon argent does.
  test('each step names its « Chez toi » squares, and none without a rental', () => {
    const withRental = profileOf(
      [account('c', 'current'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
      [line('cash', 'c'), line('home', 'h'), line('rent', 'r')],
    )
    const statement = (takenOn: string, rent: number) =>
      at(takenOn, snapshotOf([amountEntry('cash', 50_000), amountEntry('home', 300_000), amountEntry('rent', rent)]))
    const view = history(evolutionView(modelOf([statement('2026-09-30', 200_000), statement('2025-06-30', 150_000)], undefined, withRental), TODAY))
    for (const step of view.steps!) {
      expect(step.home).not.toBeNull()
      expect(step.cells.slice(step.home!.from, step.home!.to).every((c) => c === 'property')).toBe(true)
      expect(step.home!.to).toBe(100)
    }
    const without = history(evolutionView(modelOf([newer, older]), TODAY))
    expect(without.steps!.every((s) => s.home === null)).toBe(true)
  })

  test('a day with two snapshots is one step, its latest one, as on the curve', () => {
    const view = history(evolutionView(modelOf([older, newer, at('2026-09-30', older)]), TODAY))
    expect(view.steps!.map((s) => s.snapshotId)).toEqual(['s0', 's2'])
  })

  test('a snapshot without a grid is not a step; fewer than two steps make none', () => {
    const empty = at('2026-10-31', snapshotOf([]))
    expect(history(evolutionView(modelOf([older, newer, empty]), TODAY)).steps!.map((s) => s.snapshotId)).toEqual(['s0', 's1'])
    expect(history(evolutionView(modelOf([older, empty]), TODAY)).steps).toBeNull()
  })
})
