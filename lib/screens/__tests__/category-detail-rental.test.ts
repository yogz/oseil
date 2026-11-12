// The detail of Immobilier for a person with a rental (immobilier locatif, task 4a): two groups,
// « Pour y vivre » with no goal and « En location » with its net value and its gap to the goal.
import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, GoalShares, Profile, Snapshot } from '@/lib/model/types'
import { categoryDetailView, type CategoryDetailView } from '@/lib/screens/category-detail'

const TODAY = '2026-11-10'
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const plain = (text: string | null | undefined) => (text ?? null)?.replace(/[  ]/g, ' ') ?? null
const goalOf = (s: Partial<GoalShares>): GoalAllocation => ({
  schema: 1,
  validFrom: '2026-01-01',
  shares: { available: 0, secured: 0, markets: 0, gold: 0, rental: 0, ...s },
})
const modelOf = (profile: Profile, snapshot: Snapshot, goals: GoalAllocation[]): Model => ({
  profile: loaded(profile),
  snapshots: [loaded(snapshot, 's0')],
  goals: goals.map((g, i) => loaded(g, `g${i}`)),
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})

// Chez toi (a home with its loan, a secondary home, an SCPI on another account) and a rental with its loan.
const withRental = profileOf(
  [
    account('c', 'current'),
    account('h', 'home'),
    account('hl', 'loan', { financedLineId: 'home' }),
    account('s', 'home', { residence: 'secondary' }),
    account('o', 'other'),
    account('r', 'home', { residence: 'rental' }),
    account('rl', 'loan', { financedLineId: 'rent' }),
  ],
  [
    line('cash', 'c'),
    line('home', 'h'),
    line('home-loan', 'hl'),
    line('cabin', 's'),
    line('scpi', 'o', { category: 'property' }),
    line('rent', 'r'),
    line('rent-loan', 'rl'),
  ],
)
const statement = (rentLoan: number) =>
  snapshotOf([
    amountEntry('cash', 100_000),
    amountEntry('home', 200_000),
    amountEntry('home-loan', 0),
    amountEntry('cabin', 80_000),
    amountEntry('scpi', 20_000),
    amountEntry('rent', 100_000),
    amountEntry('rent-loan', rentLoan),
  ])

const groups = (view: CategoryDetailView) =>
  view.chapters?.map((c) => ({
    id: c.id,
    label: c.label,
    euros: plain(c.euros),
    percent: plain(c.percent),
    sub: plain(c.sub),
    aim: plain(c.aim),
    goal: c.goal,
    lines: c.lines.map((l) => l.name),
  }))

describe('the detail of Immobilier with a rental', () => {
  // 100 squares: 20 of cash, 20 of rental, 60 of Chez toi.
  const steered = categoryDetailView(modelOf(withRental, statement(0), [goalOf({ available: 50, rental: 50 })]), 'property', TODAY)!

  test('two groups: « Pour y vivre » with no goal, « En location » with its gap to the goal', () => {
    expect(plain(steered.header)).toBe('80 carrés sur 100')
    expect(steered.goal).toBeNull()
    expect(groups(steered)).toEqual([
      {
        id: 'chez-toi',
        label: 'Pour y vivre',
        euros: '300 000 €',
        percent: '60 %',
        sub: '', // its squares are drawn (planche 4, option B, 12 November 2026)
        aim: 'pas d’objectif',
        goal: null,
        lines: ['home', 'cabin', 'scpi'],
      },
      {
        id: 'location',
        label: 'En location',
        euros: '100 000 €',
        percent: '20 %',
        sub: '',
        aim: 'pile à ton objectif (20 carrés)',
        goal: { actual: 20, target: 20 },
        lines: ['rent'],
      },
    ])
  })

  test('« En location » shows its value net of its loan', () => {
    const view = categoryDetailView(modelOf(withRental, statement(40_000), [goalOf({ available: 50, rental: 50 })]), 'property', TODAY)!
    const rental = groups(view)!.find((g) => g.id === 'location')!
    expect(rental.euros).toBe('60 000 €')
    expect(view.chapters!.find((c) => c.id === 'location')!.lines[0].loans).toHaveLength(1)
  })

  test('a rental under its loan: its group says why it has no square, Chez toi keeps its own', () => {
    const view = categoryDetailView(modelOf(withRental, statement(150_000), [goalOf({ available: 50, rental: 50 })]), 'property', TODAY)!
    const [home, rental] = groups(view)!
    expect(home.euros).toBe('300 000 €')
    expect(home.percent).toBe('75 %')
    expect(rental).toMatchObject({
      id: 'location',
      euros: '−50 000 €',
      percent: '−50 000 €',
      sub: '1 ligne',
      aim: 'Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
    })
    expect(plain(view.header)).toBe('75 carrés sur 100')
  })

  test('a rental alone under its loan: the header says the rental’s own sentence (fix round 1)', () => {
    const rentalOnly = profileOf(
      [account('c', 'current'), account('r', 'home', { residence: 'rental' }), account('rl', 'loan', { financedLineId: 'rent' })],
      [line('cash', 'c'), line('rent', 'r'), line('rent-loan', 'rl')],
    )
    const view = categoryDetailView(
      modelOf(rentalOnly, snapshotOf([amountEntry('cash', 100_000), amountEntry('rent', 100_000), amountEntry('rent-loan', 150_000)]), []),
      'property',
      TODAY,
    )!
    expect(plain(view.header)).toBe('Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.')
  })

  test('both pockets under their loans: one sentence says both', () => {
    const view = categoryDetailView(
      modelOf(
        withRental,
        snapshotOf([
          amountEntry('cash', 400_000),
          amountEntry('home', 100_000),
          amountEntry('home-loan', 200_000),
          amountEntry('cabin', 0),
          amountEntry('scpi', 0),
          amountEntry('rent', 100_000),
          amountEntry('rent-loan', 150_000),
        ]),
        [],
      ),
      'property',
      TODAY,
    )!
    expect(plain(view.header)).toBe(
      'Chez toi comme en location, ton immobilier vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
    )
  })

  test('without goals: the two groups, no gap and no « pas d’objectif »', () => {
    const view = categoryDetailView(modelOf(withRental, statement(0), []), 'property', TODAY)!
    expect(groups(view)!.map((g) => [g.id, g.aim, g.goal])).toEqual([
      ['chez-toi', null, null],
      ['location', null, null],
    ])
  })

  test('a rental alone in Immobilier: its one group, with its gap', () => {
    const rentalOnly = profileOf([account('c', 'current'), account('r', 'home', { residence: 'rental' })], [line('cash', 'c'), line('rent', 'r')])
    const view = categoryDetailView(
      modelOf(rentalOnly, snapshotOf([amountEntry('cash', 100_000), amountEntry('rent', 100_000)]), [goalOf({ available: 60, rental: 40 })]),
      'property',
      TODAY,
    )!
    expect(groups(view)!.map((g) => [g.id, g.aim])).toEqual([['location', 'au-dessus de ton objectif (40 carrés)']])
  })

  test('a goal of the steered categories counts the rental squares as something to compare', () => {
    // Only Chez toi and the rental: the rental alone is steered.
    const homes = profileOf(
      [account('h', 'home'), account('r', 'home', { residence: 'rental' })],
      [line('home', 'h'), line('rent', 'r')],
    )
    const view = categoryDetailView(
      modelOf(homes, snapshotOf([amountEntry('home', 300_000), amountEntry('rent', 100_000)]), [goalOf({ available: 50, rental: 50 })]),
      'property',
      TODAY,
    )!
    expect(groups(view)!.map((g) => [g.id, g.aim])).toEqual([
      ['chez-toi', 'pas d’objectif'],
      ['location', 'au-dessus de ton objectif (12 carrés)'],
    ])
  })
})

describe('a goal with a rental share and no rental any more', () => {
  // A home and cash, no rental: 75 squares of Chez toi, 25 steered, 4 of them the rental's target.
  const sold = profileOf([account('c', 'current'), account('h', 'home')], [line('cash', 'c'), line('home', 'h')])
  const statement = snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 300_000)])

  test('« En location » stays, at nothing for now, with its bar, as on Mon argent', () => {
    const view = categoryDetailView(modelOf(sold, statement, [goalOf({ available: 85, rental: 15 })]), 'property', TODAY)!
    expect(groups(view)).toEqual([
      {
        id: 'chez-toi',
        label: 'Pour y vivre',
        euros: '300 000 €',
        percent: '75 %',
        sub: '',
        aim: 'pas d’objectif',
        goal: null,
        lines: ['home'],
      },
      {
        id: 'location',
        label: 'En location',
        // In %, « 0 % », as the sub-row of Mon argent; no count of lines, only its gap and its bar.
        euros: '0 €',
        percent: '0 %',
        sub: '',
        aim: 'rien pour l’instant (4 carrés)',
        goal: { actual: 0, target: 4 },
        lines: [],
      },
    ])
  })

  test('Immobilier under its loans, no rental, a rental share: split, « Pour y vivre » says why it has no square', () => {
    const owing = profileOf(
      [account('c', 'current'), account('h', 'home'), account('hl', 'loan', { financedLineId: 'home' })],
      [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl')],
    )
    const underWater = snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 100_000), amountEntry('home-loan', 150_000)])
    const view = categoryDetailView(modelOf(owing, underWater, [goalOf({ available: 85, rental: 15 })]), 'property', TODAY)!
    // Pinned on the code of 10 November 2026: the targets are those of Mon argent, over the 100 squares.
    expect(groups(view)).toEqual([
      {
        id: 'chez-toi',
        label: 'Pour y vivre',
        euros: '−50 000 €',
        percent: '−50 000 €',
        sub: '1 ligne',
        aim: 'pas d’objectif',
        goal: null,
        lines: ['home'],
      },
      {
        id: 'location',
        label: 'En location',
        euros: '0 €',
        percent: '0 %',
        sub: '',
        aim: 'rien pour l’instant (15 carrés)',
        goal: { actual: 0, target: 15 },
        lines: [],
      },
    ])
  })

  test('a goal with no rental share: Immobilier as it always was, no group', () => {
    const view = categoryDetailView(modelOf(sold, statement, [goalOf({ available: 100 })]), 'property', TODAY)!
    expect(view.chapters).toBeNull()
  })
})

// « Chez toi » in its own green (Nicolas, 11 November 2026): its small squares follow the grid, and
// only when the grid holds both pockets.
describe('the small squares of « Pour y vivre »', () => {
  const homeOf = (view: CategoryDetailView) => view.chapters!.map((c) => ({ id: c.id, home: c.home }))

  test('take the green of « Chez toi » when both pockets have squares', () => {
    const view = categoryDetailView(modelOf(withRental, statement(0), [goalOf({ available: 50, rental: 50 })]), 'property', TODAY)!
    expect(homeOf(view)).toEqual([
      { id: 'chez-toi', home: true },
      { id: 'location', home: false },
    ])
  })

  test('keep the green of Immobilier when the rental has no square, as the grid does', () => {
    const view = categoryDetailView(modelOf(withRental, statement(100_000), [goalOf({ available: 50, rental: 50 })]), 'property', TODAY)!
    expect(homeOf(view).every((c) => c.home === false)).toBe(true)
  })
})
