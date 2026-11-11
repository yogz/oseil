import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, line, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Market } from '@/lib/market/types'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid } from '@/lib/model/squares'
import type { Account, Budget, Establishment, Line, Profile, Settings, Snapshot } from '@/lib/model/types'
import { reperesView, type ReperesView } from '@/lib/screens/reperes'
import { directShareFact, homeBuyingSentence } from '@/lib/screens/reperes-words'

const TODAY = '2026-11-06'
const plain = (text: string | null | undefined) => text?.replace(/[  ]/g, ' ') ?? ''
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

const A: Establishment = { id: 'a', name: 'Banque A', kind: 'institution' }
const B: Establishment = { id: 'b', name: 'Banque B', kind: 'institution' }
const HOME: Establishment = { id: 'h', name: 'Chez toi', kind: 'home' }
const EMPLOYER: Establishment = { id: 'emp', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' }

const marketOf = (quotes: Market['quotes']): Market => ({ quotes, rates: null })
const at = (establishmentId: string, a: Account): Account => ({ ...a, establishmentId })

function modelOf(parts: {
  establishments: Establishment[]
  accounts: Account[]
  lines: Line[]
  snapshot: Snapshot
  budget?: Budget | null
  firstLaunchComplete?: boolean
  unreadable?: Partial<Model['unreadable']>
}): Model {
  const profile: Profile = {
    schema: 1,
    establishments: parts.establishments,
    accounts: parts.accounts,
    lines: parts.lines,
    ...(parts.firstLaunchComplete === false ? { firstLaunch: { planned: [], finished: [], complete: false } } : {}),
  }
  const settings: Settings | null =
    parts.budget === undefined ? null : { schema: 1, budget: parts.budget, display: 'euros', hideAmounts: false }
  return {
    profile: loaded(profile),
    snapshots: [loaded(parts.snapshot, 's0')],
    goals: [],
    settings: settings ? loaded(settings) : null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0, ...parts.unreadable },
  }
}

function ready(model: Model, market = null as Parameters<typeof reperesView>[2]): Extract<ReperesView, { kind: 'ready' }> {
  const view = reperesView(model, TODAY, market)
  if (view.kind !== 'ready') throw new Error(`expected ready, got ${view.kind}`)
  return view
}

// 11 000 € available and 2 000 € a month: 5,5 months.
const cushionModel = (budget: Budget | null | undefined) =>
  modelOf({
    establishments: [A],
    accounts: [at('a', account('cur', 'current'))],
    lines: [line('cur-line', 'cur')],
    snapshot: snapshotOf([amountEntry('cur-line', 11_000)]),
    budget,
  })

describe('the cushion', () => {
  test('with no budget, says how to get it and never 0 months', () => {
    for (const budget of [undefined, null]) {
      const view = ready(cushionModel(budget))
      expect(view.cushion).toEqual({ missing: 'Indique tes dépenses dans les Réglages pour le calculer.' })
    }
  })

  test('counts in months of dépenses, 5,5 months fills 5 of the 12 squares', () => {
    const view = ready(cushionModel({ basis: 'expenses', monthly: 200_000 }))
    expect(view.cushion).toEqual({
      sentence: "Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ 5 mois et demi de dépenses.",
      months: 5.5,
      filled: 5,
    })
  })

  test('counts in months of salaire when that is what was given', () => {
    const view = ready(cushionModel({ basis: 'salary', monthly: 550_000 }))
    expect(view.cushion).toMatchObject({
      sentence: "Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ 2 mois de salaire.",
      months: 2,
      filled: 2,
    })
  })

  test('never fills more than 12 squares', () => {
    const view = ready(cushionModel({ basis: 'expenses', monthly: 50_000 }))
    expect(view.cushion).toMatchObject({ months: 22, filled: 12 })
  })
})

describe('what can be had back quickly', () => {
  const withEmployeeSavings = (unlockOn: string | undefined) =>
    modelOf({
      establishments: [A, EMPLOYER],
      accounts: [
        at('a', account('cur', 'current')),
        at('emp', account('pee', 'employee-savings', unlockOn ? { unlockOn } : {})),
      ],
      lines: [line('cur-line', 'cur'), line('pee-line', 'pee')],
      snapshot: snapshotOf([amountEntry('cur-line', 10_000), amountEntry('pee-line', 10_000)]),
    })

  test('a PEE whose year has passed counts', () => {
    const quick = ready(withEmployeeSavings('2026-01-01')).quick!
    expect(quick.lit).toBe(100)
    expect(quick.total).toBe(100)
  })

  test('a PEE with no year, or one still to come, does not', () => {
    for (const unlockOn of [undefined, '2029-01-01']) {
      const quick = ready(withEmployeeSavings(unlockOn)).quick!
      expect(quick.lit).toBe(50)
      expect(quick.total).toBe(100)
      expect(plain(quick.sentence)).toContain('10 000 €')
      expect(quick.sentence).toContain('bloqué chez ton employeur')
    }
  })

  test('a home with no PER and no employer savings adds no home-buying sentence', () => {
    const view = ready(
      modelOf({
        establishments: [A, HOME],
        accounts: [at('a', account('cur', 'current')), at('h', account('house', 'home'))],
        lines: [line('cur-line', 'cur'), line('house-line', 'house')],
        snapshot: snapshotOf([amountEntry('cur-line', 50_000), amountEntry('house-line', 40_000)]),
      }),
    )
    expect(plain(view.quick!.sentence)).not.toContain('résidence principale')
  })

  test('nothing quick keeps its sentence, even with a PER', () => {
    const view = ready(
      modelOf({
        establishments: [A],
        accounts: [at('a', account('per', 'per'))],
        lines: [line('per-line', 'per')],
        snapshot: snapshotOf([amountEntry('per-line', 10_000)]),
      }),
    )
    expect(plain(view.quick!.sentence)).toBe('Rien de ce qui est à toi n’est récupérable vite pour l’instant.')
  })

  test('the home and a PER are left out, and the sentence names where they are', () => {
    const view = ready(
      modelOf({
        establishments: [A, HOME],
        accounts: [
          at('a', account('cur', 'current')),
          at('a', account('per', 'per')),
          at('h', account('house', 'home')),
        ],
        lines: [line('cur-line', 'cur'), line('per-line', 'per'), line('house-line', 'house')],
        snapshot: snapshotOf([amountEntry('cur-line', 50_000), amountEntry('per-line', 10_000), amountEntry('house-line', 40_000)]),
      }),
    )
    expect(view.quick!.lit).toBe(50)
    expect(plain(view.quick!.sentence)).toBe(
      'Presque la moitié de ce qui est à toi, 50 000 €, en quelques semaines si besoin. Le reste est dans ton logement et une petite part attend ta retraite.'
        + ' Un PER peut aussi se débloquer, dans certains cas, pour acheter ta résidence principale.',
    )
  })

  describe('an account marked slow', () => {
    const withOther = (slow: boolean, otherAmount = 50_000) =>
      modelOf({
        establishments: [A],
        accounts: [
          at('a', account('cur', 'current')),
          at('a', account('shares', 'other', slow ? { slow: true } : {})),
          at('a', account('fund', 'other')),
        ],
        lines: [
          line('cur-line', 'cur'),
          line('shares-line', 'shares', { category: 'markets' }),
          line('fund-line', 'fund', { category: 'secured' }),
        ],
        snapshot: snapshotOf([amountEntry('cur-line', 25_000), amountEntry('shares-line', otherAmount), amountEntry('fund-line', 25_000)]),
      })

    test('does not count, while another account of the same type still does', () => {
      expect(ready(withOther(false)).quick!.lit).toBe(100)
      const quick = ready(withOther(true)).quick!
      expect(quick.lit).toBe(50)
      expect(plain(quick.sentence)).toContain('50 000 €')
    })

    test('alone, the sentence says the rest is hard to sell fast', () => {
      expect(plain(ready(withOther(true)).quick!.sentence)).toBe(
        'Presque la moitié de ce qui est à toi, 50 000 €, en quelques semaines si besoin. Le reste est difficile à revendre vite.',
      )
    })

    test('a small one is « une petite part », and joins the others in « A, B et C »', () => {
      const model = modelOf({
        establishments: [A, HOME],
        accounts: [
          at('a', account('cur', 'current')),
          at('a', account('shares', 'other', { slow: true })),
          at('h', account('house', 'home')),
        ],
        lines: [line('cur-line', 'cur'), line('shares-line', 'shares', { category: 'markets' }), line('house-line', 'house')],
        snapshot: snapshotOf([amountEntry('cur-line', 80_000), amountEntry('shares-line', 5_000), amountEntry('house-line', 40_000)]),
      })
      expect(plain(ready(model).quick!.sentence)).toContain(
        'Le reste est dans ton logement et une petite part est difficile à revendre vite.',
      )
    })
  })

  test('a loan lowers what it finances, so the home is worth its net in the grid', () => {
    const view = ready(
      modelOf({
        establishments: [A, HOME],
        accounts: [
          at('a', account('cur', 'current')),
          at('h', account('house', 'home')),
          at('a', account('loan', 'loan', { financedLineId: 'house-line' })),
        ],
        lines: [line('cur-line', 'cur'), line('house-line', 'house'), line('loan-line', 'loan')],
        snapshot: snapshotOf([amountEntry('cur-line', 50_000), amountEntry('house-line', 150_000), amountEntry('loan-line', 100_000)]),
      }),
    )
    // 50 000 available + 150 000 − 100 000 of house: half and half.
    expect(view.quick!.lit).toBe(50)
  })

  test('without a grid there is no small grid', () => {
    const view = ready(
      modelOf({
        establishments: [A],
        accounts: [at('a', account('cur', 'current'))],
        lines: [line('cur-line', 'cur')],
        snapshot: snapshotOf([amountEntry('cur-line', 0)]),
      }),
    )
    expect(view.quick).toBeNull()
  })
})

describe('bon à savoir', () => {
  const airLiquide = (second: string) =>
    modelOf({
      establishments: [A, B],
      accounts: [at('a', account('pea', 'pea')), at('b', account('ct', 'securities'))],
      lines: [
        line('al-pea', 'pea', { kind: 'units', name: 'Air Liquide' }),
        line('al-ct', 'ct', { kind: 'units', name: second }),
      ],
      snapshot: snapshotOf([unitsEntry('al-pea', 100, 100, null), unitsEntry('al-ct', 50, 100, null)]),
    })

  test('the same holding on two accounts is one fact, its name compared without case or spaces', () => {
    const view = ready(airLiquide('  air  LIQUIDE'))
    expect(view.facts.map(plain)).toEqual(['Tu détiens « Air Liquide » sur deux comptes différents, 15 000 € en tout.'])
  })

  test('two different funds with similar names are not the same holding', () => {
    expect(ready(airLiquide('Air Liquide Europe')).facts).toEqual([])
    expect(ready(airLiquide('Air Liquid')).facts).toEqual([])
  })

  test('the same name twice on one account is not several accounts', () => {
    const view = ready(
      modelOf({
        establishments: [A],
        accounts: [at('a', account('pea', 'pea'))],
        lines: [line('x1', 'pea', { kind: 'units', name: 'Fonds' }), line('x2', 'pea', { kind: 'units', name: 'fonds' })],
        snapshot: snapshotOf([unitsEntry('x1', 1, 100, null), unitsEntry('x2', 1, 100, null)]),
      }),
    )
    expect(view.facts).toEqual([])
  })

  test('at most four facts, in the order home, same holding, employer, share', () => {
    const view = ready(
      modelOf({
        establishments: [A, B, HOME, EMPLOYER],
        accounts: [
          at('a', account('pea', 'pea')),
          at('b', account('ct', 'securities')),
          at('h', account('house', 'home')),
          at('emp', account('pee', 'employee-savings')),
        ],
        lines: [
          line('al-pea', 'pea', { kind: 'units', name: 'Air Liquide', quoteSymbol: 'AI.PA' }),
          line('al-ct', 'ct', { kind: 'units', name: 'Air Liquide', quoteSymbol: 'AI.PA' }),
          line('house-line', 'house'),
          line('pee-line', 'pee'),
        ],
        snapshot: snapshotOf([
          unitsEntry('al-pea', 100, 100, null),
          unitsEntry('al-ct', 50, 100, null),
          amountEntry('house-line', 100_000),
          amountEntry('pee-line', 5_000),
        ]),
      }),
      marketOf({ 'AI.PA': { price: 100, currency: 'EUR', asOf: TODAY, kind: 'action' } }),
    )
    expect(view.facts).toHaveLength(4)
    expect(view.facts[0]).toMatch(/^Ton logement représente/)
    expect(view.facts[1]).toMatch(/^Tu détiens « Air Liquide »/)
    expect(view.facts[2]).toMatch(/^Une (petite )?partie de ce qui est à toi hors de ton logement est placée chez ton employeur/)
    expect(view.facts[3]).toMatch(/^Ta plus grosse action en direct, Air Liquide, /)
  })
})

describe('the biggest direct share', () => {
  const action = { price: 100, currency: 'EUR', asOf: TODAY, kind: 'action' } as const
  const SHARE = /^Ta plus grosse action en direct, /

  test('says the squares, or all of them', () => {
    expect(directShareFact('Air Liquide', 9, 30)).toBe('Ta plus grosse action en direct, Air Liquide, occupe 9 de tes 30 carrés de bourse.')
    expect(directShareFact('Air Liquide', 30, 30)).toBe('Ta plus grosse action en direct, Air Liquide, occupe tous tes carrés de bourse.')
    expect(directShareFact('Air Liquide', 1, 30)).toBe('Ta plus grosse action en direct, Air Liquide, occupe 1 de tes 30 carrés de bourse.')
  })

  const build = (extra: { line?: Partial<Line>; symbol?: string | null; second?: boolean; amount?: number } = {}) =>
    modelOf({
      establishments: [A, B],
      accounts: [at('a', account('pea', 'pea')), at('b', account('ct', 'securities')), at('a', account('cur', 'current'))],
      lines: [
        line('al-pea', 'pea', {
          kind: 'units',
          name: 'Air Liquide',
          ...(extra.symbol === null ? {} : { quoteSymbol: extra.symbol ?? 'AI.PA' }),
          ...extra.line,
        }),
        line('al-ct', 'ct', { kind: 'units', name: 'Air Liquide ordinaire', quoteSymbol: 'AI.PA' }),
        line('other', 'pea', { kind: 'units', name: 'Autre', quoteSymbol: 'XX.PA' }),
        line('cur-line', 'cur'),
      ],
      snapshot: snapshotOf([
        unitsEntry('al-pea', 100, 100, null),
        ...(extra.second === false ? [] : [unitsEntry('al-ct', 50, 100, null)]),
        unitsEntry('other', 30, 100, null),
        amountEntry('cur-line', extra.amount ?? 20_000),
      ]),
    })

  test('two lines of the same symbol add their squares into one fact', () => {
    const model = build()
    const view = ready(model, marketOf({ 'AI.PA': action, 'XX.PA': null }))
    const shares = view.facts.filter((f) => SHARE.test(f))
    expect(shares).toHaveLength(1)
    const profile = model.profile!.value
    const situation = computeSituation(profile, model.snapshots[0].value)
    const grid = buildGrid(situation)
    if (grid.kind !== 'grid') throw new Error('no grid')
    const markets = grid.categories.find((c) => c.category === 'markets')!
    const n = markets.lines.filter((l) => l.lineId === 'al-pea' || l.lineId === 'al-ct').reduce((s, l) => s + l.squares, 0)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(plain(shares[0])).toBe(plain(directShareFact('Air Liquide', n, markets.squares)))
  })

  test('equal squares: the symbol with the greater value is named', () => {
    const model = modelOf({
      establishments: [A],
      accounts: [at('a', account('pea', 'pea')), at('a', account('cur', 'current'))],
      lines: [
        line('small', 'pea', { kind: 'units', name: 'Petite valeur', quoteSymbol: 'SM.PA' }),
        line('large', 'pea', { kind: 'units', name: 'Grosse valeur', quoteSymbol: 'LG.PA' }),
        line('cur-line', 'cur'),
      ],
      snapshot: snapshotOf([unitsEntry('small', 100, 100, null), unitsEntry('large', 101, 100, null), amountEntry('cur-line', 20_000)]),
    })
    const grid = buildGrid(computeSituation(model.profile!.value, model.snapshots[0].value))
    if (grid.kind !== 'grid') throw new Error('no grid')
    const squares = grid.categories.find((c) => c.category === 'markets')!.lines.map((l) => l.squares)
    expect(squares[0]).toBe(squares[1]) // the tie this test is about
    const view = ready(model, marketOf({ 'SM.PA': action, 'LG.PA': action }))
    expect(view.facts.some((f) => /^Ta plus grosse action en direct, Grosse valeur, /.test(f))).toBe(true)
  })

  test('a fund or an ETF never counts', () => {
    const etf = { ...action, kind: 'ETF' } as const
    const view = ready(build(), marketOf({ 'AI.PA': etf, 'XX.PA': etf }))
    expect(view.facts.some((f) => SHARE.test(f))).toBe(false)
  })

  test('no market, a null quote or a line without symbol: no fact', () => {
    expect(ready(build()).facts.some((f) => SHARE.test(f))).toBe(false)
    expect(ready(build(), marketOf({ 'AI.PA': null, 'XX.PA': null })).facts.some((f) => SHARE.test(f))).toBe(false)
    const noSymbol = modelOf({
      establishments: [A],
      accounts: [at('a', account('pea', 'pea'))],
      lines: [line('al', 'pea', { kind: 'units', name: 'Air Liquide' })],
      snapshot: snapshotOf([unitsEntry('al', 100, 100, null)]),
    })
    expect(ready(noSymbol, marketOf({ 'AI.PA': action })).facts.some((f) => SHARE.test(f))).toBe(false)
  })

  test('under one square, no fact', () => {
    // 10 € of Air Liquide beside 1 000 000 € of another title in the same category: below one square.
    const model = modelOf({
      establishments: [A],
      accounts: [at('a', account('pea', 'pea')), at('a', account('cur', 'current'))],
      lines: [line('al', 'pea', { kind: 'units', name: 'Air Liquide', quoteSymbol: 'AI.PA' }),
        line('big', 'pea', { kind: 'units', name: 'Gros fonds' }),
        line('cur-line', 'cur'),
      ],
      snapshot: snapshotOf([unitsEntry('al', 1, 10, null), unitsEntry('big', 10_000, 100, null), amountEntry('cur-line', 1_000)]),
    })
    const view = ready(model, marketOf({ 'AI.PA': { ...action, price: 10 } }))
    expect(view.facts.some((f) => SHARE.test(f))).toBe(false)
  })

  test('a quote whose price is not used still gives its nature', () => {
    const view = ready(build(), marketOf({ 'AI.PA': { ...action, asOf: '2026-09-01' }, 'XX.PA': null }))
    expect(view.facts.some((f) => SHARE.test(f))).toBe(true)
  })

  test('a share moved to another category never counts', () => {
    const model = modelOf({
      establishments: [A],
      accounts: [at('a', account('pea', 'pea')), at('a', account('cur', 'current'))],
      lines: [
        line('al', 'pea', { kind: 'units', name: 'Air Liquide', quoteSymbol: 'AI.PA', category: 'available' }),
        line('cur-line', 'cur'),
      ],
      snapshot: snapshotOf([unitsEntry('al', 100, 100, null), amountEntry('cur-line', 20_000)]),
    })
    expect(ready(model, marketOf({ 'AI.PA': action })).facts.some((f) => SHARE.test(f))).toBe(false)
  })

  test('an employer share in employee savings counts', () => {
    const model = modelOf({
      establishments: [A, EMPLOYER],
      accounts: [at('a', account('cur', 'current')), at('emp', account('pee', 'employee-savings'))],
      lines: [line('cur-line', 'cur'), line('emp-share', 'pee', { kind: 'units', name: 'Action Employeur', quoteSymbol: 'EMP.PA' })],
      snapshot: snapshotOf([amountEntry('cur-line', 10_000), unitsEntry('emp-share', 100, 100, null)]),
    })
    const view = ready(model, marketOf({ 'EMP.PA': action }))
    expect(view.facts.some((f) => /^Ta plus grosse action en direct, Action Employeur, /.test(f))).toBe(true)
  })
})

describe('where the money is', () => {
  const model = modelOf({
    establishments: [A, B, HOME],
    accounts: [
      at('a', account('cur', 'current')),
      at('a', account('pea', 'pea')),
      at('b', account('liv', 'livret-a')),
      at('h', account('house', 'home')),
      at('h', account('gold', 'gold')),
      at('a', account('loan', 'loan', { name: 'Crédit', financedLineId: 'house-line' })),
    ],
    lines: [
      line('cur-line', 'cur'),
      line('etf', 'pea', { kind: 'units' }),
      line('liv-line', 'liv'),
      line('house-line', 'house'),
      line('gold-line', 'gold'),
      line('loan-line', 'loan'),
    ],
    snapshot: snapshotOf([
      amountEntry('cur-line', 4_000),
      unitsEntry('etf', 100, 60, null), // 6 000 €
      amountEntry('liv-line', 20_000),
      amountEntry('house-line', 200_000),
      amountEntry('gold-line', 3_000),
      amountEntry('loan-line', 120_000),
    ]),
  })

  test('sorted by amount, Chez toi last and without a bar', () => {
    const { places } = ready(model)
    expect(places.map((p) => p.name)).toEqual(['Banque B', 'Banque A', 'Chez toi'])
    expect(places.map((p) => plain(p.amount))).toEqual(['20 000 €', '10 000 €', '203 000 €'])
    expect(places[2].bar).toBeNull()
  })

  test('every bar adds up to 1, and the scale is shared', () => {
    const { places } = ready(model)
    for (const place of places.slice(0, 2)) {
      expect(place.bar!.reduce((s, part) => s + part.share, 0)).toBeCloseTo(1)
    }
    expect(places[0].scale).toBe(1)
    expect(places[1].scale).toBeCloseTo(0.5)
    expect(places[0].bar).toEqual([{ category: 'available', share: 1 }])
    expect(places[1].bar).toEqual([
      { category: 'available', share: 0.4 },
      { category: 'markets', share: 0.6 },
    ])
  })

  test('a loan held by a bank is listed under that bank, not under Chez toi', () => {
    const { places } = ready(model)
    expect(places[1].loans.map((l) => ({ name: l.name, owed: plain(l.owed) }))).toEqual([{ name: 'Crédit', owed: '120 000 €' }])
    expect(places[2].loans).toEqual([])
    expect(places[0].loans).toEqual([])
  })
})

describe('a line no rate converts', () => {
  const model = modelOf({
    establishments: [A],
    accounts: [at('a', account('cur', 'current')), at('a', account('usd', 'securities'))],
    lines: [line('cur-line', 'cur'), line('us', 'usd', { name: 'Action US', currency: 'USD' })],
    snapshot: snapshotOf([amountEntry('cur-line', 10_000), amountEntry('us', 5_000)]),
    budget: { basis: 'expenses', monthly: 200_000 },
  })

  test('is left out of every figure and said once, never as 0', () => {
    const view = ready(model)
    expect(view.notes).toEqual(['« Action US » n’est pas compté\u00A0: son taux de change manque.'])
    expect(view.places.map((p) => plain(p.amount))).toEqual(['10 000 €'])
    expect(view.places[0].bar).toEqual([{ category: 'available', share: 1 }])
    expect(view.quick!.lit).toBe(100)
  })

  test('when nothing at all is counted, the cushion says so instead of 0 months', () => {
    const only = modelOf({
      establishments: [A],
      accounts: [at('a', account('usd', 'securities'))],
      lines: [line('us', 'usd', { name: 'Action US', currency: 'USD' })],
      snapshot: snapshotOf([amountEntry('us', 5_000)]),
      budget: { basis: 'expenses', monthly: 200_000 },
    })
    const view = ready(only)
    expect(view.cushion).toHaveProperty('missing')
    expect(view.quick).toBeNull()
    expect(view.places).toEqual([])
    expect(view.notes).toEqual([])
  })
})

describe('the states before the screen', () => {
  const base = cushionModel(undefined)

  test('no snapshot, or a first launch not finished: none', () => {
    expect(reperesView({ ...base, snapshots: [] }, TODAY).kind).toBe('none')
    expect(reperesView({ ...base, profile: null }, TODAY).kind).toBe('none')
    const unfinished = modelOf({
      establishments: [A],
      accounts: [at('a', account('cur', 'current'))],
      lines: [line('cur-line', 'cur')],
      snapshot: snapshotOf([amountEntry('cur-line', 1_000)]),
      firstLaunchComplete: false,
    })
    expect(reperesView(unfinished, TODAY).kind).toBe('none')
  })

  test('a part that cannot be read: unreadable, not a partial answer', () => {
    expect(reperesView({ ...base, unreadable: { ...base.unreadable, snapshots: 1 } }, TODAY).kind).toBe('unreadable')
    expect(reperesView({ ...base, profile: null, unreadable: { ...base.unreadable, profile: 1 } }, TODAY).kind).toBe('unreadable')
  })

  test('the date it speaks of is the snapshot’s', () => {
    expect(ready(base).dateLabel).toBe('Chiffres du 30 septembre')
  })
})

const HOME2: Establishment = { id: 'h2', name: 'Chez toi bis', kind: 'home' }
const withHomes = (house: number, other: number, second = 0) =>
  modelOf({
    establishments: [A, HOME, HOME2],
    accounts: [
      at('a', account('cur', 'current')),
      at('h', account('house', 'home')),
      ...(second ? [at('h2', account('house2', 'home', { name: 'Studio' }))] : []),
    ],
    lines: [line('cur-line', 'cur'), line('house-line', 'house'), ...(second ? [line('house2-line', 'house2')] : [])],
    snapshot: snapshotOf([
      amountEntry('cur-line', other),
      amountEntry('house-line', house),
      ...(second ? [amountEntry('house2-line', second)] : []),
    ]),
  })

describe('review fixes', () => {
  test('home share is worded with the same bands as the quick sentence', () => {
    expect(ready(withHomes(54_000, 46_000)).facts[0]).toBe(
      'Ton logement représente un peu plus de la moitié de ce qui est à toi. C’est courant quand on est propriétaire.',
    )
    expect(ready(withHomes(44_000, 56_000)).facts[0]).toMatch(/^Ton logement représente presque la moitié de ce qui/)
    expect(ready(withHomes(34_000, 66_000)).facts[0]).toMatch(/^Ton logement représente environ un tiers de ce qui/)
  })

  test('two homes: tes logements, in the fact and in the quick sentence', () => {
    const view = ready(withHomes(32_000, 36_000, 32_000))
    expect(view.facts[0]).toMatch(/^Tes logements représentent plus de la moitié de ce qui est à toi/)
    expect(plain(view.quick!.sentence)).toContain('Le reste est dans tes logements')
    expect(plain(view.quick!.sentence)).not.toContain('ta maison')
  })

  test('a rental alone never reads « ta maison »: « ton logement en location »', () => {
    const model = modelOf({
      establishments: [A, HOME],
      accounts: [at('a', account('cur', 'current')), at('h', account('flat', 'home', { residence: 'rental' }))],
      lines: [line('cur-line', 'cur'), line('flat-line', 'flat')],
      snapshot: snapshotOf([amountEntry('cur-line', 46_000), amountEntry('flat-line', 54_000)]),
    })
    const view = ready(model)
    expect(view.facts[0]).toBe(
      'Ton logement en location représente un peu plus de la moitié de ce qui est à toi. C’est courant quand on est propriétaire.',
    )
    expect(plain(view.quick!.sentence)).toContain('Le reste est dans ton logement en location')
    expect(JSON.stringify(view)).not.toMatch(/ta maison|Ta maison/)
  })

  test('a home and a rental: « tes logements »', () => {
    const model = modelOf({
      establishments: [A, HOME],
      accounts: [
        at('a', account('cur', 'current')),
        at('h', account('house', 'home')),
        at('h', account('flat', 'home', { residence: 'rental' })),
      ],
      lines: [line('cur-line', 'cur'), line('house-line', 'house'), line('flat-line', 'flat')],
      snapshot: snapshotOf([amountEntry('cur-line', 36_000), amountEntry('house-line', 32_000), amountEntry('flat-line', 32_000)]),
    })
    const view = ready(model)
    expect(view.facts[0]).toMatch(/^Tes logements représentent plus de la moitié de ce qui est à toi/)
    expect(plain(view.quick!.sentence)).toContain('Le reste est dans tes logements')
  })

  test('settings that cannot be read are not mistaken for a missing budget', () => {
    const model = modelOf({
      ...{ establishments: [A], accounts: [at('a', account('cur', 'current'))], lines: [line('cur-line', 'cur')] },
      snapshot: snapshotOf([amountEntry('cur-line', 1_000)]),
      unreadable: { settings: 1 },
    })
    expect(ready(model).cushion).toEqual({
      missing: 'Tes réglages n’ont pas pu être lus\u00A0: le coussin ne peut pas être calculé.',
    })
  })

  test('the rest is joined as A, B et C', () => {
    const model = modelOf({
      establishments: [A, HOME, EMPLOYER],
      accounts: [
        at('a', account('cur', 'current')),
        at('a', account('per', 'per')),
        at('h', account('house', 'home')),
        at('emp', account('pee', 'employee-savings')),
      ],
      lines: [line('cur-line', 'cur'), line('per-line', 'per'), line('house-line', 'house'), line('pee-line', 'pee')],
      snapshot: snapshotOf([
        amountEntry('cur-line', 50_000),
        amountEntry('per-line', 10_000),
        amountEntry('house-line', 30_000),
        amountEntry('pee-line', 5_000),
      ]),
    })
    const sentence = plain(ready(model).quick!.sentence)
    expect(sentence).toContain(
      'Le reste est dans ton logement, une petite part attend ta retraite et une petite part est bloquée chez ton employeur pour l’instant. Le PER et l’épargne salariale peuvent aussi se débloquer, dans certains cas, pour acheter ta résidence principale.',
    )
    expect(sentence).not.toContain(', et ')
  })

  test('a cushion of nothing, or under half a month, does not say « environ »', () => {
    const budget = { basis: 'expenses' as const, monthly: 200_000 }
    for (const [euros, savings] of [[-2_000, 1_000], [0, 500], [200, 300]]) {
      const model = modelOf({
        establishments: [A],
        accounts: [at('a', account('cur', 'current')), at('a', account('liv', 'livret-a'))],
        lines: [line('cur-line', 'cur'), line('liv-line', 'liv')],
        snapshot: snapshotOf([amountEntry('cur-line', euros), amountEntry('liv-line', savings)]),
        budget,
      })
      const cushion = ready(model).cushion
      expect(cushion).toMatchObject({
        sentence: "Si tes revenus s’arrêtaient, ton argent disponible ne couvrirait pas un demi-mois de dépenses.",
        filled: 0,
      })
    }
  })

  test('a line left out that belongs to « disponible » is also noted under the cushion', () => {
    const model = modelOf({
      establishments: [A],
      accounts: [at('a', account('cur', 'current')), at('a', account('usd', 'current'))],
      lines: [line('cur-line', 'cur'), line('us', 'usd', { name: 'Compte USD', currency: 'USD' })],
      snapshot: snapshotOf([amountEntry('cur-line', 10_000), amountEntry('us', 5_000)]),
      budget: { basis: 'expenses', monthly: 200_000 },
    })
    const view = ready(model)
    expect(view.cushion).toMatchObject({ note: '« Compte USD » n’est pas compté\u00A0: son taux de change manque.' })
    expect(view.notes).toHaveLength(1)
    // A left-out line elsewhere does not touch the cushion.
    const other = modelOf({
      establishments: [A],
      accounts: [at('a', account('cur', 'current')), at('a', account('usd', 'securities'))],
      lines: [line('cur-line', 'cur'), line('us', 'usd', { name: 'Action US', currency: 'USD' })],
      snapshot: snapshotOf([amountEntry('cur-line', 10_000), amountEntry('us', 5_000)]),
      budget: { basis: 'expenses', monthly: 200_000 },
    })
    expect(ready(other).cushion).not.toHaveProperty('note')
  })

  test('an establishment holding only loans shows no amount; an overdrawn account counts in its bank', () => {
    const model = modelOf({
      establishments: [A, B, HOME],
      accounts: [
        at('a', account('cur', 'current')),
        at('a', account('sav', 'livret-a')),
        at('h', account('house', 'home')),
        at('b', account('loan', 'loan', { name: 'Prêt', financedLineId: 'house-line' })),
      ],
      lines: [line('cur-line', 'cur'), line('sav-line', 'sav'), line('house-line', 'house'), line('loan-line', 'loan')],
      snapshot: snapshotOf([
        amountEntry('cur-line', -2_000),
        amountEntry('sav-line', 10_000),
        amountEntry('house-line', 100_000),
        amountEntry('loan-line', 50_000),
      ]),
    })
    const { places } = ready(model)
    const a = places.find((p) => p.id === 'a')!
    expect(plain(a.amount)).toBe('8 000 €')
    const b = places.find((p) => p.id === 'b')!
    expect(b.amount).toBeNull()
    expect(b.loans.map((l) => plain(l.owed))).toEqual(['50 000 €'])
    expect(b.loans[0].id).toBe('loan-line')
  })

  test('the employer share is of what is his outside the homes; several employers are named from the accounts', () => {
    const model = modelOf({
      establishments: [A, HOME, EMPLOYER],
      accounts: [
        at('a', account('cur', 'current')),
        at('h', account('house', 'home')),
        at('emp', account('pee1', 'employee-savings', { name: 'PEE OVHcloud' })),
        at('emp', account('pee2', 'employee-savings', { name: 'PERCOL Danone' })),
      ],
      lines: [line('cur-line', 'cur'), line('house-line', 'house'), line('p1', 'pee1'), line('p2', 'pee2')],
      snapshot: snapshotOf([
        amountEntry('cur-line', 30_000),
        amountEntry('house-line', 100_000),
        amountEntry('p1', 10_000),
        amountEntry('p2', 10_000),
      ]),
    })
    const fact = ready(model).facts.find((f) => f.includes('employeur'))!
    // 20 000 of 50 000 outside the home: 40 %, not 20 000 of 150 000.
    expect(fact).toBe('Une partie de ce qui est à toi hors de ton logement est placée chez tes employeurs, OVHcloud et Danone.')
  })

  test('one employer is named from the account when the establishment is the default one', () => {
    const model = modelOf({
      establishments: [A, EMPLOYER],
      accounts: [at('a', account('cur', 'current')), at('emp', account('pee', 'employee-savings', { name: 'PEE OVHcloud' }))],
      lines: [line('cur-line', 'cur'), line('p', 'pee')],
      snapshot: snapshotOf([amountEntry('cur-line', 50_000), amountEntry('p', 5_000)]),
    })
    expect(ready(model).facts[0]).toBe(
      'Une petite partie de ce qui est à toi est placée chez ton employeur, OVHcloud.',
    )
  })

  test('the sentence’s share agrees with the lit squares', () => {
    // 3 equal-ish parts: 33,4 / 33,3 / 33,3 → lit squares decide the words, not the euros.
    const model = modelOf({
      establishments: [A, HOME],
      accounts: [at('a', account('cur', 'current')), at('h', account('house', 'home'))],
      lines: [line('cur-line', 'cur'), line('house-line', 'house')],
      snapshot: snapshotOf([amountEntry('cur-line', 50_400), amountEntry('house-line', 49_600)]),
    })
    const quick = ready(model).quick!
    expect(quick.lit).toBe(50)
    expect(plain(quick.sentence)).toMatch(/^Presque la moitié/)
  })
})

describe('homeBuyingSentence', () => {
  test('names what can be released to buy a main home', () => {
    expect(homeBuyingSentence(true, false)).toBe('Un PER peut aussi se débloquer, dans certains cas, pour acheter ta résidence principale.')
    expect(homeBuyingSentence(false, true)).toBe('L’épargne salariale peut aussi se débloquer, dans certains cas, pour acheter ta résidence principale.')
    expect(homeBuyingSentence(true, true)).toBe('Le PER et l’épargne salariale peuvent aussi se débloquer, dans certains cas, pour acheter ta résidence principale.')
    expect(homeBuyingSentence(false, false)).toBeNull()
  })
})
