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
import { buildGrid } from '@/lib/model/squares'
import { setAmountsHidden } from '@/lib/format'
import { computeSituation } from '@/lib/model/situation'
import { excludedSentence, monArgentView, noGridSentence } from '@/lib/screens/mon-argent'
import { WORLD_FUND_NOTE } from '@/lib/screens/chapters'
import { categoryDetailView, type CategoryDetailView, type DetailChapter } from '@/lib/screens/category-detail'

const TODAY = '2026-11-06'
const plain = (text: string | null) => text?.replace(/[\u202f\u00a0]/g, ' ') ?? null
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const balanced: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }

function modelOf(
  parts: {
    profile?: Profile | null
    snapshots?: Snapshot[]
    goals?: GoalAllocation[]
    unreadable?: Partial<Model['unreadable']>
  } = {},
): Model {
  return {
    profile: parts.profile === null ? null : loaded(parts.profile ?? exampleProfile),
    snapshots: (parts.snapshots ?? [exampleSnapshot]).map((s, i) => loaded(s, `s${i}`)),
    goals: (parts.goals ?? [balanced]).map((g, i) => loaded(g, `g${i}`)),
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, ...parts.unreadable, draft: 0 },
  }
}

describe('the markets category of the example', () => {
  const view = categoryDetailView(modelOf(), 'markets', TODAY)!

  test('header, name and goal', () => {
    expect(view.name).toBe('Placements en bourse')
    expect(plain(view.header)).toBe('15 carrés sur 100, un peu en dessous de ton objectif (19 carrés)')
    // A3: a number and « carrés » never part: « (19 carrés) » never leaves « carrés) » alone on a line.
    expect(view.header).toContain('(19\u00A0carrés)')
    expect(view.goal).toEqual({ actual: 15, target: 19 })
    expect(plain(view.percent)).toBe('15 %')
    expect(plain(view.euros)).toBe('30 000 €')
    expect(view.debtSentence).toBeNull()
    expect(view.debts).toEqual([])
    expect(view.leftOut).toEqual([])
    expect(view.squares).toBe(true)
  })

  test('gives each line its id, for its fiche', () => {
    expect(view.lines.map((l) => l.lineId)).toEqual(['etf', 'life-uc'])
  })

  test('the ETF leads, with its result and details', () => {
    const [etf, uc] = view.lines
    expect(etf).toMatchObject({ name: 'ETF', squares: 13 })
    expect(plain(etf.where)).toBe('PEA chez BoursoBank')
    expect(plain(etf.result!.euros)).toBe('a gagné 5 000 € depuis l’achat')
    expect(plain(etf.result!.percent)).toBe('a gagné 25,0 % depuis l’achat')
    expect(etf.result!.tone).toEqual({ euros: 'gain', percent: 'gain' })
    expect(plain(etf.details)).toBe(
      '100 parts · prix moyen d’achat 200,00 € · dernier prix connu 250,00 €, au 30 septembre · 12,4 % de ce qui est à toi',
    )
    expect(uc).toMatchObject({ name: 'Unité de compte', squares: 2 })
    expect(plain(uc.where)).toBe('Assurance-vie chez Linxea')
    expect(plain(uc.result!.euros)).toBe('a gagné 500 € depuis l’achat')
    expect(view.tooSmall).toEqual([])
  })
})

test('the property category says what is owed to the bank', () => {
  const view = categoryDetailView(modelOf(), 'property', TODAY)!
  expect(plain(view.debtSentence)).toBe('300 000 € dont 180 000 € dus à la banque')
  expect(view.goal).toBeNull()
  expect(view.lines[0].result).toBeNull()
  expect(view.lines[0].details).toBeNull()
})

describe('the ways into a line’s fiche', () => {
  const owedOf = (view: CategoryDetailView) => view.debts.map((d) => ({ ...d, owed: plain(d.owed) }))

  test('says the loan of the house under the house, with the same header sentence as before', () => {
    const view = categoryDetailView(modelOf(), 'property', TODAY)!
    // No row of its own: it is a sub-line of the line it finances.
    expect(view.debts).toEqual([])
    expect(view.lines[0].loans.map((l) => ({ lineId: l.lineId, sentence: plain(l.sentence) }))).toEqual([
      { lineId: 'mortgage-line', sentence: expect.stringMatching(/^une fois déduits 180 000 € encore dus (à|chez) /) },
    ])
    // The line's figure is net of the loan, like its squares: 300 000 € less 180 000 €. The sub-line
    // says that subtraction; « dont » would put 180 000 € inside 120 000 €.
    expect(plain(view.lines[0].euros)).toBe('120 000 €')
    expect(plain(view.lines[0].loans[0].sentence)).not.toMatch(/^dont /)
    expect(plain(view.debtSentence)).toBe('300 000 € dont 180 000 € dus à la banque')
    expect(view.squares).toBe(true)
    // The loan is a debt, never a line of the category: the house's line already takes it off.
    expect(view.lines.map((l) => l.lineId)).toEqual(['house-line'])
    expect(categoryDetailView(modelOf(), 'available', TODAY)!.debts).toEqual([])
  })

  test('lists a loan that finances nothing as a debt of the available money', () => {
    const profile: Profile = {
      ...exampleProfile,
      accounts: [...exampleProfile.accounts, { id: 'car', establishmentId: 'boursobank', type: 'loan', name: 'Crédit auto' }],
      lines: [...exampleProfile.lines, { id: 'car-line', accountId: 'car', name: 'Crédit auto', kind: 'amount', currency: 'EUR' }],
    }
    const snapshot: Snapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('car-line', 5_000)] }
    const model = modelOf({ profile, snapshots: [snapshot] })
    const available = categoryDetailView(model, 'available', TODAY)!
    expect(owedOf(available)).toEqual([{ lineId: 'car-line', name: 'Crédit auto', owed: '5 000 €' }])
    // 8 000 € on the current account and 12 000 € on the Livret A, 5 000 € of it owed: 15 000 €.
    expect(plain(available.euros)).toBe('15 000 €')
    expect(plain(available.debtSentence)).toBe('20 000 € dont 5 000 € dus à la banque')
    expect(categoryDetailView(model, 'property', TODAY)!.lines[0].loans.map((l) => l.lineId)).toEqual(['mortgage-line'])
  })

  test('a loan whose house the snapshot no longer holds lowers the available money, as computeSituation does', () => {
    const sold: Snapshot = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'house-line') }
    const model = modelOf({ snapshots: [sold] })
    expect(categoryDetailView(model, 'available', TODAY)!.debts.map((d) => d.lineId)).toEqual(['mortgage-line'])
    // Immobilier holds nothing any more: there is no detail to open.
    expect(categoryDetailView(model, 'property', TODAY)).toBeNull()
  })

  test('opens a category whose total is negative, without squares, with the sentence of Mon argent', () => {
    // The house typed 100 000 € instead of 300 000 €: below its 180 000 € loan, Immobilier is out of the grid.
    const typo: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 100_000) : e)),
    }
    const view = categoryDetailView(modelOf({ snapshots: [typo] }), 'property', TODAY)!
    expect(view.squares).toBe(false)
    expect(view.goal).toBeNull()
    expect(view.header).toBe(excludedSentence('property', computeSituation(exampleProfile, typo)))
    expect(owedOf(view)).toEqual([{ lineId: 'mortgage-line', name: 'Crédit', owed: '180 000 €' }])
    // « dont » would put 180 000 € inside 100 000 €: no sentence, the header and the row say it.
    expect(view.debtSentence).toBeNull()
    expect(plain(view.euros)).toBe('−80 000 €')
    // No square: its figure stays in euros, never a share of the grid.
    expect(view.percent).toBe(view.euros)
    expect(view.lines.map((l) => ({ lineId: l.lineId, squares: l.squares, euros: plain(l.euros) }))).toEqual([
      { lineId: 'house-line', squares: 0, euros: '−80 000 €' },
    ])
    expect(view.tooSmall).toEqual([])
  })

  test('opens a category when there is no grid at all', () => {
    // 1 000 € on the current account, 3 000 € owed, 500 € of gold and a fund: what you owe is more than what you own.
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan'), account('g', 'gold'), account('pea', 'pea')],
      [line('cur-l', 'cur'), line('loan-l', 'loan'), line('g-l', 'g'), line('etf', 'pea', { kind: 'units' })],
    )
    const snapshot = snapshotOf([
      amountEntry('cur-l', 1_000),
      amountEntry('loan-l', 3_000),
      amountEntry('g-l', 500),
      unitsEntry('etf', 10, 50, 40),
    ])
    const model = modelOf({ profile, snapshots: [snapshot] })
    const available = categoryDetailView(model, 'available', TODAY)!
    expect(available.squares).toBe(false)
    expect(available.goal).toBeNull()
    expect(available.header).toBe(noGridSentence(computeSituation(profile, snapshot)))
    expect(available.lines.map((l) => l.lineId)).toEqual(['cur-l'])
    expect(owedOf(available)).toEqual([{ lineId: 'loan-l', name: 'loan-l', owed: '3 000 €' }])
    // More owed than held: « 1 000 € dont 3 000 € » would be false, so there is no sentence.
    expect(available.debtSentence).toBeNull()

    // A positive category has no square either, and no share of a net that is not positive.
    const gold = categoryDetailView(model, 'gold', TODAY)!
    expect(gold.squares).toBe(false)
    expect(gold.lines).toMatchObject([{ lineId: 'g-l', squares: 0 }])
    expect(gold.lines[0].percent).toBe(gold.lines[0].euros)
    expect(gold.percent).toBe(gold.euros)
    expect(gold.tooSmall).toEqual([])
    expect(gold.debts).toEqual([])
    expect(gold.debtSentence).toBeNull()
    const etf = categoryDetailView(model, 'markets', TODAY)!.lines[0]
    expect(plain(etf.details)).toBe('10 parts · prix moyen d’achat 40,00 € · dernier prix connu 50,00 €, au 30 septembre')
    expect(plain(etf.result!.euros)).toBe('a gagné 100 € depuis l’achat')

    // What holds nothing still opens nothing.
    expect(categoryDetailView(model, 'secured', TODAY)).toBeNull()
  })

  test('a loan exactly as big as its house still reads « dont »: the part is the whole, not more', () => {
    const even: Snapshot = {
      ...exampleSnapshot,
      entries: exampleSnapshot.entries.map((e) => (e.lineId === 'house-line' ? amountEntry('house-line', 180_000) : e)),
    }
    const view = categoryDetailView(modelOf({ snapshots: [even] }), 'property', TODAY)!
    expect(plain(view.euros)).toBe('0 €')
    expect(plain(view.debtSentence)).toBe('180 000 € dont 180 000 € dus à la banque')
  })

  test('a category worth exactly zero opens too, at 0 square out of 100', () => {
    // A fund in euros at 0 €: Épargne sécurisée is neither in the grid nor below zero.
    const profile = profileOf(
      [account('cur', 'current'), account('life', 'life-insurance')],
      [line('cur-l', 'cur'), line('fund-l', 'life', { name: 'Fonds euros' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('fund-l', 0)])
    const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot] }), 'secured', TODAY)!
    expect(view.squares).toBe(false)
    expect(view.goal).toBeNull()
    expect(plain(view.header)).toBe('0 carré sur 100')
    expect(view.lines.map((l) => l.lineId)).toEqual(['fund-l'])
    expect(view.tooSmall).toEqual([])
  })

  test('names the lines left out for want of a rate, with their ids', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'current')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('us-l', 500)], {})
    const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'available', TODAY)!
    expect(view.leftOut).toEqual([{ lineId: 'us-l', name: 'Revolut' }])
    expect(view.note).toBe('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
  })
})

test('a loss says « a perdu »; no result at a gain of zero or without an average price', () => {
  const profile = profileOf(
    [account('pea', 'pea')],
    [line('a', 'pea', { kind: 'units' }), line('b', 'pea', { kind: 'units' }), line('c', 'pea', { kind: 'units' })],
  )
  const snapshot = snapshotOf([unitsEntry('a', 10, 80, 100), unitsEntry('b', 10, 100, 100), unitsEntry('c', 10, 100, null)])
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'markets', TODAY)!
  const byName = Object.fromEntries(view.lines.map((l) => [l.name, l]))
  expect(byName.a.result?.tone).toEqual({ euros: 'loss', percent: 'loss' })
  expect(plain(byName.a.result!.euros)).toBe('a perdu 200 € depuis l’achat')
  expect(byName.b.result).toBeNull()
  expect(byName.c.result).toBeNull()
  expect(plain(byName.c.details)).toBe('10 parts · dernier prix connu 100,00 €, au 30 septembre · 35,7 % de ce qui est à toi')
  expect(view.goal).toBeNull()
  expect(plain(view.header)).toBe('100 carrés sur 100')
})

test('a line in dollars bought at today’s price has no result: its cost rounds like its value', () => {
  // 11,228 × 13,8346 $ is 15 533,49 cents: 15 533 cents of dollars, then 13 912 euro cents, for both.
  const profile = profileOf([account('pea', 'pea')], [line('a', 'pea', { kind: 'units', currency: 'USD' })])
  const snapshot = snapshotOf([unitsEntry('a', 11.228, 13.8346, 13.8346)], { USD: 1 / 1.1165 })
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'markets', TODAY)!
  expect(view.lines[0].result).toBeNull()
})

test('« de ce qui est à toi » divides by what is truly yours, not by the squares’ total', () => {
  // 1 000 € on a current account and a 2 000 € car loan: the available money is -1 000 €, out of the grid.
  const profile = profileOf(
    [account('cur', 'current'), account('loan', 'loan'), account('pea', 'pea'), account('g', 'gold')],
    [line('cur-l', 'cur'), line('loan-l', 'loan'), line('etf', 'pea', { kind: 'units' }), line('g-l', 'g')],
  )
  const snapshot = snapshotOf([
    amountEntry('cur-l', 1_000),
    amountEntry('loan-l', 2_000),
    unitsEntry('etf', 10, 450, null),
    amountEntry('g-l', 4_500),
  ])
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot] }), 'markets', TODAY)!
  // 4 500 € out of 8 000 € that are yours; the grid itself counts 9 000 €.
  expect(plain(view.lines[0].details)).toBe('10 parts · dernier prix connu 450,00 €, au 30 septembre · 56,3 % de ce qui est à toi')
})

test('lines valued zero or less stay in the list without squares; only positive ones are too small', () => {
  const profile = profileOf(
    [account('bank', 'livret-a'), account('cur', 'current')],
    [line('big', 'bank'), line('tiny', 'bank'), line('empty', 'bank'), line('other', 'cur', { category: 'secured' })],
  )
  const snapshot = snapshotOf([
    amountEntry('big', 10_000),
    amountEntry('tiny', 0.01),
    amountEntry('empty', 0),
    amountEntry('other', 10_000),
  ])
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot] }), 'available', TODAY)!
  expect(view.lines.map((l) => l.name)).toEqual(['big', 'empty'])
  expect(view.lines[1].squares).toBe(0)
  expect(view.tooSmall.map((l) => l.name)).toEqual(['tiny'])
})

test('a line valued zero or less keeps its euro text in percent mode', () => {
  const profile = profileOf(
    [account('bank', 'livret-a'), account('cur', 'current'), account('sec', 'livret-a')],
    [line('big', 'bank'), line('empty', 'bank'), line('overdraft', 'cur')],
  )
  const snapshot = snapshotOf([amountEntry('big', 10_000), amountEntry('empty', 0), amountEntry('overdraft', -200)])
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot] }), 'available', TODAY)!
  const empty = view.lines.find((l) => l.name === 'empty')!
  const overdraft = view.lines.find((l) => l.name === 'overdraft')!
  expect(empty.percent).toBe(empty.euros)
  expect(plain(empty.euros)).toBe('0 €')
  expect(overdraft.percent).toBe(overdraft.euros)
  expect(plain(overdraft.euros)).toBe('−200 €')
  expect(overdraft.squares).toBe(0)
})

test('null for an unknown category, an absent category, and when there is no board', () => {
  expect(categoryDetailView(modelOf(), 'nope' as never, TODAY)).toBeNull()
  const onlyCash = snapshotOf([amountEntry('current-line', 1_000)])
  expect(categoryDetailView(modelOf({ snapshots: [onlyCash] }), 'gold', TODAY)).toBeNull()
  expect(categoryDetailView(modelOf({ profile: null }), 'markets', TODAY)).toBeNull()
  expect(categoryDetailView(modelOf({ snapshots: [] }), 'markets', TODAY)).toBeNull()
})

test('unreadable goals leave no goal and no gap words', () => {
  const view = categoryDetailView(modelOf({ unreadable: { goals: 1 } }), 'markets', TODAY)!
  expect(view.goal).toBeNull()
  expect(plain(view.header)).toBe('15 carrés sur 100')
})

describe('the detail at today’s prices', () => {
  const NOW = '2026-11-08'
  const quoted: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }
  const market: Market = {
    quotes: { 'CW8.PA': { price: 260, currency: 'EUR', asOf: '2026-11-06' } },
    rates: null,
  }

  test('the quoted line is worth the day’s price and says so', () => {
    const view = categoryDetailView(modelOf({ profile: quoted }), 'markets', NOW, market)!
    const etf = view.lines.find((l) => l.name === 'ETF')!
    expect(plain(etf.euros)).toBe('26 000 €')
    expect(plain(etf.details)).toContain('prix du jour 260,00 €')
    expect(plain(etf.details)).toContain('prix moyen d’achat 200,00 €')
  })

  test('without a market, the snapshot’s price', () => {
    const view = categoryDetailView(modelOf({ profile: quoted }), 'markets', NOW)!
    expect(plain(view.lines.find((l) => l.name === 'ETF')!.details)).toContain('dernier prix connu 250,00 €, au 30 septembre')
  })

  test('the euros of the category equal the board’s', () => {
    const model = modelOf({ profile: quoted })
    const view = categoryDetailView(model, 'markets', NOW, market)!
    const board = monArgentView(model, NOW, market)
    if (board.kind !== 'board') throw new Error('board expected')
    expect(view.euros).toBe(board.categories.find((c) => c.category === 'markets')!.euros)
  })

  test('a failed or stale price is not « du jour »: the snapshot’s price is told as the last known', () => {
    const failed: Market = { quotes: { 'CW8.PA': null }, rates: null }
    const stale: Market = { quotes: { 'CW8.PA': { price: 260, currency: 'EUR', asOf: '2026-10-01' } }, rates: null }
    for (const m of [failed, stale]) {
      const etf = categoryDetailView(modelOf({ profile: quoted }), 'markets', NOW, m)!.lines.find((l) => l.name === 'ETF')!
      expect(plain(etf.details)).not.toContain('prix du jour')
      expect(plain(etf.details)).toContain('dernier prix connu 250,00 €, au 30 septembre')
    }
  })

  test('lines left out for want of a rate are told in a note', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'current')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), amountEntry('us-l', 500)], {})
    const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'available', NOW)!
    expect(view.note).toBe('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
    expect(categoryDetailView(modelOf(), 'markets', NOW)!.note).toBeNull()
  })

  // F9: each page says what it left out of itself, not what every other page left out.
  test('the note names only the lines of the category opened', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'current'), account('pea', 'pea')],
      [
        line('cur-l', 'cur'),
        line('us-l', 'us', { name: 'Revolut', currency: 'USD' }),
        line('etf-l', 'pea', { name: 'ETF', kind: 'units' }),
        line('apple-l', 'pea', { name: 'Apple', kind: 'units', currency: 'USD' }),
      ],
    )
    const snapshot = snapshotOf(
      [amountEntry('cur-l', 1_000), amountEntry('us-l', 500), unitsEntry('etf-l', 10, 100, null), unitsEntry('apple-l', 2, 150, null)],
      {},
    )
    const model = modelOf({ profile, snapshots: [snapshot], goals: [] })
    expect(categoryDetailView(model, 'available', NOW)!.note).toBe('« Revolut » n’est pas compté\u00A0: son taux de change manque.')
    expect(categoryDetailView(model, 'markets', NOW)!.note).toBe('« Apple » n’est pas compté\u00A0: son taux de change manque.')
  })

  test('a category with nothing left out has no note, even when another has', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('pea', 'pea')],
      [line('cur-l', 'cur'), line('etf-l', 'pea', { name: 'ETF', kind: 'units' }), line('apple-l', 'pea', { name: 'Apple', kind: 'units', currency: 'USD' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('etf-l', 10, 100, null), unitsEntry('apple-l', 2, 150, null)], {})
    expect(categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'available', NOW)!.note).toBeNull()
  })

  test('a line with no rate is left out of the detail, which still opens', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('us', 'pea')],
      [line('cur-l', 'cur'), line('us-l', 'us', { name: 'Revolut', currency: 'USD', kind: 'units' })],
    )
    const snapshot = snapshotOf([amountEntry('cur-l', 1_000), unitsEntry('us-l', 10, 100, null)], {})
    expect(categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'available', NOW)).not.toBeNull()
  })
})

describe('the « Fonds monde » note', () => {
  const pea = account('pea', 'pea')
  const modelWith = (lines: ReturnType<typeof line>[], amounts: number[]) =>
    modelOf({
      profile: profileOf([account('cc', 'current'), pea], [line('cc-line', 'cc'), ...lines]),
      snapshots: [snapshotOf([amountEntry('cc-line', 10_000), ...lines.map((l, i) => amountEntry(l.id, amounts[i]))])],
    })

  test('a markets line in « Fonds monde » brings the MSCI World note', () => {
    const view = categoryDetailView(modelWith([line('w', 'pea', { group: 'world' }), line('e', 'pea', { group: 'europe' })], [40_000, 30_000]), 'markets', TODAY)!
    expect(view.worldNote).toBe(WORLD_FUND_NOTE)
    expect(plain(view.worldNote)).toBe('Un fonds qui suit l’indice MSCI World place environ 7 euros sur 10 aux États-Unis (fiche MSCI du 30 septembre 2026).')
    // Without chapters (one only), the note stays as well.
    expect(categoryDetailView(modelWith([line('w', 'pea', { group: 'world' })], [40_000]), 'markets', TODAY)!.worldNote).toBe(WORLD_FUND_NOTE)
  })

  test('no « Fonds monde » line, no note', () => {
    expect(categoryDetailView(modelWith([line('e', 'pea', { group: 'europe' }), line('u', 'pea', { group: 'us' })], [30_000, 20_000]), 'markets', TODAY)!.worldNote).toBeNull()
    expect(categoryDetailView(modelWith([line('f', 'pea')], [30_000]), 'markets', TODAY)!.worldNote).toBeNull()
    for (const category of ['available', 'property', 'secured', 'gold'] as const) {
      expect(categoryDetailView(modelOf(), category, TODAY)?.worldNote ?? null).toBeNull()
    }
  })
})

describe('the chapters of a category', () => {
  const rangedProfile = profileOf(
    [account('cc', 'current'), account('pea', 'pea'), account('av', 'life-insurance'), account('or', 'gold')],
    [
      line('cc-line', 'cc'),
      line('us-line', 'pea', { group: 'us' }),
      line('eu-line', 'pea', { group: 'europe' }),
      line('eu-tiny', 'pea', { group: 'europe' }),
      line('free-line', 'pea'),
      line('euro-fund', 'av', { group: 'euro-fund' }),
      line('gold-line', 'or'),
    ],
  )
  const rangedSnapshot = snapshotOf([
    amountEntry('cc-line', 10_000),
    amountEntry('us-line', 50_000),
    amountEntry('eu-line', 30_000),
    amountEntry('eu-tiny', 1),
    amountEntry('free-line', 20_000),
    amountEntry('euro-fund', 5_000),
    amountEntry('gold-line', 1_000),
  ])
  const model = modelOf({ profile: rangedProfile, snapshots: [rangedSnapshot] })
  const markets = categoryDetailView(model, 'markets', TODAY)!
  const squaresIn = (lines: Array<{ squares: number }>) => lines.reduce((n, l) => n + l.squares, 0)

  test('sorted by value, the unknown one last, with their lines biggest first', () => {
    expect(markets.chapters!.map((c) => c.id)).toEqual(['us', 'europe', 'unknown'])
    expect(markets.chapters!.map((c) => c.label)).toEqual(['États-Unis', 'Europe', 'Je ne sais pas'])
    expect(markets.chapters![1].lines.map((l) => l.lineId)).toEqual(['eu-line', 'eu-tiny'])
  })

  test('a line ranged in Japan makes a « Japon » chapter', () => {
    const japan = profileOf(rangedProfile.accounts, [...rangedProfile.lines, line('jp-line', 'pea', { group: 'japan' })])
    const snapshot = snapshotOf([...rangedSnapshot.entries, amountEntry('jp-line', 40_000)])
    const view = categoryDetailView(modelOf({ profile: japan, snapshots: [snapshot] }), 'markets', TODAY)!
    expect(view.chapters!.map((c) => c.label)).toEqual(['États-Unis', 'Japon', 'Europe', 'Je ne sais pas'])
  })

  test('the unknown chapter stays last even when it is the biggest', () => {
    const big = snapshotOf(rangedSnapshot.entries.map((e) => (e.lineId === 'free-line' ? amountEntry('free-line', 900_000) : e)))
    const view = categoryDetailView(modelOf({ profile: rangedProfile, snapshots: [big] }), 'markets', TODAY)!
    expect(view.chapters!.map((c) => c.id)).toEqual(['us', 'europe', 'unknown'])
  })

  test('a chapter’s squares are the sum of its lines’; a tiny line sits in its chapter', () => {
    const total = squaresIn(markets.chapters!.flatMap((c) => c.lines))
    expect(plain(markets.header)).toContain(`${total} carrés sur 100`)
    // Against the grid itself: the category's squares are the sum of its chapters'.
    const grid = buildGrid(computeSituation(rangedProfile, rangedSnapshot))
    if (grid.kind !== 'grid') throw new Error('expected a grid')
    const gridEntry = grid.categories.find((c) => c.category === 'markets')!
    expect(total).toBe(gridEntry.squares)
    for (const held of gridEntry.lines) {
      expect(markets.chapters!.flatMap((c) => c.lines).find((l) => l.lineId === held.lineId)!.squares).toBe(held.squares)
    }
    const europe = markets.chapters!.find((c) => c.id === 'europe')!
    // Planche 4, option B (Nicolas, 12 November 2026): its squares are drawn, so no « N carrés sur M », no
    // count of the lines listed beneath; only what the squares do not say.
    expect(plain(europe.sub)).toBe('2 lignes sans prix')
    expect(europe.lines.map((l) => l.lineId)).toContain('eu-tiny')
    expect(markets.tooSmall.map((l) => l.lineId)).toContain('eu-tiny')
    expect(markets.lines.find((l) => l.lineId === 'us-line')!.chapter).toBe('us')
    expect(markets.tooSmall[0].chapter).toBe('europe')
  })

  test('sub-line copy: less than a square, singular line', () => {
    const view = categoryDetailView(
      modelOf({
        profile: rangedProfile,
        snapshots: [
          snapshotOf([amountEntry('cc-line', 1_000_000), amountEntry('us-line', 1_000), amountEntry('eu-line', 1), amountEntry('eu-tiny', 1)]),
        ],
      }),
      'markets',
      TODAY,
    )!
    const europe = view.chapters!.find((c) => c.id === 'europe')!
    // Amount lines in « Placements en bourse »: no purchase price, so « sans prix ».
    expect(plain(europe.sub)).toBe('moins d’un carré · 2 lignes sans prix')
    expect(europe.sub).toContain('2 lignes')
    expect(europe.percent).toBe(europe.euros)
    expect(plain(view.chapters!.find((c) => c.id === 'us')!.sub)).toMatch(/^(moins d’un carré|1 carré sur \d+) · 1 ligne sans prix$/)
  })

  test('singulars « 1 carré » and « 1 ligne »', () => {
    const profile = profileOf(
      [account('pea', 'pea'), account('cc', 'current')],
      [line('a', 'pea', { group: 'us' }), line('b', 'pea', { group: 'europe' }), line('cc-line', 'cc')],
    )
    const view = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([amountEntry('a', 1_000), amountEntry('b', 99_000), amountEntry('cc-line', 0.01)])] }),
      'markets',
      TODAY,
    )!
    const us = view.chapters!.find((c) => c.id === 'us')!
    expect(us.lines.map((l) => l.squares)).toEqual([1])
    // Its one square is drawn: the sub-line only says what it does not (planche 4, option B); VoiceOver hears it all.
    expect(plain(us.sub)).toBe('1 ligne sans prix')
    expect(plain(us.said!.percent)).toContain(`1 carré sur ${squaresIn(view.chapters!.flatMap((c) => c.lines))}, 1 ligne`)
  })

  test('chapters is null for one chapter only, or a ranged category nobody ranged', () => {
    const unranged = categoryDetailView(
      modelOf({
        profile: profileOf([account('pea', 'pea')], [line('a', 'pea'), line('b', 'pea', { group: 'unknown' })]),
        snapshots: [snapshotOf([amountEntry('a', 1_000), amountEntry('b', 2_000)])],
      }),
      'markets',
      TODAY,
    )!
    expect(unranged.chapters).toBeNull()
    expect(categoryDetailView(model, 'secured', TODAY)!.chapters).toBeNull() // one line, one chapter
    expect(categoryDetailView(modelOf(), 'property', TODAY)!.chapters).toBeNull()
  })

  test('the available money is chaptered by account type', () => {
    const view = categoryDetailView(modelOf(), 'available', TODAY)!
    expect(view.chapters!.map((c) => c.id)).toEqual(['savings-books', 'current-accounts'])
    expect(view.chapters!.map((c) => c.label)).toEqual(['Livrets', 'Comptes courants'])
  })

  test('outside the grid, the sub-line only counts the lines', () => {
    const profile = profileOf(
      [account('pea', 'pea'), account('cc', 'current')],
      [line('a', 'pea', { group: 'us' }), line('b', 'pea', { group: 'europe' }), line('c', 'cc')],
    )
    const view = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([amountEntry('a', -1_000), amountEntry('b', -2_000), amountEntry('c', 5_000)])] }),
      'markets',
      TODAY,
    )!
    expect(view.squares).toBe(false)
    expect(view.chapters!.map((c) => plain(c.sub))).toEqual(['1 ligne sans prix', '1 ligne sans prix'])
  })

  test('masked subtotals', () => {
    setAmountsHidden(true)
    try {
      const view = categoryDetailView(model, 'markets', TODAY)!
      expect(view.chapters!.map((c) => c.euros)).toEqual(['•••', '•••', '•••'])
    } finally {
      setAmountsHidden(false)
    }
  })

  test('the subtotals are in euros', () => {
    expect(plain(markets.chapters![0].euros)).toBe('50 000 €')
  })

  test('the ranging link', () => {
    expect(markets.ranging).toEqual({ href: '/categorie/markets/ranger', label: 'Ranger par zone ›' })
    expect(categoryDetailView(model, 'secured', TODAY)!.ranging).toEqual({
      href: '/categorie/secured/ranger',
      label: 'Ranger par type ›',
    })
    for (const category of ['available', 'gold', 'property'] as const) {
      expect(categoryDetailView(modelOf(), category, TODAY)!.ranging).toBeNull()
    }
  })
})

describe('the gain since purchase of « Placements en bourse »', () => {
  // us: +200 € and −100 € on 1 000 € each; europe: a zero gain and an amount line; unknown: no
  // average price; japan: a dollar line, +100 $ on 1 000 $ at 0,9 € the dollar.
  const profile = profileOf(
    [account('pea', 'pea'), account('cto', 'securities')],
    [
      line('a', 'pea', { kind: 'units', group: 'us' }),
      line('b', 'pea', { kind: 'units', group: 'us' }),
      line('c', 'pea', { kind: 'units', group: 'europe' }),
      line('d', 'pea', { group: 'europe' }),
      line('e', 'pea', { kind: 'units' }),
      line('f', 'cto', { kind: 'units', currency: 'USD', group: 'japan' }),
    ],
  )
  const snapshot = snapshotOf(
    [
      unitsEntry('a', 10, 120, 100),
      unitsEntry('b', 10, 90, 100),
      unitsEntry('c', 10, 100, 100),
      amountEntry('d', 500),
      unitsEntry('e', 10, 50, null),
      unitsEntry('f', 10, 110, 100),
    ],
    { USD: 0.9 },
  )
  const view = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'markets', TODAY)!
  const chapter = (id: string) => view.chapters!.find((c) => c.id === id)!
  const figure = (gain: DetailChapter['gain']) =>
    gain === null || gain === 'unknown' ? gain : { tone: gain.tone, euros: plain(gain.euros), percent: plain(gain.percent) }
  const both = (tone: 'gain' | 'loss' | 'zero') => ({ euros: tone, percent: tone })

  test('a chapter adds its known gains and divides by their cost', () => {
    // +200 € − 100 € on 2 000 €.
    expect(figure(chapter('us').gain)).toEqual({ tone: both('gain'), euros: '+100 €', percent: '+5,0 %' })
  })

  test('a dollar line is converted with the snapshot’s rate, value and cost alike', () => {
    // 990 € worth, bought 900 €.
    expect(figure(chapter('japan').gain)).toEqual({ tone: both('gain'), euros: '+90 €', percent: '+10,0 %' })
  })

  test('an exact zero has no sign; an amount line is left out of the gain and counted', () => {
    expect(figure(chapter('europe').gain)).toEqual({ tone: both('zero'), euros: '0 €', percent: '0,0 %' })
    expect(plain(chapter('europe').sub)).toBe('1 ligne sans prix')
  })

  test('a chapter with no known gain says it does not know, never zero', () => {
    expect(chapter('unknown').gain).toBe('unknown')
    expect(plain(chapter('unknown').sub)).toBe('1 ligne sans prix')
    expect(plain(chapter('us').sub)).toBe('')
  })

  test('a loss carries the typographic minus', () => {
    const loss = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([unitsEntry('a', 10, 97, 100), unitsEntry('c', 10, 100, 100)])], goals: [] }),
      'markets',
      TODAY,
    )!
    expect(figure(loss.chapters!.find((c) => c.id === 'us')!.gain)).toEqual({ tone: both('loss'), euros: '−30 €', percent: '−3,0 %' })
    expect(loss.purchaseGain).toMatchObject({ kind: 'known', figure: { tone: both('loss') } })
  })

  test('the header adds every known line and leaves out the lines without a price', () => {
    // +200 − 100 + 0 + 90 = +190 € on 1 000 + 1 000 + 1 000 + 900 = 3 900 €: +4,87 %.
    const gain = view.purchaseGain
    if (gain?.kind !== 'known') throw new Error('expected a known gain')
    expect(gain.figure.tone).toEqual(both('gain'))
    expect(plain(gain.figure.euros)).toBe('+190 €')
    expect(plain(gain.figure.percent)).toBe('+4,9 %')
    expect(plain(gain.rest)).toBe('depuis l’achat, hors 2 lignes')
    expect(plain(gain.said.percent)).toBe('en hausse de 4,9 % depuis l’achat, sans compter 2 lignes sans prix d’achat')
    expect(plain(gain.said.euros)).toBe('en hausse de 190 € depuis l’achat, sans compter 2 lignes sans prix d’achat')
  })

  test('the lines left out of the header are the sum of those counted in the rows', () => {
    const missingIn = (sub: string) => Number(/(\d+) (?:lignes? )?sans prix$/.exec(plain(sub)!)?.[1] ?? 0)
    const counted = view.chapters!.reduce((n, c) => n + missingIn(c.sub), 0)
    expect(counted).toBe(2)
  })

  test('each chapter reads as one sentence to VoiceOver, without « + » nor « − »', () => {
    expect(plain(chapter('us').said!.percent)).toMatch(/^États-Unis, \d+ %, \d+ carrés sur 100, 2 lignes, en hausse de 5,0 % depuis l’achat$/)
    expect(plain(chapter('us').said!.euros)).toMatch(/^États-Unis, 2 100 €, .*, en hausse de 100 € depuis l’achat$/)
    expect(plain(chapter('unknown').said!.percent)).toMatch(/, 1 ligne sans prix, gain inconnu, prix d’achat manquant$/)
    expect(plain(chapter('europe').said!.percent)).toMatch(/, ni gain ni perte depuis l’achat$/)
  })

  test('a line whose gain cannot be known says its purchase price is missing', () => {
    const lines = view.chapters!.flatMap((c) => c.lines)
    const missing = Object.fromEntries(lines.map((l) => [l.lineId, l.noPrice]))
    expect(missing).toEqual({ a: null, b: null, c: null, d: 'prix d’achat manquant', e: 'prix d’achat manquant', f: null })
  })

  test('only a line held in parts can be given its missing price: an amount has none to give', () => {
    const lines = view.chapters!.flatMap((c) => c.lines)
    const settable = Object.fromEntries(lines.map((l) => [l.lineId, l.priceToSet]))
    expect(settable).toEqual({ a: false, b: false, c: false, d: false, e: true, f: false })
  })

  test('all known: no « hors »; none known: the header says it does not know', () => {
    const known = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([unitsEntry('a', 10, 120, 100)])], goals: [] }),
      'markets',
      TODAY,
    )!
    expect(known.purchaseGain).toMatchObject({ kind: 'known', rest: 'depuis l’achat' })
    expect(plain((known.purchaseGain as { said: { percent: string } }).said.percent)).toBe('en hausse de 20,0 % depuis l’achat')
    const none = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([amountEntry('d', 500), unitsEntry('e', 10, 50, null)])], goals: [] }),
      'markets',
      TODAY,
    )!
    expect(none.purchaseGain).toEqual({ kind: 'unknown', text: 'Gain depuis l’achat inconnu, prix d’achat manquants' })
  })

  test('« hors 1 ligne », in the singular', () => {
    const one = categoryDetailView(
      modelOf({ profile, snapshots: [snapshotOf([unitsEntry('a', 10, 120, 100), amountEntry('d', 500)])], goals: [] }),
      'markets',
      TODAY,
    )!
    expect(plain((one.purchaseGain as { rest: string }).rest)).toBe('depuis l’achat, hors 1 ligne')
    expect(plain((one.purchaseGain as { said: { percent: string } }).said.percent)).toMatch(/sans compter 1 ligne sans prix d’achat$/)
  })

  test('at today’s prices, the gain follows the day’s price', () => {
    const quoted = profileOf([account('pea', 'pea')], [line('a', 'pea', { kind: 'units', quoteSymbol: 'CW8.PA' })])
    const market: Market = { quotes: { 'CW8.PA': { price: 150, currency: 'EUR', asOf: '2026-11-06' } }, rates: null }
    const live = categoryDetailView(
      modelOf({ profile: quoted, snapshots: [snapshotOf([unitsEntry('a', 10, 120, 100)])], goals: [] }),
      'markets',
      '2026-11-08',
      market,
    )!
    expect(live.purchaseGain).toMatchObject({ kind: 'known', figure: { tone: both('gain') } })
    expect(plain((live.purchaseGain as { figure: { percent: string } }).figure.percent)).toBe('+50,0 %')
  })

  test('hidden amounts mask the euros, never the percents', () => {
    setAmountsHidden(true)
    try {
      const masked = categoryDetailView(modelOf({ profile, snapshots: [snapshot], goals: [] }), 'markets', TODAY)!
      const us = masked.chapters!.find((c) => c.id === 'us')!.gain
      expect(us).toMatchObject({ euros: '•••', tone: both('gain') })
      expect(plain((us as { percent: string }).percent)).toBe('+5,0 %')
      expect(masked.purchaseGain).toMatchObject({ figure: { euros: '•••' } })
    } finally {
      setAmountsHidden(false)
    }
  })

  describe('a gain that rounds to zero reads as zero, in the mode where it does', () => {
    const one = (entry: ReturnType<typeof unitsEntry>) =>
      categoryDetailView(
        modelOf({ profile: profileOf([account('pea', 'pea')], [line('a', 'pea', { kind: 'units' })]), snapshots: [snapshotOf([entry])], goals: [] }),
        'markets',
        TODAY,
      )!
    const headerOf = (view: CategoryDetailView) => {
      if (view.purchaseGain?.kind !== 'known') throw new Error('expected a known gain')
      const { figure, said } = view.purchaseGain
      return { tone: figure.tone, euros: plain(figure.euros), percent: plain(figure.percent), said: { euros: plain(said.euros), percent: plain(said.percent) } }
    }
    const neither = 'ni gain ni perte depuis l’achat'

    test('+1 cent on 100 €: zero in both modes, no result on the line', () => {
      const view = one(unitsEntry('a', 1, 100.01, 100))
      expect(headerOf(view)).toEqual({ tone: both('zero'), euros: '0 €', percent: '0,0 %', said: { euros: neither, percent: neither } })
      expect(view.lines[0].result).toBeNull()
    })

    test('−40 cents on 1 000 €: zero in both modes, never « −0 € »', () => {
      const view = one(unitsEntry('a', 10, 99.96, 100))
      expect(headerOf(view)).toEqual({ tone: both('zero'), euros: '0 €', percent: '0,0 %', said: { euros: neither, percent: neither } })
      expect(view.lines[0].result).toBeNull()
    })

    test('+30 € on 1 000 000 €: « +30 € » in euros, « 0,0 % » in percent', () => {
      const view = one(unitsEntry('a', 10_000, 100.003, 100))
      expect(headerOf(view)).toEqual({
        tone: { euros: 'gain', percent: 'zero' },
        euros: '+30 €',
        percent: '0,0 %',
        said: { euros: 'en hausse de 30 € depuis l’achat', percent: neither },
      })
      const result = view.lines[0].result!
      expect(result.tone).toEqual({ euros: 'gain', percent: 'zero' })
      expect(plain(result.euros)).toBe('a gagné 30 € depuis l’achat')
      expect(result.percent).toBe(neither)
    })
  })

  test('a line with 0 units or bought at 0 counts « sans prix »: no cost, no percent to give', () => {
    const profile = profileOf(
      [account('pea', 'pea')],
      [line('a', 'pea', { kind: 'units' }), line('zero-units', 'pea', { kind: 'units' }), line('free', 'pea', { kind: 'units' })],
    )
    const view = categoryDetailView(
      modelOf({
        profile,
        snapshots: [snapshotOf([unitsEntry('a', 10, 120, 100), unitsEntry('zero-units', 0, 50, 40), unitsEntry('free', 10, 50, 0)])],
        goals: [],
      }),
      'markets',
      TODAY,
    )!
    expect(Object.fromEntries([...view.lines, ...view.tooSmall].map((l) => [l.lineId, l.noPrice]))).toEqual({
      a: null,
      'zero-units': 'prix d’achat manquant',
      free: 'prix d’achat manquant',
    })
    expect(plain((view.purchaseGain as { rest: string }).rest)).toBe('depuis l’achat, hors 2 lignes')
  })

  test('only « Placements en bourse » tells it', () => {
    const secured = categoryDetailView(modelOf(), 'secured', TODAY)!
    expect(secured.purchaseGain).toBeNull()
    const available = categoryDetailView(modelOf(), 'available', TODAY)!
    expect(available.chapters!.every((c) => c.gain === null && c.said === null)).toBe(true)
    expect(available.chapters!.flatMap((c) => c.lines).every((l) => l.noPrice === null)).toBe(true)
  })
})

// Planche 1, option B (Nicolas, 12 November 2026): a line whose name only repeats its account's type
// (« Compte courant » three times) takes its bank as its title, and its grey line goes.
describe('the name of a line that only repeats its type', () => {
  const banks: Profile = {
    schema: 1,
    establishments: [
      { id: 'ca', name: 'Crédit Agricole', kind: 'institution' },
      { id: 'bb', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
    ],
    accounts: [
      { id: 'cc1', establishmentId: 'ca', type: 'current', name: 'Compte courant' },
      { id: 'cc2', establishmentId: 'bb', type: 'current', name: 'Compte courant' },
      { id: 'joint', establishmentId: 'bb', type: 'current', name: 'Compte de Léa' },
    ],
    lines: [
      { id: 'l1', accountId: 'cc1', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
      { id: 'l2', accountId: 'cc2', name: 'compte courant', kind: 'amount', currency: 'EUR' },
      { id: 'l3', accountId: 'joint', name: 'Compte de Léa', kind: 'amount', currency: 'EUR' },
    ],
  }
  const snap: Snapshot = {
    schema: 1, takenOn: '2026-10-31', fx: {}, contributions: {}, arrivals: {},
    entries: ['l1', 'l2', 'l3'].map((lineId) => ({ lineId, kind: 'amount' as const, amount: 100_000, seenOn: '2026-10-31' })),
  }
  const lines = () => {
    const view = categoryDetailView(modelOf({ profile: banks, snapshots: [snap] }), 'available', TODAY)!
    return [...(view.chapters?.flatMap((c) => c.lines) ?? []), ...view.lines].map((l) => [l.name, plain(l.where)])
  }
  test('its bank becomes its title; a name of one’s own stays, its bank beneath', () => {
    expect(lines()).toEqual(expect.arrayContaining([
      ['Crédit Agricole', ''],
      ['BoursoBank', ''],
      ['Compte de Léa', 'Compte courant chez BoursoBank'],
    ]))
  })
  test('two such lines at one bank keep their names, so they stay apart', () => {
    const twice: Profile = { ...banks, accounts: banks.accounts.map((a) => (a.id === 'cc1' ? { ...a, establishmentId: 'bb' } : a)) }
    const view = categoryDetailView(modelOf({ profile: twice, snapshots: [snap] }), 'available', TODAY)!
    const all = [...(view.chapters?.flatMap((c) => c.lines) ?? []), ...view.lines]
    expect(all.filter((l) => l.name === 'BoursoBank')).toHaveLength(0)
  })
})

// A chapter that mixes types (« Livrets »: a Livret A, an LDDS) keeps the type as the title, which says
// something there; only the bank stays beneath it (ruled on the e2e run, 12 November 2026).
describe('a line whose type tells it apart from its chapter', () => {
  const mixed: Profile = {
    schema: 1,
    establishments: [{ id: 'bb', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' }],
    accounts: [
      { id: 'la', establishmentId: 'bb', type: 'livret-a', name: 'Livret A' },
      { id: 'ld', establishmentId: 'bb', type: 'ldds', name: 'LDDS' },
    ],
    lines: [
      { id: 'la-l', accountId: 'la', name: 'Livret A', kind: 'amount', currency: 'EUR' },
      { id: 'ld-l', accountId: 'ld', name: 'LDDS', kind: 'amount', currency: 'EUR' },
    ],
  }
  const snap: Snapshot = {
    schema: 1, takenOn: '2026-10-31', fx: {}, contributions: {}, arrivals: {},
    entries: ['la-l', 'ld-l'].map((lineId) => ({ lineId, kind: 'amount' as const, amount: 100_000, seenOn: '2026-10-31' })),
  }
  test('keeps its type as its title, its bank alone beneath', () => {
    const view = categoryDetailView(modelOf({ profile: mixed, snapshots: [snap] }), 'available', TODAY)!
    const all = [...(view.chapters?.flatMap((c) => c.lines) ?? []), ...view.lines].map((l) => [l.name, plain(l.where)])
    expect(all).toEqual(expect.arrayContaining([['Livret A', 'chez BoursoBank'], ['LDDS', 'chez BoursoBank']]))
  })
})

// Nicolas, 12 November 2026: his current account at BoursoBank kept « Compte courant » because his Livret A
// is at BoursoBank too. Only the lines that take their bank as title can clash.
test('a livret at the same bank does not stop a current account from taking its bank as title', () => {
  const profile: Profile = {
    schema: 1,
    establishments: [
      { id: 'ca', name: 'Crédit Agricole', kind: 'institution' },
      { id: 'bb', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' },
    ],
    accounts: [
      { id: 'cc1', establishmentId: 'ca', type: 'current', name: 'Compte courant' },
      { id: 'cc2', establishmentId: 'bb', type: 'current', name: 'Compte courant' },
      { id: 'la', establishmentId: 'bb', type: 'livret-a', name: 'Livret A' },
    ],
    lines: [
      { id: 'l1', accountId: 'cc1', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
      { id: 'l2', accountId: 'cc2', name: 'Compte courant', kind: 'amount', currency: 'EUR' },
      { id: 'l3', accountId: 'la', name: 'Livret A', kind: 'amount', currency: 'EUR' },
    ],
  }
  const snap: Snapshot = {
    schema: 1, takenOn: '2026-10-31', fx: {}, contributions: {}, arrivals: {},
    entries: ['l1', 'l2', 'l3'].map((lineId) => ({ lineId, kind: 'amount' as const, amount: 100_000, seenOn: '2026-10-31' })),
  }
  const view = categoryDetailView(modelOf({ profile, snapshots: [snap] }), 'available', TODAY)!
  const all = [...(view.chapters?.flatMap((c) => c.lines) ?? []), ...view.lines].map((l) => [l.name, plain(l.where)])
  expect(all).toEqual(expect.arrayContaining([['Crédit Agricole', ''], ['BoursoBank', ''], ['Livret A', 'chez BoursoBank']]))
})

// The UI pass of 12 November 2026: in percents, the header does not say the big figure again.
test('in percents, the header says the gap and the goal, not the squares again', () => {
  const view = categoryDetailView(modelOf(), 'markets', TODAY)!
  expect(plain(view.headerPercent)).toBe('Un peu en dessous de ton objectif de 19 %.')
  expect(plain(view.header)).toBe('15 carrés sur 100, un peu en dessous de ton objectif (19 carrés)')
  const noGoal = categoryDetailView(modelOf({ goals: [] }), 'markets', TODAY)!
  expect(noGoal.headerPercent).toBe('')
})
