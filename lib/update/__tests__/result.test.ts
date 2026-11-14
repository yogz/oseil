import { describe, expect, test } from 'vitest'
import { amountEntry, exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { formatEuros } from '@/lib/format'
import { NO_MARKET } from '@/lib/market/live'
import type { Rates } from '@/lib/market/types'
import type { Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { confirmLine, markStep, restateValue, setTakenOn, setValue, startDraft } from '../draft'
import { putAddedLine, setPaidTotal } from '../lines'
import { resultView, splitView, type ResultView } from '../result'

const TODAY = '2026-11-07'
const base = exampleSnapshot
const profile = exampleProfile
const fresh = () => startDraft('s1')
let counter = 0
const id = () => `new-${++counter}`

// Intl writes its narrow and plain no-break spaces; the tests read plain spaces.
function plain<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/[  ]/g, ' ') as T
  if (Array.isArray(value)) return value.map(plain) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)])) as T
  }
  return value
}
const euros = (cents: number) => plain(formatEuros(cents))

function resultOf(draft: UpdateDraft, from: Snapshot = base, p: Profile = profile, today = TODAY) {
  const view = resultView(p, from, draft, today, NO_MARKET)
  if (view.kind !== 'result') throw new Error(`expected a result, got ${view.kind}`)
  return plain(view)
}

// What a draft written before the totals holds: a sum typed as paid in since the base. It still counts.
const setContribution = (draft: UpdateDraft, accountId: string, cents: number): UpdateDraft => ({
  ...draft,
  contributions: { ...draft.contributions, [accountId]: cents },
})

const allDone = (draft: UpdateDraft) => ['home', 'boursobank', 'linxea'].reduce((d, step) => markStep(d, step, 'done'), draft)

// The plan's worked example: Livret A +1 000 €, the ETF's price at 260, the fonds euros
// +900 € of which 500 € paid in, 1 100 € of the mortgage repaid, the house confirmed.
function workedExample(): UpdateDraft {
  let draft = fresh()
  draft = setValue(draft, base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
  draft = setValue(draft, base, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, TODAY, {})
  draft = setValue(draft, base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TODAY, {})
  draft = setContribution(draft, 'life', 50_000)
  draft = setValue(draft, base, 'mortgage-line', { kind: 'amount', amount: 17_890_000 }, TODAY, {})
  draft = confirmLine(draft, 'house-line')
  return allDone(draft)
}

const EFFORT = { part: 'effort', label: 'Ton effort', detail: 'ce que tu as mis de côté' } as const
const MARKETS = {
  part: 'markets',
  label: 'Les marchés et les intérêts',
  detail: 'ce que ton argent a rapporté tout seul',
} as const
const PROPERTY = { part: 'property', label: 'Ton immobilier réestimé', detail: 'une estimation, pas une vente' } as const
const EXISTING = {
  part: 'existing',
  label: 'Ce que tu avais déjà',
  detail: 'ajouté cette fois, il ne compte ni dans ton effort ni dans les marchés',
} as const
const firstTotal = (name: string) =>
  `C’est ton premier total versé sur « ${name} » : le partage sera juste à partir de la prochaine mise à jour.`
const nothingPaidIn = (name: string) =>
  `Rien n’est noté comme versé sur « ${name} » : tout ce qui a bougé y est compté dans les marchés et les intérêts.`

describe('resultView: the worked example', () => {
  test('what is yours, the change, the square, the split, what moved, and the date', () => {
    expect(resultOf(workedExample())).toEqual({
      kind: 'result',
      net: '206 000 €',
      since: '4 000 € de plus qu’au 30 septembre',
      square: { value: '2 060 €', then: '2 020 €', day: '30 septembre' },
      replay: { before: expect.any(Array), after: expect.any(Array), beforeHome: null, afterHome: null, beforeDay: '30 septembre', afterDay: '7 novembre' },
      noGridSentence: null,
      split: {
        bar: [
          { part: 'effort', share: 0.65 },
          { part: 'markets', share: 0.35 },
        ],
        rows: [
          { ...EFFORT, detail: 'ce que tu as mis de côté, crédit remboursé compris', amount: '2 600 €', loss: false },
          { ...MARKETS, amount: '1 400 €', loss: false },
        ],
      },
      changes: [
        { category: 'available', name: 'Argent disponible', amount: '+1 000 €' },
        { category: 'markets', name: 'Placements en bourse', amount: '+1 000 €' },
        { category: 'secured', name: 'Épargne sécurisée', amount: '+900 €' },
      ],
      loans: 'Crédit remboursé 1 100 €',
      unchanged: 'Le reste n’a pas bougé : or et crypto, immobilier.',
      notReviewed: null,
      notes: [],
      missing: [],
      rateNote: null,
      date: { value: TODAY, label: 'Relevé du 7 novembre', min: '2026-09-30', max: TODAY },
    } satisfies ResultView)
  })

  // C2 (decided by Nicolas on 9 November 2026): the grid of the snapshot before, then the new one.
  test('the replay goes from the grid of the last snapshot to the new one, square by square, never moving one', () => {
    const view = resultOf(workedExample())
    if (view.kind !== 'result' || view.replay === null) throw new Error('a replay was expected')
    expect(view.replay.before).toHaveLength(100)
    expect(view.replay.after).toHaveLength(100)
    const before = resultOf(allDone(fresh()))
    if (before.kind !== 'result' || before.replay === null) throw new Error('a replay was expected')
    // Nothing typed: the same grid twice, so no square changes colour.
    expect(before.replay.after).toEqual(before.replay.before)
    // Each cell holds a category, in the order of the grid, as in Évolution.
    expect(new Set(view.replay.after)).toEqual(new Set(view.replay.after.filter(Boolean)))
  })
})

describe('resultView: the banks not reviewed', () => {
  test('Linxea skipped and untouched', () => {
    let draft = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    draft = confirmLine(draft, 'house-line')
    draft = markStep(markStep(markStep(draft, 'home', 'done'), 'boursobank', 'done'), 'linxea', 'skipped')
    expect(resultOf(draft).notReviewed).toBe('1 banque non revue : ses chiffres datent du 30 septembre')
  })

  test('a bank skipped after one of its lines was typed is still not reviewed, with its oldest date', () => {
    let draft = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    draft = confirmLine(draft, 'house-line')
    draft = markStep(markStep(markStep(draft, 'home', 'done'), 'boursobank', 'skipped'), 'linxea', 'done')
    expect(resultOf(draft).notReviewed).toBe('1 banque non revue : ses chiffres datent du 30 septembre')
  })

  test('nothing reviewed: « Chez toi » and both banks are named, in the order of the steps', () => {
    expect(resultOf(fresh()).notReviewed).toBe(
      'Pas revus cette fois : Chez toi, BoursoBank, Linxea. Leurs chiffres datent du 30 septembre.',
    )
  })
})

describe('resultView: money taken out of a life insurance (Review Focus 4)', () => {
  const fundDown = () => setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 2_810_000 }, TODAY, {})

  test('-2 000 € noted as paid in lowers the effort; the markets keep the 100 € of interest, not a loss', () => {
    const view = resultOf(setContribution(fundDown(), 'life', -200_000))
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: euros(-200_000), loss: false },
      { ...MARKETS, amount: euros(10_000), loss: false },
    ])
    expect(view.split.bar).toBeNull()
    expect(view.notes).toEqual([])
    expect(view.changes).toEqual([{ category: 'secured', name: 'Épargne sécurisée', amount: euros(-190_000) }])
  })

  test('left at 0, all of it is counted as markets and interest, a loss, and the result says so', () => {
    const view = resultOf(fundDown())
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: euros(0), loss: false },
      { ...MARKETS, amount: euros(-190_000), loss: true },
    ])
    expect(view.split.bar).toBeNull()
    expect(view.notes).toEqual([nothingPaidIn('Assurance-vie')])
  })
})

describe('resultView: the split', () => {
  test('the house re-estimated has its own row and its share of the bar', () => {
    let draft = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TODAY, {})
    draft = restateValue(draft, base, 'house-line', { kind: 'amount', amount: 32_000_000 }, TODAY)
    const view = resultOf(allDone(draft))
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: '1 000 €', loss: false },
      { ...MARKETS, amount: '0 €', loss: false },
      { ...PROPERTY, amount: '20 000 €', loss: false },
    ])
    expect(view.split.bar).toEqual([
      { part: 'effort', share: 1_000 / 21_000 },
      { part: 'property', share: 20_000 / 21_000 },
    ])
    expect(view.changes).toEqual([
      { category: 'property', name: 'Immobilier', amount: '+20 000 €' },
      { category: 'available', name: 'Argent disponible', amount: '+1 000 €' },
    ])
    expect(view.unchanged).toBe('Le reste n’a pas bougé : épargne sécurisée, placements en bourse, or et crypto.')
  })

  test('a fund the person already had has its own row, and stays out of the bar', () => {
    const fund = putAddedLine(
      profile,
      fresh(),
      {
        accountId: 'pea',
        name: 'Fonds monde',
        entry: { kind: 'units', units: 10, unitPrice: 50, averagePrice: 40 },
        arrival: 'existing',
      },
      TODAY,
      id,
    )
    const view = resultOf(fund.draft)
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: '0 €', loss: false },
      { ...MARKETS, amount: '0 €', loss: false },
      { ...EXISTING, amount: '500 €', loss: false },
    ])
    expect(view.split.bar).toBeNull()
    expect(view.since).toBe('500 € de plus qu’au 30 septembre')
    expect(view.changes).toEqual([{ category: 'markets', name: 'Placements en bourse', amount: '+500 €' }])
  })

  // A fund opened in a life insurance already followed is money that entered the account:
  // it is counted through « Combien a été versé dessus ? ». Left at 0, the result says so.
  test('a fund opened in the life insurance with nothing paid in goes to the markets, and the result says so', () => {
    const fund = putAddedLine(
      profile,
      fresh(),
      {
        accountId: 'life',
        name: 'Fonds actions',
        entry: { kind: 'units', units: 10, unitPrice: 500, averagePrice: 500 },
        arrival: 'opened',
      },
      TODAY,
      id,
    )
    const view = resultOf(fund.draft)
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: '0 €', loss: false },
      { ...MARKETS, amount: '5 000 €', loss: false },
    ])
    expect(view.notes).toEqual([nothingPaidIn('Assurance-vie')])
    expect(resultOf(setContribution(fund.draft, 'life', 500_000)).split.rows).toEqual([
      { ...EFFORT, amount: '5 000 €', loss: false },
      { ...MARKETS, amount: '0 €', loss: false },
    ])
  })

  test('totals paid in on both sides: the effort is their difference, and no note', () => {
    const withTotal: Snapshot = { ...base, paidTotals: { life: 2_000_000 } }
    const fundUp = setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TODAY, {})
    const view = resultOf(setPaidTotal(fundUp, 'life', 2_050_000), withTotal)
    expect(view.split.rows).toEqual([
      { ...EFFORT, amount: '500 €', loss: false },
      { ...MARKETS, amount: '400 €', loss: false },
    ])
    expect(view.notes).toEqual([])
  })

  test('a total typed now with none before: still guessed, and the note says it is the first', () => {
    const fundUp = setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TODAY, {})
    expect(resultOf(setPaidTotal(fundUp, 'life', 2_050_000)).notes).toEqual([firstTotal('Assurance-vie')])
  })

  test('a typed 0 paid in is a known answer: no note', () => {
    const fund = putAddedLine(
      profile,
      fresh(),
      {
        accountId: 'life',
        name: 'Fonds actions',
        entry: { kind: 'units', units: 10, unitPrice: 500, averagePrice: 500 },
        arrival: 'opened',
      },
      TODAY,
      id,
    )
    expect(resultOf(setContribution(fund.draft, 'life', 0)).notes).toEqual([])
  })

  test('a fund the person already had, added to the life insurance, is no reason for a note', () => {
    const fund = putAddedLine(
      profile,
      fresh(),
      {
        accountId: 'life',
        name: 'Fonds actions',
        entry: { kind: 'units', units: 10, unitPrice: 500, averagePrice: 500 },
        arrival: 'existing',
      },
      TODAY,
      id,
    )
    const view = resultOf(fund.draft)
    expect(view.split.rows).toContainEqual({ ...EXISTING, amount: '5 000 €', loss: false })
    expect(view.notes).toEqual([])
  })

  test('more owed: « Crédit en plus », a negative effort that is no loss, and no bar', () => {
    const draft = setValue(fresh(), base, 'mortgage-line', { kind: 'amount', amount: 18_500_000 }, TODAY, {})
    const view = resultOf(draft)
    expect(view.loans).toBe('Crédit en plus 5 000 €')
    expect(view.split.rows[0]).toEqual({ ...EFFORT, amount: euros(-500_000), loss: false })
    expect(view.split.bar).toBeNull()
    expect(view.since).toBe('5 000 € de moins qu’au 30 septembre')
    expect(view.square).toEqual({ value: '1 970 €', then: '2 020 €', day: '30 septembre' })
    expect(view.changes).toEqual([])
    expect(view.unchanged).toBe(
      'Le reste n’a pas bougé : argent disponible, épargne sécurisée, placements en bourse, or et crypto, immobilier.',
    )
  })

  test('nothing changed: « Autant », a square that did not move, no bar, and it is said', () => {
    const view = resultOf(allDone(fresh()))
    expect(view.since).toBe('Autant qu’au 30 septembre')
    expect(view.square).toEqual({ value: '2 020 €', then: null, day: '30 septembre' })
    expect(view.split.bar).toBeNull()
    expect(view.changes).toEqual([])
    expect(view.loans).toBeNull()
    expect(view.unchanged).toBe('Rien n’a bougé depuis le 30 septembre.')
  })
})

// docs/superpowers/specs/2026-11-14-interets-livrets-design.md
describe('splitView: the estimated interest of the livrets', () => {
  const split = (estimatedInterest: number) => ({
    effort: 100_000,
    markets: 20_000 + estimatedInterest,
    property: 0,
    existingAdded: 0,
    total: 120_000 + estimatedInterest,
    estimatedInterest,
  })
  const markets = (estimatedInterest: number) =>
    splitView(split(estimatedInterest), 0, 'déjà').rows.find((r) => r.part === 'markets')!

  test('says the interest is in the markets row when the period holds some, with no amount of its own', () => {
    expect(markets(21_575)).toEqual({
      ...MARKETS,
      detail: 'ce que ton argent a rapporté tout seul, intérêts des livrets estimés compris',
      amount: formatEuros(41_575),
      loss: false,
    })
    expect(splitView(split(21_575), 0, 'déjà').rows.map((r) => r.part)).toEqual(['effort', 'markets'])
  })

  test('keeps the usual words when the period holds none', () => {
    expect(markets(0).detail).toBe('ce que ton argent a rapporté tout seul')
  })
})

describe('resultView: the grid', () => {
  test('owing more than is owned: no square, and the sentence of the new situation', () => {
    const draft = setValue(fresh(), base, 'mortgage-line', { kind: 'amount', amount: 40_000_000 }, TODAY, {})
    const view = resultOf(draft)
    expect(view.square).toBeNull()
    expect(view.noGridSentence).toBe(
      'Pour l’instant, ce que tu dois dépasse ce que tu possèdes : la grille apparaîtra quand ce sera l’inverse.',
    )
  })

  test('a base without a grid: no square to compare, and no sentence since the new one has a grid', () => {
    const owing: Snapshot = {
      ...base,
      entries: base.entries.map((e) => (e.lineId === 'mortgage-line' ? amountEntry('mortgage-line', 400_000) : e)),
    }
    const draft = setValue(fresh(), owing, 'mortgage-line', { kind: 'amount', amount: 17_890_000 }, TODAY, {})
    const view = resultOf(draft, owing)
    expect(view.square).toBeNull()
    expect(view.noGridSentence).toBeNull()
  })
})

describe('resultView: the date', () => {
  test('a date chosen on the result screen: the label, the bounds, and the lines seen on it', () => {
    const view = resultOf(setTakenOn(allDone(fresh()), '2026-10-15'))
    expect(view.date).toEqual({ value: '2026-10-15', label: 'Relevé du 15 octobre', min: '2026-09-30', max: TODAY })
    expect(view.notReviewed).toBeNull()
  })

  test('a base dated after today (a clock behind): its own day, which is the only one allowed', () => {
    const ahead: Snapshot = { ...base, takenOn: '2026-11-08' }
    expect(resultOf(fresh(), ahead).date).toEqual({
      value: '2026-11-08',
      label: 'Relevé du 8 novembre',
      min: '2026-11-08',
      max: '2026-11-08',
    })
  })
})

describe('resultView: what cannot be computed', () => {
  const withEtf = (extra: Partial<Profile['lines'][number]>): Profile => ({
    ...profile,
    lines: profile.lines.map((l) => (l.id === 'etf' ? { ...l, ...extra } : l)),
  })

  const withOther: Profile = {
    ...profile,
    accounts: [...profile.accounts, { id: 'other', establishmentId: 'boursobank', type: 'other', name: 'Autre' }],
    lines: [...profile.lines, { id: 'other-line', accountId: 'other', name: 'Autre', kind: 'amount', currency: 'EUR' }],
  }
  const cases: Array<[string, Profile, Snapshot]> = [
    [
      'an entry of the base snapshot for a line the profile does not know (R1)',
      profile,
      { ...base, entries: [...base.entries, amountEntry('ghost', 100)] },
    ],
    ['a rate missing for a line in dollars', withEtf({ currency: 'USD' }), base],
    [
      'a line of « Autre compte » with no category',
      withOther,
      { ...base, entries: [...base.entries, amountEntry('other-line', 100)] },
    ],
    ['a base entry of another kind than its line', withEtf({ kind: 'amount' }), base],
  ]

  test.each(cases)('%s gives an error', (_case, p, from) => {
    expect(resultView(p, from, workedExample(), TODAY, NO_MARKET)).toEqual({ kind: 'error' })
  })

  test('any other error goes up', () => {
    const broken: Profile = {
      ...profile,
      accounts: profile.accounts.map((a) => (a.id === 'life' ? { ...a, type: 'unknown' as never } : a)),
    }
    expect(() => resultView(broken, base, workedExample(), TODAY, NO_MARKET)).toThrow(TypeError)
  })
})

// Review Focus 4: the ECB unreachable while a dollar line exists. Nothing shows 0, nothing
// throws, and the result says which rate it used, or that « Enregistrer » waits.
describe('resultView: the rates of the new snapshot', () => {
  const RATES: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
  const withUsFund = () =>
    putAddedLine(
      profile,
      allDone(fresh()),
      {
        accountId: 'pea',
        name: 'Fonds US',
        entry: { kind: 'units', units: 10, unitPrice: 50, averagePrice: 40 },
        currency: 'USD',
        arrival: 'existing',
      },
      TODAY,
      id,
    ).draft

  test('a line in dollars with no rate at all: the result waits, and says why', () => {
    expect(resultView(profile, base, withUsFund(), TODAY, { prices: {}, rates: null })).toEqual({
      kind: 'missing-rate',
      sentence:
        'Le taux du jour des dollars américains n’a pas pu être récupéré\u00A0: ce relevé ne peut pas encore être enregistré. Rien n’est perdu.',
    })
  })

  test('no market at all is the same: no rate is made up', () => {
    expect(resultView(profile, base, withUsFund(), TODAY, NO_MARKET)).toMatchObject({ kind: 'missing-rate' })
  })

  // A result counted without the market would say the ECB did not answer, and count the base
  // prices while the save takes today's: the market is never optional. tsc checks this line.
  test('the result cannot be counted without the market', () => {
    // @ts-expect-error: the market is required.
    expect(resultView(profile, base, withUsFund(), TODAY)).toMatchObject({ kind: 'missing-rate' })
  })

  test('the ECB silent, with the base snapshot’s rate: the figures, and the note that says so', () => {
    const view = resultView(profile, { ...base, fx: { USD: 0.92 } }, withUsFund(), TODAY, { prices: {}, rates: null })
    expect(view).toMatchObject({
      kind: 'result',
      rateNote:
        'La Banque centrale européenne n’a pas répondu\u00A0: les dollars américains sont convertis au taux de ton relevé du 30 septembre.',
    })
    // 10 × 50 $ at 0,92 €: 460 €.
    expect(plain(view.kind === 'result' ? view.split.rows : [])).toContainEqual({ ...EXISTING, amount: '460 €', loss: false })
  })

  test('with today’s rates: converted at the ECB’s rate of the day, and it is said', () => {
    const view = resultView(profile, base, withUsFund(), TODAY, { prices: {}, rates: RATES })
    expect(view).toMatchObject({
      kind: 'result',
      rateNote: 'Converti en euros au taux de la Banque centrale européenne du 6 novembre.',
    })
    // 10 × 50 $ ÷ 1,1165: 447,83 €, shown 448 €.
    expect(plain(view.kind === 'result' ? view.split.rows : [])).toContainEqual({ ...EXISTING, amount: '448 €', loss: false })
  })

  test('euros only: no note', () => {
    expect(resultOf(workedExample()).rateNote).toBeNull()
    expect(plain(resultView(profile, base, workedExample(), TODAY, { prices: {}, rates: RATES }))).toMatchObject({
      kind: 'result',
      rateNote: null,
    })
  })
})

describe('resultView: today’s prices', () => {
  const PRICES = { etf: 260 }
  const quoted: Profile = {
    ...profile,
    lines: profile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }

  test('the ETF at today’s 260 instead of 250: 1 000 € more, all of it the markets’', () => {
    const view = resultView(quoted, base, allDone(fresh()), TODAY, { prices: PRICES, rates: null })
    if (view.kind !== 'result') throw new Error(`expected a result, got ${view.kind}`)
    expect(plain(view.since)).toMatch(/^1\s000\s€ de plus qu’au 30 septembre$/)
    expect(plain(view.split.rows)).toContainEqual({ ...MARKETS, amount: '1 000 €', loss: false })
    expect(plain(view.changes)).toEqual([{ category: 'markets', name: 'Placements en bourse', amount: '+1 000 €' }])
  })

  test('the base price typed back over today’s: nothing moved', () => {
    const typed = setValue(
      allDone(fresh()),
      base,
      'etf',
      { kind: 'units', units: 100, unitPrice: 250, averagePrice: 200 },
      TODAY,
      PRICES,
    )
    const view = resultView(quoted, base, typed, TODAY, { prices: PRICES, rates: null })
    expect(plain(view)).toMatchObject({ kind: 'result', since: 'Autant qu’au 30 septembre' })
  })

  // A bank passed: its figures are those of the base, except the price of its shares, which is today's.
  test('BoursoBank passed, its ETF at today’s price: « non revue », except that price', () => {
    const draft = markStep(markStep(markStep(fresh(), 'home', 'done'), 'boursobank', 'skipped'), 'linxea', 'done')
    const view = resultView(quoted, base, draft, TODAY, { prices: PRICES, rates: null })
    expect(plain(view)).toMatchObject({
      kind: 'result',
      notReviewed: '1 banque non revue : ses chiffres datent du 30 septembre, sauf le prix du jour de tes actions',
    })
  })

  test('a bank passed with no line at today’s price: the sentence as before', () => {
    const draft = markStep(markStep(markStep(fresh(), 'home', 'done'), 'boursobank', 'done'), 'linxea', 'skipped')
    const view = resultView(quoted, base, draft, TODAY, { prices: PRICES, rates: null })
    expect(plain(view)).toMatchObject({ kind: 'result', notReviewed: '1 banque non revue : ses chiffres datent du 30 septembre' })
  })

  test('the ETF typed in the bank passed: its price is no longer the old one’s to except', () => {
    let draft = markStep(markStep(markStep(fresh(), 'home', 'done'), 'boursobank', 'skipped'), 'linxea', 'done')
    draft = setValue(draft, base, 'etf', { kind: 'units', units: 120, unitPrice: 260, averagePrice: 200 }, TODAY, PRICES)
    const view = resultView(quoted, base, draft, TODAY, { prices: PRICES, rates: null })
    expect(plain(view)).toMatchObject({ kind: 'result', notReviewed: '1 banque non revue : ses chiffres datent du 30 septembre' })
  })
})

describe('resultView: lines with no amount (R20)', () => {
  const withNew: Profile = {
    ...profile,
    lines: [...profile.lines, { id: 'new-line', accountId: 'livret-a', name: 'Livret bis', kind: 'amount', currency: 'EUR' }],
  }
  const livret = profile.accounts.find((a) => a.id === profile.lines.find((l) => l.id === 'livret-a-line')?.accountId)!
  const bank = profile.establishments.find((e) => e.id === livret.establishmentId)!

  test('an open line with no base entry and nothing typed is missing, even confirmed « Rien n’a changé ici »', () => {
    const p: Profile = {
      ...withNew,
      lines: withNew.lines.map((l) => (l.id === 'new-line' ? { ...l, accountId: livret.id } : l)),
    }
    const draft = confirmLine(fresh(), 'new-line')
    expect(resultOf(draft, base, p).missing).toEqual([
      { id: 'new-line', name: 'Livret bis', establishment: bank.name, establishmentId: bank.id },
    ])
  })

  test('typing an amount clears it', () => {
    const p: Profile = {
      ...withNew,
      lines: withNew.lines.map((l) => (l.id === 'new-line' ? { ...l, accountId: livret.id } : l)),
    }
    const draft = setValue(fresh(), base, 'new-line', { kind: 'amount', amount: 1_000 }, TODAY, {})
    expect(resultOf(draft, base, p).missing).toEqual([])
  })
})

describe('resultView: rounding (R20)', () => {
  const livretAt = (cents: number): Snapshot => ({
    ...base,
    entries: base.entries.map((e) => (e.lineId === 'livret-a-line' ? amountEntry('livret-a-line', cents / 100) : e)),
  })
  const typed = (from: Snapshot, cents: number) =>
    resultOf(setValue(fresh(), from, 'livret-a-line', { kind: 'amount', amount: cents }, TODAY, {}), from)

  test('a real difference of 0,20 € that crosses a euro: the shown nets differ by 1 €, so « 1 € de plus »', () => {
    const view = typed(livretAt(1_200_040), 1_200_060)
    expect(view.since).toBe('1 € de plus qu’au 30 septembre')
  })

  test('a real difference of 0,80 € that stays inside a euro: the shown nets are equal, so « Autant »', () => {
    const view = typed(livretAt(1_200_060), 1_200_140)
    expect(view.since).toBe('Autant qu’au 30 septembre')
  })

  test('the square: 2 020 € then 2 021 € shown, so the old value is said, though the real change is under a cent', () => {
    const view = typed(livretAt(1_204_960), 1_205_040)
    expect(view.square).toEqual({ value: '2 021 €', then: '2 020 €', day: '30 septembre' })
  })
})
