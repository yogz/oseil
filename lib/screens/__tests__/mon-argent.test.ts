import { describe, expect, test } from 'vitest'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
  unitsEntry,
} from '@/lib/model/__tests__/fixtures'
import { GOAL_PRESETS } from '@/lib/catalog'
import type { Model } from '@/lib/app/use-model'
import type { GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import type { Market } from '@/lib/market/types'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'
import { DRAFT_UNREADABLE, startDraft } from '@/lib/update/draft'

const TODAY = '2026-11-06'
const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? null
const shown = (entered: Extract<ReturnType<typeof monArgentView>, { kind: 'resume' }>['entered']) =>
  entered.map((e) => ({
    establishment: e.establishment,
    status: e.status,
    accounts: e.accounts.map((a) => ({ name: a.name, amount: plain(a.amount) })),
  }))

const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }

function modelOf(parts: {
  profile?: Profile | null
  snapshots?: Snapshot[]
  goals?: GoalAllocation[]
  unreadable?: Partial<Model['unreadable']>
  draftBasedOn?: string
}): Model {
  return {
    profile: parts.profile === null ? null : loaded(parts.profile ?? exampleProfile),
    snapshots: (parts.snapshots ?? [exampleSnapshot]).map((s, i) => loaded(s, `s${i}`)),
    goals: (parts.goals ?? [balanced]).map((g, i) => loaded(g, `g${i}`)),
    settings: null,
    draft: parts.draftBasedOn === undefined ? null : loaded(startDraft(parts.draftBasedOn), 'd0'),
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0, ...parts.unreadable },
  }
}

function board(model: Model): Board {
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error(`expected a board, got ${view.kind}`)
  return view
}

describe('the board', () => {
  test('shows the example profile in words', () => {
    const b = board(modelOf({}))
    expect(b.dateLabel).toBe('Chiffres du 30 septembre')
    expect(plain(b.net)).toBe('202 000 €')
    expect(plain(b.ownedSentence)).toBe(
      'Tu possèdes 382 000 €, dont 180 000 € prêtés pour ton logement.',
    )
    expect(plain(b.squareValue)).toBe('2 020 €')
    expect(b.progress).toBeNull()
    expect(b.noGridSentence).toBeNull()
    expect(b.warnings).toEqual([])
  })

  test('compares with the goals', () => {
    const b = board(modelOf({}))
    // The home is in the grid: the goals compare what is outside it.
    expect(b.goals).toMatchObject({ headline: 'Hors chez toi, proche de tes objectifs', detail: 'À 5 carrés près.' })
    const available = b.categories.find((c) => c.category === 'available')!
    expect(available.name).toBe('Argent disponible')
    expect(available.goal).toEqual({ actual: 10, target: 10, words: 'pile à ton objectif' })
    expect(plain(available.percent)).toBe('10 %')
    const biggest = Math.max(...b.categories.flatMap((c) => (c.goal ? [c.goal.actual, c.goal.target] : [])))
    expect(b.goals?.scale).toBe(biggest)
  })

  test('the home has no goal bar, carries its estimate date, and says it has no goal', () => {
    const property = board(modelOf({})).categories.find((c) => c.category === 'property')!
    expect(property.goal).toBeNull()
    expect(plain(property.note)).toBe('estimée le 30 septembre · pas d’objectif pour chez toi')
    expect(property.linked).toBe(true)
  })

  test('without goals the home only carries its estimate date', () => {
    const property = board(modelOf({ goals: [] })).categories.find((c) => c.category === 'property')!
    expect(plain(property.note)).toBe('estimée le 30 septembre')
  })

  test('an estimate of another year says its year (F5)', () => {
    const old: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? { ...e, seenOn: '2025-09-30' } : e)),
    }
    const property = board(modelOf({ snapshots: [old], goals: [] })).categories.find((c) => c.category === 'property')!
    expect(plain(property.note)).toBe('estimée le 30 septembre 2025')
  })

  test('only the house dates « estimée le »: a line of another account filed under Immobilier does not (F6)', () => {
    // A parking held in « Autre compte » at BoursoBank, filed under Immobilier, seen again in a reviewed bank.
    const profile: Profile = {
      ...exampleProfile,
      accounts: [...exampleProfile.accounts, { id: 'parking', establishmentId: 'boursobank', type: 'other', name: 'Parking' }],
      lines: [
        ...exampleProfile.lines,
        { id: 'parking-line', accountId: 'parking', name: 'Parking', kind: 'amount', currency: 'EUR', category: 'property' },
      ],
    }
    const later: Snapshot = {
      ...exampleSnapshot,
      takenOn: '2026-11-06',
      entries: [...exampleSnapshot.entries, amountEntry('parking-line', 20_000, '2026-11-06')],
    }
    const property = board(modelOf({ profile, snapshots: [later], goals: [] })).categories.find((c) => c.category === 'property')!
    expect(plain(property.note)).toBe('estimée le 30 septembre')
  })

  test('every goal category with a target is listed, even with nothing held: 0 €, 0 %, an empty bar, no link', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 9_000)])] }))
    expect(b.categories.map((c) => c.category)).toEqual(['available', 'secured', 'markets', 'gold'])
    const secured = b.categories.find((c) => c.category === 'secured')!
    expect(secured.name).toBe('Épargne sécurisée')
    expect(plain(secured.euros)).toBe('0 €')
    expect(plain(secured.percent)).toBe('0 %')
    // Nothing held: « rien pour l’instant », never a word of reassurance on an empty category.
    expect(secured.goal).toEqual({ actual: 0, target: 25, words: 'rien pour l’instant' })
    expect(secured.linked).toBe(false)
    expect(secured.note).toBeNull()
    expect(b.categories.find((c) => c.category === 'available')!.linked).toBe(true)
  })

  test('without a home in the grid the headline speaks of the 100 squares', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 9_000)])] }))
    // 100 squares available for a target of 25: 75 beyond it.
    expect(b.goals).toMatchObject({ headline: 'En route vers tes objectifs', detail: 'À 75 carrés près sur 100.' })
  })

  test('a goal category with no target and nothing held is not listed', () => {
    const allAvailable: GoalAllocation = { ...balanced, shares: { available: 100, secured: 0, markets: 0, gold: 0, rental: 0 } }
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 9_000)])], goals: [allAvailable] }))
    expect(b.categories.map((c) => c.category)).toEqual(['available'])
    expect(b.goals).toMatchObject({ headline: 'Pile à tes objectifs.' })
  })

  test('without goals only what is held is listed', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 9_000)])], goals: [] }))
    expect(b.categories.map((c) => c.category)).toEqual(['available'])
  })

  test('no goals: no sentence and no bar', () => {
    const b = board(modelOf({ goals: [] }))
    expect(b.goals).toBeNull()
    expect(b.categories.every((c) => c.goal === null)).toBe(true)
  })

  test('unreadable goals are said, not guessed', () => {
    const b = board(modelOf({ unreadable: { goals: 1 } }))
    expect(b.goals).toBeNull()
    expect(b.categories.every((c) => c.goal === null)).toBe(true)
    expect(b.warnings).toContain('Tes objectifs n’ont pas pu être lus.')
  })

  test('unreadable snapshots are said', () => {
    const b = board(modelOf({ unreadable: { snapshots: 1 } }))
    expect(b.warnings).toContain('Une partie de tes chiffres n’a pas pu être lue. Rien n’a été effacé.')
  })

  test('progress compares with the first snapshot', () => {
    // 102 000 € in total: a square was worth 1 020 €.
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2024-01-31', entries: [amountEntry('current-line', 102_000)] }
    const latest: Snapshot = { ...exampleSnapshot, entries: [amountEntry('current-line', 172_000)] }
    const b = board(modelOf({ snapshots: [first, latest] }))
    // C3 (decided by Nicolas on 9 November 2026): the square says what it was worth, in brackets,
    // and the progress is what is yours, never the difference of a square (« 46 € de plus » read
    // as « I gained 46 € »).
    expect(plain(b.progress?.squareThen ?? null)).toBe('1 020 €')
    // Another year than this one: the year is said, held to its month.
    expect(b.progress?.firstLabel).toBe('janvier\u00A02024')
    expect(plain(b.progress?.change?.euros ?? null)).toBe('+70 000 €')
    expect(plain(b.progress?.change?.percent ?? null)).toBe('+68,6 %')
  })

  test('a drop reads with its minus sign', () => {
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2024-01-31', entries: [amountEntry('current-line', 300_000)] }
    const b = board(modelOf({ snapshots: [first, exampleSnapshot] }))
    expect(plain(b.progress?.squareThen ?? null)).toBe('3 000 €')
    expect(plain(b.progress?.change?.euros ?? null)).toMatch(/^[-−]98 000 €$/)
    expect(plain(b.progress?.change?.percent ?? null)).toMatch(/^[-−]32,7 %$/)
  })

  test('the same net as at the first snapshot: the square is said, no change is', () => {
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2024-01-31' }
    const b = board(modelOf({ snapshots: [first, exampleSnapshot] }))
    expect(plain(b.progress?.squareThen ?? null)).toBe(plain(b.squareValue))
    expect(b.progress?.change).toBeNull()
  })

  test('a loan held in a bank reads the same as the same loan in « Chez toi »', () => {
    const estabs: Profile['establishments'] = [
      { id: 'bank', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
      { id: 'home', name: 'Chez toi', kind: 'home' },
    ]
    const make = (loanAt: string): Profile => ({
      schema: 1,
      establishments: estabs,
      accounts: [
        account('cur', 'current', { establishmentId: 'bank' }),
        account('house', 'home', { establishmentId: 'home' }),
        account('loan', 'loan', { establishmentId: loanAt, financedLineId: 'house-l' }),
      ],
      lines: [line('cur-l', 'cur'), line('house-l', 'house'), line('loan-l', 'loan')],
    })
    const snap = snapshotOf([amountEntry('cur-l', 5_000), amountEntry('house-l', 300_000), amountEntry('loan-l', 180_000)])
    const inBank = board(modelOf({ profile: make('bank'), snapshots: [snap] }))
    const inHome = board(modelOf({ profile: make('home'), snapshots: [snap] }))
    expect(inBank.net).toBe(inHome.net)
    expect(inBank.ownedSentence).toBe(inHome.ownedSentence)
    expect(inBank.categories).toEqual(inHome.categories)
    expect(inBank.categories.find((c) => c.category === 'property')).toBeDefined()
  })

  test('a home below its loan is left out and said', () => {
    const snap: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
    }
    const b = board(modelOf({ snapshots: [snap] }))
    expect(b.excluded).toEqual([
      {
        category: 'property',
        sentence: 'Ton immobilier vaut moins que ce qu’il reste à rembourser\u00A0: il n’a pas de carré pour l’instant.',
      },
    ])
    expect(b.warnings).toContain('La grille montre ce qui est positif.')
    expect(b.categories.find((c) => c.category === 'property')).toBeUndefined()
  })

  test('links the categories without squares to their lines', () => {
    const snap: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
    }
    expect(board(modelOf({ snapshots: [snap] })).withoutSquares).toEqual([{ category: 'property', name: 'Immobilier' }])
    expect(board(modelOf({})).withoutSquares).toEqual([])
  })

  test('a category worth exactly zero is linked too, and listed without squares when no goal lists it', () => {
    // A fund in euros at 0 €: Épargne sécurisée is neither in the grid nor below zero.
    const profile = profileOf(
      [account('cur', 'current'), account('life', 'life-insurance')],
      [line('cur-l', 'cur'), line('fund-l', 'life')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('fund-l', 0)])
    const withGoals = board(modelOf({ profile, snapshots: [snap] }))
    expect(withGoals.categories.find((c) => c.category === 'secured')!.linked).toBe(true)
    expect(withGoals.withoutSquares).toEqual([])
    expect(board(modelOf({ profile, snapshots: [snap], goals: [] })).withoutSquares).toEqual([
      { category: 'secured', name: 'Épargne sécurisée' },
    ])
  })

  test('credit beyond the available money', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan'), account('g', 'gold')],
      [line('cur-l', 'cur'), line('loan-l', 'loan'), line('g-l', 'g')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('loan-l', 3_000), amountEntry('g-l', 9_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.excluded).toEqual([
      {
        category: 'available',
        sentence: 'Tes crédits dépassent ton argent disponible\u00A0: il n’a pas de carré pour l’instant.',
      },
    ])
    expect(b.warnings).toContain('La grille montre ce qui est positif.')
    // It still has a goal: listed with what it really totals, no square, and its detail opens all the same.
    const available = b.categories.find((c) => c.category === 'available')!
    expect(plain(available.euros)).toBe('-2 000 €')
    expect(plain(available.percent)).toBe('0 %')
    expect(available.goal?.actual).toBe(0)
    expect(available.linked).toBe(true)
    expect(b.withoutSquares).toEqual([])
    // Without goals it is not listed: it opens from the categories without squares.
    expect(board(modelOf({ profile, snapshots: [snap], goals: [] })).withoutSquares).toEqual([
      { category: 'available', name: 'Argent disponible' },
    ])
  })

  test('another negative category is named', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan', { financedLineId: 'g-l' }), account('g', 'gold')],
      [line('cur-l', 'cur'), line('loan-l', 'loan'), line('g-l', 'g')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 9_000), amountEntry('loan-l', 3_000), amountEntry('g-l', 1_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.excluded).toEqual([
      { category: 'gold', sentence: 'Le total « Or et crypto » est négatif\u00A0: pas de carré pour l’instant.' },
    ])
  })

  test('a negative net gives no grid and says why', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan')],
      [line('cur-l', 'cur'), line('loan-l', 'loan')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('loan-l', 3_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.noGridSentence).toBe(
      'Pour l’instant, ce que tu dois dépasse ce que tu possèdes\u00A0: la grille apparaîtra quand ce sera l’inverse.',
    )
    expect(b.squareValue).toBeNull()
    expect(b.goals).toBeNull()
    expect(b.categories).toEqual([])
    expect(b.withoutSquares).toEqual([{ category: 'available', name: 'Argent disponible' }])
  })

  test('without a grid, every category that holds a line or a debt opens, in the order of the categories', () => {
    // A loan that finances the gold lowers it; the available money only holds its line.
    const profile = profileOf(
      [account('g', 'gold'), account('loan', 'loan', { financedLineId: 'g-l' }), account('cur', 'current'), account('l', 'livret-a')],
      [line('g-l', 'g'), line('loan-l', 'loan'), line('cur-l', 'cur'), line('l-l', 'l')],
    )
    const snap = snapshotOf([amountEntry('g-l', 500), amountEntry('loan-l', 5_000), amountEntry('cur-l', 1_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.grid.kind).toBe('none')
    expect(b.withoutSquares).toEqual([
      { category: 'available', name: 'Argent disponible' },
      { category: 'gold', name: 'Or et crypto' },
    ])
  })

  test('the latest snapshot is the current one', () => {
    const older: Snapshot = { ...exampleSnapshot, takenOn: '2026-06-30' }
    expect(board(modelOf({ snapshots: [older, exampleSnapshot] })).dateLabel).toBe('Chiffres du 30 septembre')
  })

  test('a small change keeps its decimal: 0,6 % is never rounded to 1 % nor to 0', () => {
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2024-01-31', entries: [amountEntry('current-line', 203_220)] }
    const b = board(modelOf({ snapshots: [first, exampleSnapshot] }))
    expect(plain(b.progress?.change?.euros ?? null)).toMatch(/^[-−]1 220 €$/)
    expect(plain(b.progress?.change?.percent ?? null)).toMatch(/^[-−]0,6 %$/)
  })

  test('a change under one percent is not rounded to zero', () => {
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2024-01-31', entries: [amountEntry('current-line', 202_500)] }
    const b = board(modelOf({ snapshots: [first, exampleSnapshot] }))
    expect(plain(b.progress?.change?.euros ?? null)).toMatch(/^[-−]500 €$/)
    expect(plain(b.progress?.change?.percent ?? null)).toMatch(/^[-−]0,2 %$/)
  })

  test('debts with nothing owned are not « nothing entered »', () => {
    const profile = profileOf([account('loan', 'loan')], [line('loan-l', 'loan')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('loan-l', 3_000)])] }))
    expect(b.noGridSentence).toMatch(/dépasse ce que tu possèdes/)
    expect(plain(b.ownedSentence)).toBe('Tu possèdes 0 € et tu dois encore 3 000 €.')
  })

  test('owned equal to owed has its own sentence', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan')],
      [line('cur-l', 'cur'), line('loan-l', 'loan')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 3_000), amountEntry('loan-l', 3_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.noGridSentence).toBe(
      'Pour l’instant, ce que tu dois est égal à ce que tu possèdes\u00A0: la grille apparaîtra dès que ce qui est à toi sera positif.',
    )
  })

  test('nothing entered at all', () => {
    const b = board(modelOf({ snapshots: [snapshotOf([])] }))
    expect(b.noGridSentence).toBe('Pour l’instant, aucun montant n’est saisi\u00A0: la grille apparaîtra avec ton premier montant.')
    expect(b.ownedSentence).toBeNull()
  })

  test('a loan that does not finance a home says « à rembourser »', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan')],
      [line('cur-l', 'cur'), line('loan-l', 'loan')],
    )
    const snap = snapshotOf([amountEntry('cur-l', 9_000), amountEntry('loan-l', 3_000)])
    expect(plain(board(modelOf({ profile, snapshots: [snap] })).ownedSentence)).toBe(
      'Tu possèdes 9 000 €, dont 3 000 € encore à rembourser.',
    )
  })

  test('a goal that starts after today is ignored', () => {
    const future: GoalAllocation = { ...balanced, validFrom: '2027-01-01', shares: GOAL_PRESETS.prudent.shares }
    const b = board(modelOf({ goals: [balanced, future] }))
    expect(b.categories.find((c) => c.category === 'available')?.goal?.target).toBe(10)
    expect(board(modelOf({ goals: [future] })).goals).toBeNull()
  })

  test('with only a home there is nothing to compare, and it is said', () => {
    const profile = profileOf([account('h', 'home')], [line('h-l', 'h')])
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('h-l', 100_000)])] }))
    expect(b.goals).toBeNull()
    expect(b.categories.every((c) => c.goal === null)).toBe(true)
    expect(b.warnings).toContain(
      'Tes objectifs portent sur ce qui n’est pas chez toi\u00A0: rien à comparer pour l’instant.',
    )
  })
})

describe('the other states', () => {
  test('no profile at all is the first launch', () => {
    expect(monArgentView(modelOf({ profile: null, snapshots: [] }), TODAY)).toEqual({ kind: 'first-launch' })
  })

  test('an unreadable profile is never the first launch', () => {
    expect(monArgentView(modelOf({ profile: null, snapshots: [], unreadable: { profile: 1 } }), TODAY)).toEqual({
      kind: 'unreadable-profile',
    })
  })

  test('a first launch in progress offers to resume', () => {
    const profile: Profile = { ...exampleProfile, firstLaunch: { planned: [], finished: ['home'], complete: false } }
    expect(monArgentView(modelOf({ profile }), TODAY)).toMatchObject({ kind: 'resume', remaining: 2, onlyBanks: true })
  })

  test('a half-done launch with a dollar line whose rate is gone says so, without an error', () => {
    const profile: Profile = {
      ...profileOf([account('cur', 'current')], [line('cur-l', 'cur', { currency: 'USD' })]),
      firstLaunch: { planned: [], finished: [], complete: false },
    }
    const view = monArgentView(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 1_000)])] }), TODAY)
    expect(view.kind).toBe('resume')
    if (view.kind !== 'resume') return
    expect(view.entered.flatMap((e) => e.accounts.map((a) => a.amount))).toEqual(['taux de change manquant'])
  })

  test('remaining employee savings is not only banks', () => {
    const profile: Profile = {
      ...exampleProfile,
      establishments: [
        ...exampleProfile.establishments,
        { id: 'es', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' },
      ],
      firstLaunch: { planned: [], finished: ['boursobank', 'linxea', 'home'], complete: false },
    }
    expect(monArgentView(modelOf({ profile }), TODAY)).toMatchObject({ kind: 'resume', remaining: 1, onlyBanks: false })
  })

  test('with no snapshot yet, every account is still to be filled in', () => {
    const profile: Profile = { ...exampleProfile, firstLaunch: { planned: [], finished: [], complete: false } }
    const view = monArgentView(modelOf({ profile, snapshots: [] }), TODAY)
    expect(view).toMatchObject({ kind: 'resume', remaining: 3 })
    if (view.kind !== 'resume') throw new Error('expected resume')
    expect(view.entered.flatMap((e) => e.accounts.map((a) => a.amount))).toEqual(Array(7).fill('montant à saisir'))
  })

  test('everything finished but not revealed', () => {
    const profile: Profile = {
      ...exampleProfile,
      firstLaunch: { planned: [], finished: ['boursobank', 'linxea', 'home'], complete: false },
    }
    expect(monArgentView(modelOf({ profile }), TODAY)).toEqual({ kind: 'reveal-pending' })
  })

  test('a complete first launch with no snapshot is inconsistent', () => {
    expect(monArgentView(modelOf({ snapshots: [] }), TODAY)).toEqual({ kind: 'error', reason: 'inconsistent' })
  })

  test('a dollar entry without a rate is said on the board (D9), not an error screen', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur', { currency: 'USD' })])
    const snap = snapshotOf([amountEntry('cur-l', 1_000)])
    const b = board(modelOf({ profile, snapshots: [snap] }))
    expect(b.net).toBeNull()
    expect(b.grid.kind).toBe('none')
    expect(b.noGridSentence).toBe('Aucun montant n’est compté\u00A0: le taux de change de « cur-l » manque.')
    expect(b.warnings).toEqual([])
    // Nothing is counted: no category would open on a total that is unknown, not zero.
    expect(b.withoutSquares).toEqual([])
    // Its fiche opens from the board all the same.
    expect(b.leftOut).toEqual([{ lineId: 'cur-l', name: 'cur-l' }])
  })

  test('a line no rate converts, alone in its category, opens its fiche from the board', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('pea', 'pea')],
      [line('cur-l', 'cur'), line('us-l', 'pea', { name: 'Revolut', kind: 'units', currency: 'USD' })],
    )
    const snap = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('us-l', 10, 100, null)], {})
    const b = board(modelOf({ profile, snapshots: [snap], goals: [] }))
    expect(b.warnings).toContain('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
    expect(b.leftOut).toEqual([{ lineId: 'us-l', name: 'Revolut' }])
    // Its category holds nothing that is counted: it does not open on an unknown total.
    expect(b.withoutSquares).toEqual([])
    expect(board(modelOf({})).leftOut).toEqual([])
  })

  test('a loan no rate converts is left out too, and named with its id', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan')],
      [line('cur-l', 'cur'), line('loan-l', 'loan', { name: 'Prêt en francs suisses', currency: 'CHF' })],
    )
    const b = board(modelOf({ profile, snapshots: [snapshotOf([amountEntry('cur-l', 1_000), amountEntry('loan-l', 500)], {})] }))
    expect(b.leftOut).toEqual([{ lineId: 'loan-l', name: 'Prêt en francs suisses' }])
  })

  test('an entry for an unknown line is inconsistent', () => {
    const snap = snapshotOf([amountEntry('nope', 1_000)])
    expect(monArgentView(modelOf({ snapshots: [snap] }), TODAY)).toEqual({ kind: 'error', reason: 'inconsistent' })
  })

  test('every snapshot unreadable is said as unreadable', () => {
    expect(monArgentView(modelOf({ snapshots: [], unreadable: { snapshots: 2 } }), TODAY)).toEqual({
      kind: 'error',
      reason: 'unreadable',
    })
  })

  test('an empty profile with an unfinished launch is a launch not begun', () => {
    const profile: Profile = {
      schema: 1,
      establishments: [],
      accounts: [],
      lines: [],
      firstLaunch: { planned: [], finished: [], complete: false },
    }
    expect(monArgentView(modelOf({ profile, snapshots: [] }), TODAY)).toEqual({ kind: 'first-launch' })
  })

  test('a launch in progress shows what has been entered, establishment by establishment, and no grid', () => {
    const profile: Profile = { ...exampleProfile, firstLaunch: { planned: [], finished: ['home'], complete: false } }
    const view = monArgentView(modelOf({ profile }), TODAY)
    if (view.kind !== 'resume') throw new Error(`expected resume, got ${view.kind}`)
    expect(Object.keys(view).sort()).toEqual(['entered', 'kind', 'onlyBanks', 'remaining'])
    expect(shown(view.entered)).toEqual([
      {
        establishment: 'Chez toi',
        status: 'done',
        accounts: [
          { name: 'Maison', amount: '300 000 €' },
          { name: 'Crédit', amount: '180 000 €' },
          { name: 'Or', amount: '2 000 €' },
        ],
      },
      {
        establishment: 'BoursoBank',
        status: 'current',
        accounts: [
          { name: 'Compte courant', amount: '8 000 €' },
          { name: 'Livret A', amount: '12 000 €' },
          { name: 'PEA', amount: '25 000 €' },
        ],
      },
      { establishment: 'Linxea', status: 'todo', accounts: [{ name: 'Assurance-vie', amount: '35 000 €' }] },
    ])
  })

  test('every step is listed, a step not started with no account, and the entries carry the establishment id', () => {
    const profile: Profile = {
      schema: 1,
      establishments: [
        { id: 'home', name: 'Chez toi', kind: 'home' },
        { id: 'bourso', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
        { id: 'lcl', name: 'LCL', kind: 'institution', catalogId: 'lcl' },
      ],
      accounts: [
        { id: 'house', establishmentId: 'home', type: 'home', name: 'Logement' },
        { id: 'livret', establishmentId: 'bourso', type: 'livret-a', name: 'Livret A' },
      ],
      lines: [
        { id: 'house-line', accountId: 'house', name: 'Logement', kind: 'amount', currency: 'EUR' },
        { id: 'livret-line', accountId: 'livret', name: 'Livret A', kind: 'amount', currency: 'EUR' },
      ],
      firstLaunch: { planned: [], finished: ['home'], complete: false },
    }
    const snapshot = snapshotOf([amountEntry('house-line', 300_000), amountEntry('livret-line', 10_000)])
    const view = monArgentView(modelOf({ profile, snapshots: [snapshot] }), TODAY)
    if (view.kind !== 'resume') throw new Error(`expected resume, got ${view.kind}`)
    expect(shown(view.entered)).toEqual([
      { establishment: 'Chez toi', status: 'done', accounts: [{ name: 'Logement', amount: '300 000 €' }] },
      { establishment: 'BoursoBank', status: 'current', accounts: [{ name: 'Livret A', amount: '10 000 €' }] },
      { establishment: 'LCL', status: 'todo', accounts: [] },
    ])
    expect(view.entered.map((e) => e.id)).toEqual(['home', 'bourso', 'lcl'])
  })

  test('an account without a value says so; an establishment with no account is still listed', () => {
    const profile: Profile = {
      ...exampleProfile,
      establishments: [...exampleProfile.establishments, { id: 'fortuneo', name: 'Fortuneo', kind: 'institution', catalogId: 'fortuneo' }],
      firstLaunch: { planned: [], finished: [], complete: false },
    }
    const snapshot: Snapshot = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'gold-line') }
    const view = monArgentView(modelOf({ profile, snapshots: [snapshot] }), TODAY)
    if (view.kind !== 'resume') throw new Error(`expected resume, got ${view.kind}`)
    expect(view.entered.map((e) => e.establishment)).toEqual(['Chez toi', 'BoursoBank', 'Linxea', 'Fortuneo'])
    expect(view.entered[0].accounts.find((a) => a.name === 'Or')?.amount).toBe('montant à saisir')
  })

  test('an entry half-saved with another kind than its line is left out, as resuming does', () => {
    const profile: Profile = { ...exampleProfile, firstLaunch: { planned: [], finished: [], complete: false } }
    const snapshot: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'gold-line' ? unitsEntry('gold-line', 1, 2_000, null) : e)),
    }
    const view = monArgentView(modelOf({ profile, snapshots: [snapshot] }), TODAY)
    if (view.kind !== 'resume') throw new Error(`expected resume, got ${view.kind}`)
    expect(view.entered[0].accounts.find((a) => a.name === 'Or')?.amount).toBe('montant à saisir')
  })
})

describe('the dates of banks not reviewed', () => {
  const late: Snapshot = {
    ...exampleSnapshot,
    takenOn: '2026-11-07',
    entries: exampleSnapshot.entries.map((e) => ({
      ...e,
      seenOn: e.lineId === 'euro-fund' || e.lineId === 'life-uc' || e.lineId === 'house-line' ? '2026-09-30' : '2026-11-07',
    })),
  }

  test('an update where Linxea was not reviewed says so; the house is not listed', () => {
    expect(plain(board(modelOf({ snapshots: [exampleSnapshot, late] })).dateLabel)).toBe(
      'Chiffres du 7 novembre · 1 banque pas revue depuis le 30 septembre',
    )
  })

  // F7: a bank is behind only when nothing of it was seen since the previous snapshot.
  const seenOn = (snapshot: Snapshot, takenOn: string, dates: (lineId: string) => string): Snapshot => ({
    ...snapshot,
    takenOn,
    entries: snapshot.entries.map((e) => ({ ...e, seenOn: dates(e.lineId) })),
  })
  const atBoursoBank = new Set(['current-line', 'livret-a-line', 'etf'])
  // The first launch, over two days: BoursoBank on the 4th, the rest on the 5th.
  const firstLaunch = seenOn(exampleSnapshot, '2026-11-05', (id) => (atBoursoBank.has(id) ? '2026-11-04' : '2026-11-05'))

  test('a first launch spread over two days: no bank date', () => {
    expect(plain(board(modelOf({ snapshots: [firstLaunch] })).dateLabel)).toBe('Chiffres du 5 novembre')
  })

  test('an update that skipped BoursoBank: its date is shown', () => {
    const update = seenOn(firstLaunch, '2026-11-06', (id) => (atBoursoBank.has(id) ? '2026-11-04' : '2026-11-06'))
    expect(plain(board(modelOf({ snapshots: [firstLaunch, update] })).dateLabel)).toBe(
      'Chiffres du 6 novembre · 1 banque pas revue depuis le 4 novembre',
    )
  })
})

describe('the update', () => {
  test('is available and not pending on the example', () => {
    expect(board(modelOf({})).update).toEqual({ available: true, pending: false })
  })

  test('a draft based on the latest snapshot is pending', () => {
    expect(board(modelOf({ draftBasedOn: 's0' })).update).toEqual({ available: true, pending: true })
  })

  test('a draft based on an older snapshot is not pending', () => {
    const b = board(modelOf({ snapshots: [exampleSnapshot, { ...exampleSnapshot, takenOn: '2026-10-31' }], draftBasedOn: 's0' }))
    expect(b.update.pending).toBe(false)
  })

  // R22: nothing has been erased, so the button stays active and /mise-a-jour offers « Recommencer ».
  test('an unreadable draft stays available, is not pending, and says so', () => {
    const b = board(modelOf({ unreadable: { draft: 1 } }))
    expect(b.update).toEqual({ available: true, pending: false })
    expect(b.warnings).toContain(DRAFT_UNREADABLE)
  })

  test('snapshots that cannot be read make the update unavailable', () => {
    expect(board(modelOf({ unreadable: { snapshots: 1 } })).update.available).toBe(false)
  })
})

describe('the board at today’s prices', () => {
  const NOW = '2026-11-08'
  const quoted: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }
  const quote = { price: 260, currency: 'EUR', asOf: '2026-11-06' }
  const market = (quotes: Market['quotes'], rates: Market['rates'] = null): Market => ({ quotes, rates })
  const at = (model: Model, m?: Market | null) => {
    const view = monArgentView(model, NOW, m)
    if (view.kind !== 'board') throw new Error(`expected a board, got ${view.kind}`)
    return view
  }
  const netOf = (b: Board) => Number(plain(b.net)!.replace(/[^\d-]/g, ''))

  test('a quoted line moves, the net rises by 1 000 €, and both dates are said', () => {
    const model = modelOf({ profile: quoted })
    const without = at(model)
    const withPrice = at(model, market({ 'CW8.PA': quote }))
    expect(netOf(withPrice) - netOf(without)).toBe(1_000)
    expect(withPrice.dateLabel).toBe('Cours du jour pour tes actions · le reste au 30 septembre')
    expect(without.dateLabel).toBe('Chiffres du 30 septembre')
    expect(withPrice.warnings).toEqual([])
  })

  test('no market, or a null market, is the snapshot as it was', () => {
    const model = modelOf({ profile: quoted })
    expect(at(model, null)).toEqual(at(model))
  })

  test('a snapshot of the day: the price moves and there is one date', () => {
    const model = modelOf({ profile: quoted, snapshots: [{ ...exampleSnapshot, takenOn: NOW }] })
    const b = at(model, market({ 'CW8.PA': { ...quote, asOf: NOW } }))
    expect(b.dateLabel).toBe('Chiffres du 8 novembre')
    expect(netOf(b)).toBe(203_000)
  })

  test('a price that failed is said, and nothing is shown as the day’s', () => {
    const b = at(modelOf({ profile: quoted }), market({ 'CW8.PA': null }))
    expect(plain(b.net)).toBe('202 000 €')
    expect(b.dateLabel).toBe('Chiffres du 30 septembre')
    expect(b.warnings).toContain('Le prix du jour de « ETF » n’a pas pu être récupéré\u00A0: il reste au prix du 30 septembre.')
  })

  test('a stale price is said too', () => {
    const b = at(modelOf({ profile: quoted }), market({ 'CW8.PA': { ...quote, asOf: '2026-10-01' } }))
    expect(plain(b.net)).toBe('202 000 €')
    expect(b.warnings).toContain('Le prix du jour de « ETF » n’a pas pu être récupéré\u00A0: il reste au prix du 30 septembre.')
  })

  // F4: the price came, in dollars, and no rate converts it into the line's euros.
  test('a dollar price on a euro line with no rate: the rate is said, never the price', () => {
    const b = at(modelOf({ profile: quoted }), market({ 'CW8.PA': { ...quote, currency: 'USD' } }))
    expect(plain(b.net)).toBe('202 000 €')
    expect(b.dateLabel).toBe('Chiffres du 30 septembre')
    expect(b.warnings).toEqual([
      'Le taux de change pour « ETF » n’a pas pu être récupéré\u00A0: son prix reste celui de ton relevé.',
    ])
  })

  // F5: the update was saved yesterday; a fund priced once a week last had a price 9 days ago.
  test('a fund priced once a week, right after an update: nothing is said to have failed', () => {
    const yesterday: Snapshot = { ...exampleSnapshot, takenOn: '2026-11-07' }
    const b = at(modelOf({ profile: quoted, snapshots: [yesterday] }), market({ 'CW8.PA': { ...quote, asOf: '2026-10-30' } }))
    expect(b.dateLabel).toBe('Chiffres du 7 novembre')
    expect(b.warnings).toEqual([])
  })

  test('banks behind follow the first date', () => {
    const profile: Profile = {
      ...quoted,
      establishments: [...quoted.establishments, { id: 'old', name: 'Linxea', kind: 'institution' as const, catalogId: 'linxea' }],
      accounts: [...quoted.accounts, account('old-a', 'livret-a', { establishmentId: 'old' })],
      lines: [...quoted.lines, line('old-l', 'old-a')],
    }
    const previous: Snapshot = { ...exampleSnapshot, takenOn: '2026-08-31', entries: [...exampleSnapshot.entries, amountEntry('old-l', 1_000, '2026-08-31')] }
    const latest: Snapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('old-l', 1_000, '2026-08-31')] }
    const b = at(modelOf({ profile, snapshots: [previous, latest] }), market({ 'CW8.PA': quote }))
    expect(b.dateLabel).toBe('Cours du jour pour tes actions · le reste au 30 septembre · 1 banque pas revue depuis le 31 août')
  })

  test('R7: with one saved snapshot there is no « depuis », even with today’s prices', () => {
    const b = at(modelOf({ profile: quoted }), market({ 'CW8.PA': quote }))
    expect(b.progress).toBeNull()
  })

  test('with two saved snapshots, the first is compared with the figures shown', () => {
    const first: Snapshot = { ...exampleSnapshot, takenOn: '2026-01-15' }
    const model = modelOf({ profile: quoted, snapshots: [first, exampleSnapshot] })
    const b = at(model, market({ 'CW8.PA': quote }))
    // Today's price moves the net shown, and the progress under it moves with it: 10 parts × 10 €.
    expect(plain(b.progress!.change!.euros)).toBe('+1 000 €')
    // This year: the month alone, as in Évolution.
    expect(b.progress!.firstLabel).toBe('janvier')
  })

  test('the rates stay the snapshot’s: a dollar line keeps its rate and is not an error', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'pea')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD', kind: 'units', quoteSymbol: 'AAPL' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('us-l', 10, 100, null)], { USD: 0.5 })
    const b = at(
      modelOf({ profile, snapshots: [snapshot] }),
      market({ AAPL: { price: 200, currency: 'USD', asOf: '2026-11-07' } }, { on: '2026-11-07', perEuro: { USD: 1.25 } }),
    )
    // 10 × 200 $ at the snapshot’s 0,5 = 1 000 €, plus 1 000 €.
    expect(netOf(b)).toBe(2_000)
  })

  test('D9: a line with no rate is said, left out of the grid, and the board stays a board', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'current')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('us-l', 500)], {})
    const b = at(modelOf({ profile, snapshots: [snapshot] }))
    expect(plain(b.net)).toBe('1 000 €')
    expect(b.noGridSentence).toBeNull()
    expect(b.warnings).toContain('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
  })

  test('a first snapshot with a line no rate converts gives no « depuis », not an error', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'current')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD' })],
    )
    const first: Snapshot = { ...snapshotOf([amountEntry('cur-l', 500), amountEntry('us-l', 100)], {}), takenOn: '2026-01-15' }
    const latest = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('us-l', 100)], { USD: 0.5 })
    expect(at(modelOf({ profile, snapshots: [first, latest] })).progress).toBeNull()
  })

  test('a priced line that is then left out for want of a rate does not make the day’s date', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'pea')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD', kind: 'units', quoteSymbol: 'AAPL' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('us-l', 10, 100, null)], {})
    // The quote is in dollars and the line too: the price is taken, but no rate converts the line.
    const b = at(modelOf({ profile, snapshots: [snapshot] }), market({ AAPL: { price: 200, currency: 'USD', asOf: '2026-11-07' } }))
    expect(b.dateLabel).toBe('Chiffres du 30 septembre')
    expect(b.warnings).toContain('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
  })

  test('a pending draft and a market: Mon argent shows the saved snapshot at today’s prices, no draft figure', () => {
    const withDraft = at(modelOf({ profile: quoted, draftBasedOn: 's0' }), market({ 'CW8.PA': quote }))
    const without = at(modelOf({ profile: quoted }), market({ 'CW8.PA': quote }))
    expect(withDraft.update.pending).toBe(true)
    expect({ ...withDraft, update: without.update }).toEqual(without)
  })
})
