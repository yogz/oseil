// Mon argent for a person with a rental (immobilier locatif, task 4a): the Immobilier row splits into
// « Chez toi » and « En location », the rental is compared with its goal, a pocket under its loans is
// said by its sentence.
import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { GoalAllocation, GoalShares, Profile, Snapshot } from '@/lib/model/types'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'

const TODAY = '2026-11-10'
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const plain = (text: string | null | undefined) => (text ?? null)?.replace(/[  ]/g, ' ') ?? null
const shares = (s: Partial<GoalShares>): GoalShares => ({ available: 0, secured: 0, markets: 0, gold: 0, rental: 0, ...s })
const goalOf = (s: Partial<GoalShares>): GoalAllocation => ({ schema: 1, validFrom: '2026-01-01', shares: shares(s) })

const modelOf = (profile: Profile, snapshot: Snapshot, goals: GoalAllocation[]): Model => ({
  profile: loaded(profile),
  snapshots: [loaded(snapshot, 's0')],
  goals: goals.map((g, i) => loaded(g, `g${i}`)),
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})

function board(model: Model): Board {
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error(`expected a board, got ${view.kind}`)
  return view
}

// Chez toi (a home with its loan) and a rental (with its loan), and some cash.
const withRental = profileOf(
  [
    account('c', 'current'),
    account('h', 'home'),
    account('hl', 'loan', { financedLineId: 'home' }),
    account('r', 'home', { residence: 'rental' }),
    account('rl', 'loan', { financedLineId: 'rent' }),
  ],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('rent', 'r'), line('rent-loan', 'rl')],
)
const statement = (cash: number, home: number, homeLoan: number, rent: number, rentLoan: number) =>
  snapshotOf([
    amountEntry('cash', cash),
    amountEntry('home', home),
    amountEntry('home-loan', homeLoan),
    amountEntry('rent', rent),
    amountEntry('rent-loan', rentLoan),
  ])
const rentalOnly = profileOf(
  [account('c', 'current'), account('r', 'home', { residence: 'rental' })],
  [line('cash', 'c'), line('rent', 'r')],
)

const property = (b: Board) => b.categories.find((c) => c.category === 'property')!
const shown = (rows: NonNullable<Board['categories'][number]['pockets']>) =>
  rows.map((r) => ({ ...r, euros: plain(r.euros), percent: plain(r.percent) }))

describe('the Immobilier row of a person with a rental', () => {
  // 20 squares of cash, 20 of the rental, 60 of Chez toi.
  const steered = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 0), [goalOf({ available: 50, rental: 50 })]))

  test('splits into « Chez toi · pas d’objectif » and « En location » with its gap to the goal', () => {
    const row = property(steered)
    expect(plain(row.euros)).toBe('400 000 €')
    expect(plain(row.percent)).toBe('80 %')
    expect(row.goal).toBeNull()
    // « pas d’objectif » moved to the Chez toi sub-row: the row keeps its estimate date only.
    expect(plain(row.note)).toBe('estimée le 30 septembre')
    expect(shown(row.pockets!)).toEqual([
      { pocket: 'chez-toi', name: 'Chez toi', euros: '300 000 €', percent: '60 %', goal: null, note: 'pas d’objectif' },
      {
        pocket: 'location',
        name: 'En location',
        euros: '100 000 €',
        percent: '20 %',
        goal: { actual: 20, target: 20, words: 'pile à ton objectif' },
        note: null,
      },
    ])
  })

  test('the headline speaks of what is not Chez toi', () => {
    expect(steered.goals).toMatchObject({ headline: 'Hors chez toi, pile à tes objectifs.', detail: null, simulation: null })
    const near = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 0), [goalOf({ available: 40, rental: 60 })]))
    expect(near.goals).toMatchObject({ headline: 'Hors chez toi, proche de tes objectifs', detail: 'À 4 carrés près.' })
    expect(property(near).pockets![1].goal).toEqual({ actual: 20, target: 24, words: 'un peu en dessous de ton objectif' })
  })

  test('the rental target is part of the scale shared by every goal bar', () => {
    // 40 squares to share: 8 of cash, 32 of rental.
    const b = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 0), [goalOf({ available: 20, rental: 80 })]))
    expect(property(b).pockets![1].goal).toEqual({ actual: 20, target: 32, words: 'en dessous de ton objectif' })
    expect(b.goals!.scale).toBe(32)
  })

  // A home is not sold in pieces nor bought with a few thousand euros (Nicolas, 12 November 2026): the
  // simulation never moves the rental squares, and says the rental's gap in words instead.
  test('a rental above its goal is never sold off: no simulation, its gap said', () => {
    const b = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 0), [goalOf({ available: 100 })]))
    expect(b.goals!.simulation).toBeNull()
    // The headline tells the whole gap; only the simulation leaves the rental where it is.
    expect(b.goals!.headline).toBe('Hors chez toi, en route vers tes objectifs')
    expect(plain(b.goals!.rentalNote)).toBe(
      'Ton immobilier locatif dépasse son objectif d’environ 100 000 €. Un bien ne se vend pas par morceaux : il reste tel quel.',
    )
    // Its row still compares it with its goal.
    expect(property(b).pockets![1].goal).toEqual({ actual: 20, target: 0, words: 'au-dessus de ton objectif' })
  })


  test('without goals: the two sub-rows, no gap and no « pas d’objectif »', () => {
    const b = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 0), []))
    expect(b.goals).toBeNull()
    expect(shown(property(b).pockets!)).toEqual([
      { pocket: 'chez-toi', name: 'Chez toi', euros: '300 000 €', percent: '60 %', goal: null, note: null },
      { pocket: 'location', name: 'En location', euros: '100 000 €', percent: '20 %', goal: null, note: null },
    ])
  })

  test('a rental alone: only the « En location » sub-row, and no « Hors chez toi »', () => {
    const b = board(modelOf(rentalOnly, snapshotOf([amountEntry('cash', 100_000), amountEntry('rent', 100_000)]), [goalOf({ available: 50, rental: 50 })]))
    expect(shown(property(b).pockets!)).toEqual([
      {
        pocket: 'location',
        name: 'En location',
        euros: '100 000 €',
        percent: '50 %',
        goal: { actual: 50, target: 50, words: 'pile à ton objectif' },
        note: null,
      },
    ])
    expect(b.goals).toMatchObject({ headline: 'Pile à tes objectifs.' })
  })

  test('a rental under its loan: no square, said by its sentence, never taken off Chez toi', () => {
    const b = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 150_000), [goalOf({ available: 50, rental: 50 })]))
    const row = property(b)
    // The row shows what its squares show: Chez toi alone.
    expect(plain(row.euros)).toBe('300 000 €')
    expect(plain(row.percent)).toBe('75 %')
    expect(shown(row.pockets!)).toEqual([
      { pocket: 'chez-toi', name: 'Chez toi', euros: '300 000 €', percent: '75 %', goal: null, note: 'pas d’objectif' },
      {
        pocket: 'location',
        name: 'En location',
        euros: '−50 000 €',
        percent: '0 %',
        // 25 squares to share, half each: the tie goes to the first share.
        goal: { actual: 0, target: 12, words: 'rien pour l’instant' },
        note: null,
      },
    ])
    expect(b.excluded.map((e) => ({ ...e, sentence: plain(e.sentence) }))).toEqual([
      {
        category: 'property',
        sentence: 'Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
      },
    ])
    expect(b.warnings).toContain('La grille montre ce qui est positif.')
  })

  test('Chez toi under its loan: no square, said by its sentence, the rental keeps its own', () => {
    const b = board(modelOf(withRental, statement(100_000, 100_000, 200_000, 100_000, 0), [goalOf({ available: 50, rental: 50 })]))
    const row = property(b)
    expect(plain(row.euros)).toBe('100 000 €')
    expect(plain(row.percent)).toBe('50 %')
    expect(shown(row.pockets!).map((r) => [r.pocket, r.euros, r.percent])).toEqual([
      ['chez-toi', '−100 000 €', '0 %'],
      ['location', '100 000 €', '50 %'],
    ])
    expect(b.excluded.map((e) => plain(e.sentence))).toEqual([
      'Chez toi, ton logement vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
    ])
    // Chez toi has no square: the goals compare the whole grid.
    expect(b.goals).toMatchObject({ headline: 'Pile à tes objectifs.' })
  })

  test('both under their loans: one sentence says both; the rental goal keeps the row, at 0', () => {
    const b = board(modelOf(withRental, statement(200_000, 100_000, 150_000, 100_000, 150_000), [goalOf({ available: 50, rental: 50 })]))
    const row = property(b)
    expect(plain(row.euros)).toBe('0 €')
    expect(shown(row.pockets!).map((r) => [r.pocket, r.euros, r.percent, r.goal])).toEqual([
      ['chez-toi', '−50 000 €', '0 %', null],
      ['location', '−50 000 €', '0 %', { actual: 0, target: 50, words: 'rien pour l’instant' }],
    ])
    expect(board(modelOf(withRental, statement(200_000, 100_000, 150_000, 100_000, 150_000), [goalOf({ available: 100 })])).categories.find(
      (c) => c.category === 'property',
    )).toBeUndefined()
    expect(b.excluded.map((e) => plain(e.sentence))).toEqual([
      'Chez toi comme en location, ton immobilier vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
    ])
  })

  test('the loans are said as lent for the homes they finance', () => {
    const both = board(modelOf(withRental, statement(100_000, 300_000, 100_000, 100_000, 50_000), []))
    expect(plain(both.ownedSentence)).toBe('Tu possèdes 500 000 €, dont 150 000 € prêtés pour tes logements.')
    const rentalLoan = board(modelOf(withRental, statement(100_000, 300_000, 0, 100_000, 50_000), []))
    expect(plain(rentalLoan.ownedSentence)).toBe('Tu possèdes 500 000 €, dont 50 000 € prêtés pour ton logement en location.')
    const homeLoan = board(modelOf(withRental, statement(100_000, 300_000, 50_000, 100_000, 0), []))
    expect(plain(homeLoan.ownedSentence)).toBe('Tu possèdes 500 000 €, dont 50 000 € prêtés pour ton logement.')
  })
})

describe('a rental alone, under its loan (review, fix round 1)', () => {
  const rentalUnderWater = profileOf(
    [account('c', 'current'), account('r', 'home', { residence: 'rental' }), account('rl', 'loan', { financedLineId: 'rent' })],
    [line('cash', 'c'), line('rent', 'r'), line('rent-loan', 'rl')],
  )
  const snapshot = snapshotOf([amountEntry('cash', 100_000), amountEntry('rent', 100_000), amountEntry('rent-loan', 150_000)])

  test('is said by the rental’s own sentence, never « Chez toi comme en location »', () => {
    const b = board(modelOf(rentalUnderWater, snapshot, []))
    expect(b.excluded.map((e) => plain(e.sentence))).toEqual([
      'Ton logement en location vaut moins que ce qu’il reste à rembourser : pas de carré pour l’instant.',
    ])
  })

  test('its goal share keeps a row: Immobilier at 0, « En location » with its bar, the rows add up to the headline', () => {
    const b = board(modelOf(rentalUnderWater, snapshot, [goalOf({ available: 50, markets: 30, rental: 20 })]))
    expect(b.goals).toMatchObject({ headline: 'En route vers tes objectifs', detail: 'À 50 carrés près sur 100.' })
    const row = property(b)
    expect(row).toMatchObject({ name: 'Immobilier', goal: null, linked: true })
    expect(plain(row.euros)).toBe('0 €')
    expect(plain(row.percent)).toBe('0 %')
    expect(shown(row.pockets!)).toEqual([
      {
        pocket: 'location',
        name: 'En location',
        euros: '−50 000 €',
        percent: '0 %',
        goal: { actual: 0, target: 20, words: 'rien pour l’instant' },
        note: null,
      },
    ])
    // Every target of the goals is on a row, and what is missing adds up to what the headline counts.
    const goals = b.categories.flatMap((c) => [c.goal, ...(c.pockets ?? []).map((p) => p.goal)]).filter((g) => g !== null)
    expect(goals.reduce((s, g) => s + g.target, 0)).toBe(100)
    expect(goals.reduce((s, g) => s + Math.max(0, g.target - g.actual), 0)).toBe(50)
    expect(b.goals!.scale).toBe(100)
  })

  test('with no property at all, a rental share still has its row, at 0', () => {
    const cashOnly = profileOf([account('c', 'current')], [line('cash', 'c')])
    const b = board(modelOf(cashOnly, snapshotOf([amountEntry('cash', 100_000)]), [goalOf({ available: 80, rental: 20 })]))
    const row = property(b)
    expect(row).toMatchObject({ name: 'Immobilier', goal: null, linked: false, note: null })
    expect(plain(row.euros)).toBe('0 €')
    expect(shown(row.pockets!)).toEqual([
      {
        pocket: 'location',
        name: 'En location',
        euros: '0 €',
        percent: '0 %',
        goal: { actual: 0, target: 20, words: 'rien pour l’instant' },
        note: null,
      },
    ])
  })

  test('Chez toi alone under its loan, no rental: the sentence of before, and no row', () => {
    const home = profileOf(
      [account('c', 'current'), account('h', 'home'), account('hl', 'loan', { financedLineId: 'home' })],
      [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl')],
    )
    const b = board(
      modelOf(home, snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 100_000), amountEntry('home-loan', 150_000)]), [
        goalOf({ available: 100 }),
      ]),
    )
    expect(b.excluded.map((e) => plain(e.sentence))).toEqual([
      'Ton immobilier vaut moins que ce qu’il reste à rembourser : il n’a pas de carré pour l’instant.',
    ])
    expect(property(b)).toBeUndefined()
  })
})

describe('« prêtés pour … », a repaid loan counts for nothing (ruled on review, fix round 1)', () => {
  test('a home loan still owed beside a repaid car loan at 0 €: lent for the home', () => {
    const p = profileOf(
      [
        account('c', 'current'),
        account('h', 'home'),
        account('hl', 'loan', { financedLineId: 'home' }),
        account('car', 'loan'),
      ],
      [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('car-loan', 'car')],
    )
    const b = board(
      modelOf(
        p,
        snapshotOf([amountEntry('cash', 100_000), amountEntry('home', 300_000), amountEntry('home-loan', 120_000), amountEntry('car-loan', 0)]),
        [],
      ),
    )
    expect(plain(b.ownedSentence)).toBe('Tu possèdes 400 000 €, dont 120 000 € prêtés pour ton logement.')
  })
})

describe('a goal with a rental share and no rental any more', () => {
  test('the rental sub-row stays, at nothing for now, so the goals still add up', () => {
    const b = board(modelOf(exampleProfile, exampleSnapshot, [goalOf({ available: 25, secured: 25, markets: 30, gold: 5, rental: 15 })]))
    const row = property(b)
    expect(shown(row.pockets!)).toEqual([
      { pocket: 'chez-toi', name: 'Chez toi', euros: '120 000 €', percent: '59 %', goal: null, note: 'pas d’objectif' },
      {
        pocket: 'location',
        name: 'En location',
        euros: '0 €',
        percent: '0 %',
        goal: { actual: 0, target: 6, words: 'rien pour l’instant' },
        note: null,
      },
    ])
  })
})

describe('the words of « ta maison », now « chez toi », for everyone', () => {
  test('only a home: nothing to compare', () => {
    const b = board(modelOf(profileOf([account('h', 'home')], [line('house', 'h')]), snapshotOf([amountEntry('house', 200_000)]), [goalOf({ available: 100 })]))
    expect(b.warnings.map(plain)).toEqual(['Tes objectifs portent sur ce qui n’est pas chez toi : rien à comparer pour l’instant.'])
  })

  test('a rental alone, nothing else: it is compared, there is something to compare', () => {
    const b = board(modelOf(rentalOnly, snapshotOf([amountEntry('rent', 100_000)]), [goalOf({ available: 50, rental: 50 })]))
    expect(b.warnings).toEqual([])
    expect(b.goals).toMatchObject({ headline: 'En route vers tes objectifs', detail: 'À 50 carrés près sur 100.' })
  })
})

// Nicolas, 10 November 2026: 1 € of crypto was one square and read « pile à ton objectif ».
describe('a category under half a square', () => {
  test('keeps its row and its true amount, has no square, and never reads as at its goal', () => {
    const profile = profileOf([account('cc', 'current'), account('wallet', 'crypto')], [line('cash', 'cc'), line('btc', 'wallet')])
    const b = board(modelOf(profile, snapshotOf([amountEntry('cash', 626_460), amountEntry('btc', 1)]), [goalOf({ available: 99, gold: 1 })]))
    const gold = b.categories.find((c) => c.category === 'gold')!
    expect(plain(gold.euros)).toBe('1 €')
    expect(plain(gold.percent)).toBe('moins de 1 %')
    expect(gold.goal).toEqual({ actual: 0, target: 1, words: 'moins d’un carré' })
  })
})

describe('a rental short of its goal (Nicolas, 12 November 2026)', () => {
  // 20 squares each of cash, markets and rental, 40 of Chez toi; a square is 5 000 €.
  const four = profileOf(
    [account('c', 'current'), account('s', 'securities'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
    [line('cash', 'c'), line('fund', 's'), line('home', 'h'), line('rent', 'r')],
  )
  const snap = snapshotOf([amountEntry('cash', 100_000), amountEntry('fund', 100_000), amountEntry('home', 200_000), amountEntry('rent', 100_000)])
  const b = board(modelOf(four, snap, [goalOf({ available: 10, markets: 30, rental: 60 })]))

  test('nothing goes into the rental: the others share what it leaves, by their goals', () => {
    expect(b.goals!.simulation!.moves.map((m) => [m.from, m.to, m.percent.replace(/\s/g, ' ')])).toEqual([['available', 'markets', '10 %']])
    expect(b.goals!.simulation!.misplaced).toBe(10)
  })
  test('the rental’s gap is said in words', () => {
    expect(plain(b.goals!.rentalNote)).toBe(
      'Il manque environ 80 000 € à ton immobilier locatif. Un bien ne s’achète pas par petites sommes : il reste tel quel.',
    )
  })
  test('a rental at its goal: no sentence', () => {
    const atGoal = board(modelOf(four, snap, [goalOf({ available: 33.34, markets: 33.33, rental: 33.33 })]))
    expect(property(atGoal).pockets![1].goal!.target).toBe(20)
    expect(atGoal.goals!.rentalNote).toBeUndefined()
  })
})

