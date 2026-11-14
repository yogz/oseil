import { describe, expect, test } from 'vitest'
import type { Rates } from '@/lib/market/types'
import { amountEntry, exampleProfile, exampleSnapshot, unitsEntry } from '@/lib/model/__tests__/fixtures'
import { splitChange } from '@/lib/model/change'
import { parseProfile, parseSnapshot, parseUpdateDraft } from '@/lib/model/documents'
import type { Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { buildUpdate, takenOnError } from '../build'
import {
  addEstablishment,
  withAddedEstablishments,
  confirmLine,
  currentEntry,
  markStep,
  nothingChangedHere,
  restateValue,
  setValue,
  skipTheRest,
  startDraft,
  tidyDraft,
} from '../draft'
import { addAccount, closeLine, putAddedLine, removeAddedLine, setPaidTotal } from '../lines'

const TYPED_ON = '2026-11-05' // the day a value was typed, before the snapshot's own date
const TAKEN_ON = '2026-11-07'
const BASE_DAY = '2026-09-30'
const RATES: Rates = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }
const base = exampleSnapshot
const profile = exampleProfile
const fresh = () => startDraft('s1')
let counter = 0
const id = () => `new-${++counter}`

const seenOnOf = (snapshot: Snapshot) => Object.fromEntries(snapshot.entries.map((e) => [e.lineId, e.seenOn]))
const entryOf = (snapshot: Snapshot, lineId: string) => snapshot.entries.find((e) => e.lineId === lineId)
const lineOf = (p: Profile, lineId: string) => p.lines.find((l) => l.id === lineId)

function expectParses(result: { profile: Profile; snapshot: Snapshot }) {
  expect(parseProfile(result.profile)).toEqual(result.profile)
  expect(parseSnapshot(result.snapshot)).toEqual(result.snapshot)
}

// A LEP opened since, in BoursoBank: an added account and its line.
function withLep(draft: UpdateDraft = fresh()) {
  const account = addAccount(
    profile,
    draft,
    { establishmentId: 'boursobank', type: 'lep', name: 'LEP', arrival: 'opened' },
    id,
  )
  const line = putAddedLine(
    profile,
    account.draft,
    { accountId: account.accountId, name: 'LEP', entry: { kind: 'amount', amount: 200_000 } },
    TYPED_ON,
    id,
  )
  return { draft: line.draft, accountId: account.accountId, lineId: line.lineId }
}

// A fund the person already had, added to the PEA of the profile: a line with its own arrival.
function withFund(draft: UpdateDraft = fresh()) {
  const line = putAddedLine(
    profile,
    draft,
    {
      accountId: 'pea',
      name: 'Fonds monde',
      entry: { kind: 'units', units: 10, unitPrice: 50, averagePrice: 40 },
      arrival: 'existing',
    },
    TYPED_ON,
    id,
  )
  return { draft: line.draft, lineId: line.lineId }
}

// Coinbase added during the update, and crypto in it (Nicolas, 10 November 2026).
describe('buildUpdate: a bank added during the update', () => {
  function withCoinbase() {
    const draft = addEstablishment(profile, fresh(), { name: 'Coinbase', catalogId: 'coinbase' }, () => 'cb')
    const shown = withAddedEstablishments(profile, draft)
    const account = addAccount(shown, draft, { establishmentId: 'cb', type: 'crypto', name: 'Crypto', arrival: 'opened' }, id)
    const line = putAddedLine(
      shown,
      account.draft,
      { accountId: account.accountId, name: 'Bitcoin', entry: { kind: 'amount', amount: 50_000 } },
      TYPED_ON,
      id,
    )
    return { draft: line.draft, accountId: account.accountId, lineId: line.lineId }
  }

  test('goes into the profile with its account and line, through the saved draft', () => {
    const { draft, accountId, lineId } = withCoinbase()
    const reread = parseUpdateDraft(JSON.parse(JSON.stringify(draft)))!
    expect(reread).toEqual(draft)
    const built = buildUpdate(profile, base, reread, TAKEN_ON)
    expect(built.profile.establishments.at(-1)).toEqual({ id: 'cb', name: 'Coinbase', kind: 'institution', catalogId: 'coinbase' })
    expect(built.profile.accounts.find((a) => a.id === accountId)?.establishmentId).toBe('cb')
    expect(built.snapshot.entries.find((e) => e.lineId === lineId)).toMatchObject({ amount: 50_000 })
    expect(parseProfile(built.profile)).toEqual(built.profile)
  })

  test('is written once, whether the profile given already shows it or not', () => {
    const { draft } = withCoinbase()
    const built = buildUpdate(withAddedEstablishments(profile, draft), base, draft, TAKEN_ON)
    expect(built.profile.establishments.filter((e) => e.id === 'cb')).toHaveLength(1)
  })

  test('an added bank left empty stays in the profile', () => {
    const draft = addEstablishment(profile, fresh(), { name: 'Kraken', catalogId: 'kraken' }, () => 'kr')
    const built = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(built.profile.establishments.map((e) => e.id)).toContain('kr')
  })
})

describe('buildUpdate: a home added with its type', () => {
  test('a rental added in the update keeps its type through the saved draft and into the profile', () => {
    const account = addAccount(
      profile,
      fresh(),
      { establishmentId: 'home', type: 'home', name: 'Logement en location', arrival: 'existing', residence: 'rental' },
      id,
    )
    const added = putAddedLine(
      profile,
      account.draft,
      { accountId: account.accountId, name: 'Logement en location', entry: { kind: 'amount', amount: 15_000_000 } },
      TYPED_ON,
      id,
    ).draft
    // The draft is saved encrypted, and read back before the update is built.
    const reread = parseUpdateDraft(JSON.parse(JSON.stringify(added)))!
    const built = buildUpdate(profile, base, reread, TAKEN_ON)
    expect(built.profile.accounts.find((a) => a.id === account.accountId)).toMatchObject({ type: 'home', residence: 'rental' })
    expect(parseProfile(built.profile)).not.toBeNull()
  })
})

describe('buildUpdate: the values and their « vue le » dates', () => {
  test('an empty draft keeps every value and every date, and both documents parse', () => {
    const next = buildUpdate(profile, base, fresh(), TAKEN_ON)
    expect(next.profile).toEqual(profile)
    expect(next.snapshot).toEqual({ ...base, takenOn: TAKEN_ON })
    expect(new Set(next.snapshot.entries.map((e) => e.seenOn))).toEqual(new Set([BASE_DAY]))
    expectParses(next)
  })

  test('Livret A typed and BoursoBank done: its three lines are seen on the snapshot’s date, Linxea’s are not', () => {
    const typed = setValue(fresh(), base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TYPED_ON, {})
    const next = buildUpdate(profile, base, markStep(typed, 'boursobank', 'done'), TAKEN_ON)
    expect(seenOnOf(next.snapshot)).toMatchObject({
      'current-line': TAKEN_ON,
      'livret-a-line': TAKEN_ON,
      etf: TAKEN_ON,
      'euro-fund': BASE_DAY,
      'life-uc': BASE_DAY,
    })
    expect(entryOf(next.snapshot, 'livret-a-line')).toEqual(amountEntry('livret-a-line', 13_000, TAKEN_ON))
    expect(entryOf(next.snapshot, 'current-line')).toEqual(amountEntry('current-line', 8_000, TAKEN_ON))
  })

  test('« Terminer ici »: the bank finished is seen today, the banks left keep their old date', () => {
    const draft = skipTheRest(profile, nothingChangedHere(profile, fresh(), 'boursobank'), 'boursobank')
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(seenOnOf(next.snapshot)).toMatchObject({
      'current-line': TAKEN_ON,
      'livret-a-line': TAKEN_ON,
      etf: TAKEN_ON,
      'euro-fund': BASE_DAY,
      'life-uc': BASE_DAY,
      'house-line': BASE_DAY,
      'gold-line': BASE_DAY,
    })
    expectParses(next)
  })

  test('a typed value takes the snapshot’s date, not the day it was typed, even in a bank not done', () => {
    const typed = setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TYPED_ON, {})
    const next = buildUpdate(profile, base, markStep(typed, 'linxea', 'skipped'), TAKEN_ON)
    expect(entryOf(next.snapshot, 'euro-fund')).toEqual(amountEntry('euro-fund', 30_900, TAKEN_ON))
    expect(seenOnOf(next.snapshot)['life-uc']).toBe(BASE_DAY)
  })

  test('a line confirmed « Inchangé » in a bank left unfinished is seen; its neighbour is not', () => {
    const next = buildUpdate(profile, base, confirmLine(fresh(), 'euro-fund'), TAKEN_ON)
    expect(entryOf(next.snapshot, 'euro-fund')).toEqual(amountEntry('euro-fund', 30_000, TAKEN_ON))
    expect(seenOnOf(next.snapshot)['life-uc']).toBe(BASE_DAY)
  })

  test('« Chez toi » done with the house confirmed: the house keeps its estimate date, the gold is seen', () => {
    const draft = markStep(confirmLine(fresh(), 'house-line'), 'home', 'done')
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(entryOf(next.snapshot, 'house-line')).toEqual(amountEntry('house-line', 300_000, BASE_DAY))
    expect(seenOnOf(next.snapshot)['gold-line']).toBe(TAKEN_ON)
    expect(seenOnOf(next.snapshot)['mortgage-line']).toBe(TAKEN_ON)
  })

  test('the house typed at 320 000 € takes the snapshot’s date', () => {
    const typed = setValue(fresh(), base, 'house-line', { kind: 'amount', amount: 32_000_000 }, TYPED_ON, {})
    const next = buildUpdate(profile, base, markStep(typed, 'home', 'done'), TAKEN_ON)
    expect(entryOf(next.snapshot, 'house-line')).toEqual(amountEntry('house-line', 320_000, TAKEN_ON))
  })

  test('« Changer » on the house at the same price re-dates the estimate', () => {
    const restated = restateValue(fresh(), base, 'house-line', { kind: 'amount', amount: 30_000_000 }, TYPED_ON)
    const next = buildUpdate(profile, base, restated, TAKEN_ON)
    expect(entryOf(next.snapshot, 'house-line')).toEqual(amountEntry('house-line', 300_000, TAKEN_ON))
  })

  test('the house left untouched keeps its date, in « Chez toi » done or skipped', () => {
    for (const status of ['done', 'skipped'] as const) {
      const next = buildUpdate(profile, base, markStep(fresh(), 'home', status), TAKEN_ON)
      expect(seenOnOf(next.snapshot)['house-line']).toBe(BASE_DAY)
    }
  })
})

// Decision 7: the box of a line attached to its price opens with today's price; left as it
// is, that price enters the snapshot, even in a bank passed. Typing over it wins.
describe('buildUpdate: today’s price', () => {
  const PRICES = { etf: 260 }
  const MARKET = { prices: PRICES, rates: null }
  const quoted: Profile = {
    ...profile,
    lines: profile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
  }

  test('confirmed « Inchangé »: today’s price, seen on the snapshot’s date', () => {
    const next = buildUpdate(quoted, base, confirmLine(fresh(), 'etf'), TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toEqual(unitsEntry('etf', 100, 260, 200, TAKEN_ON))
  })

  test('left as it is in a bank passed: today’s price, and the date it was last seen', () => {
    const next = buildUpdate(quoted, base, markStep(fresh(), 'boursobank', 'skipped'), TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toEqual(unitsEntry('etf', 100, 260, 200, BASE_DAY))
  })

  test('left as it is in a bank done: today’s price, seen on the snapshot’s date', () => {
    const next = buildUpdate(quoted, base, markStep(fresh(), 'boursobank', 'done'), TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toEqual(unitsEntry('etf', 100, 260, 200, TAKEN_ON))
  })

  test('a typed price wins over today’s', () => {
    const typed = setValue(fresh(), base, 'etf', { kind: 'units', units: 100, unitPrice: 255, averagePrice: 200 }, TYPED_ON, PRICES)
    const next = buildUpdate(quoted, base, typed, TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toEqual(unitsEntry('etf', 100, 255, 200, TAKEN_ON))
  })

  test('the base price typed back over today’s is kept', () => {
    const typed = setValue(fresh(), base, 'etf', { kind: 'units', units: 100, unitPrice: 250, averagePrice: 200 }, TYPED_ON, PRICES)
    const next = buildUpdate(quoted, base, typed, TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toEqual(unitsEntry('etf', 100, 250, 200, TAKEN_ON))
  })

  // What the box shows is what enters the snapshot: never the price rounded for display.
  test('a converted price enters the snapshot with its four decimals, as the box shows it', () => {
    const prices = { etf: 306.6458 }
    const next = buildUpdate(quoted, base, fresh(), TAKEN_ON, { prices, rates: null })
    const shown = currentEntry(base, fresh(), 'etf', prices)
    expect(shown).toMatchObject({ unitPrice: 306.6458 })
    expect(entryOf(next.snapshot, 'etf')).toEqual({ ...shown, seenOn: BASE_DAY })
  })

  test('only the priced line moves; every other entry and the dates are as without prices', () => {
    const draft = markStep(confirmLine(fresh(), 'euro-fund'), 'home', 'done')
    const priced = buildUpdate(quoted, base, draft, TAKEN_ON, MARKET)
    const plain = buildUpdate(quoted, base, draft, TAKEN_ON)
    expect(priced.snapshot.entries.filter((e) => e.lineId !== 'etf')).toEqual(
      plain.snapshot.entries.filter((e) => e.lineId !== 'etf'),
    )
    expect(seenOnOf(priced.snapshot)).toEqual(seenOnOf(plain.snapshot))
    expectParses(priced)
  })

  test('a closed line takes no price', () => {
    const next = buildUpdate(quoted, base, closeLine(fresh(), 'etf'), TAKEN_ON, MARKET)
    expect(entryOf(next.snapshot, 'etf')).toBeUndefined()
  })
})

describe('buildUpdate: closing a line', () => {
  test('the gold closed now has no entry, and its line stays in the profile, closed on the snapshot’s date', () => {
    const next = buildUpdate(profile, base, closeLine(fresh(), 'gold-line'), TAKEN_ON)
    expect(entryOf(next.snapshot, 'gold-line')).toBeUndefined()
    expect(lineOf(next.profile, 'gold-line')).toEqual({ ...lineOf(profile, 'gold-line'), closedOn: TAKEN_ON })
    expectParses(next)
    const mortgage = next.profile.accounts.find((a) => a.id === 'mortgage')!
    expect(lineOf(next.profile, mortgage.financedLineId!)).toBeDefined()
  })

  test('the house closed now stays in the profile, so the loan still points at a line', () => {
    const next = buildUpdate(profile, base, closeLine(fresh(), 'house-line'), TAKEN_ON)
    expect(entryOf(next.snapshot, 'house-line')).toBeUndefined()
    expect(lineOf(next.profile, 'house-line')?.closedOn).toBe(TAKEN_ON)
    expectParses(next)
  })

  test('a line closed in an earlier update gets no entry and keeps its closing date', () => {
    const closedBefore: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'gold-line' ? { ...l, closedOn: '2026-08-31' } : l)),
    }
    const draft: UpdateDraft = { ...fresh(), values: [amountEntry('gold-line', 2_500, TYPED_ON)], closed: ['gold-line'] }
    const next = buildUpdate(closedBefore, base, draft, TAKEN_ON)
    expect(entryOf(next.snapshot, 'gold-line')).toBeUndefined()
    expect(lineOf(next.profile, 'gold-line')?.closedOn).toBe('2026-08-31')
  })
})

describe('buildUpdate: adding', () => {
  test('a LEP opened since is in the profile, seen on the snapshot’s date, and counts as effort', () => {
    const { draft, accountId, lineId } = withLep()
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.profile.accounts.map((a) => a.id)).toEqual([...profile.accounts.map((a) => a.id), accountId])
    expect(next.profile.lines.map((l) => l.id)).toEqual([...profile.lines.map((l) => l.id), lineId])
    expect(entryOf(next.snapshot, lineId)).toEqual(amountEntry(lineId, 2_000, TAKEN_ON))
    expect(next.snapshot.arrivals).toEqual({ [lineId]: 'opened' })
    expect(splitChange(next.profile, base, next.snapshot).effort).toBe(200_000)
    expectParses(next)
  })

  test('a fund the person already had, added to the PEA, keeps its own arrival and stays out of the effort', () => {
    const { draft, lineId } = withFund()
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.arrivals).toEqual({ [lineId]: 'existing' })
    const split = splitChange(next.profile, base, next.snapshot)
    expect(split).toMatchObject({ effort: 0, markets: 0, existingAdded: 50_000 })
    expectParses(next)
  })

  test('an added account left without lines is not in the profile, nor its contribution or total', () => {
    const empty = addAccount(
      profile,
      fresh(),
      { establishmentId: 'linxea', type: 'per', name: 'PER', arrival: 'opened' },
      id,
    )
    const typed = setPaidTotal({ ...empty.draft, contributions: { [empty.accountId]: 10_000 } }, empty.accountId, 10_000)
    const next = buildUpdate(profile, base, typed, TAKEN_ON)
    expect(next.profile).toEqual(profile)
    expect(next.snapshot.contributions).toEqual({})
    expect(next.snapshot).not.toHaveProperty('paidTotals')
    expect(next.snapshot.arrivals).toEqual({})
  })

  test('an added account whose only line was removed is not in the profile', () => {
    const { draft, accountId, lineId } = withLep()
    const next = buildUpdate(profile, base, removeAddedLine(draft, lineId), TAKEN_ON)
    expect(next.profile.accounts.map((a) => a.id)).not.toContain(accountId)
    expectParses(next)
  })

  // Decision 4: a line added then closed in the same update disappears.
  test('« Fermé ou tout vendu » on a fund added to the PEA leaves no line, no entry and no arrival', () => {
    const { draft, lineId } = withFund()
    const next = buildUpdate(profile, base, closeLine(draft, lineId), TAKEN_ON)
    expect(lineOf(next.profile, lineId)).toBeUndefined()
    expect(next.profile).toEqual(profile)
    expect(entryOf(next.snapshot, lineId)).toBeUndefined()
    expect(next.snapshot.arrivals).toEqual({})
    expectParses(next)
  })

  test('« Fermé ou tout vendu » on the only line of an added account leaves out the account too', () => {
    const { draft, accountId, lineId } = withLep()
    const next = buildUpdate(profile, base, closeLine(draft, lineId), TAKEN_ON)
    expect(next.profile.accounts.map((a) => a.id)).not.toContain(accountId)
    expect(lineOf(next.profile, lineId)).toBeUndefined()
    expect(next.snapshot.entries).toEqual(base.entries)
    expect(next.snapshot.arrivals).toEqual({})
    expectParses(next)
  })

  test('« Fermé ou tout vendu » on one of two lines of an added account keeps the account and the other line', () => {
    const lep = withLep()
    const second = putAddedLine(
      profile,
      lep.draft,
      { accountId: lep.accountId, name: 'LEP 2', entry: { kind: 'amount', amount: 50_000 } },
      TYPED_ON,
      id,
    )
    const next = buildUpdate(profile, base, closeLine(second.draft, lep.lineId), TAKEN_ON)
    expect(next.profile.accounts.map((a) => a.id)).toContain(lep.accountId)
    expect(next.profile.lines.map((l) => l.id)).toEqual([...profile.lines.map((l) => l.id), second.lineId])
    expect(next.snapshot.arrivals).toEqual({ [second.lineId]: 'opened' })
    expectParses(next)
  })

  test('a line of the profile without a base entry gets its typed value, and no arrival it was never given', () => {
    const withoutGold: Snapshot = { ...base, entries: base.entries.filter((e) => e.lineId !== 'gold-line') }
    const typed = setValue(fresh(), withoutGold, 'gold-line', { kind: 'amount', amount: 250_000 }, TYPED_ON, {})
    const next = buildUpdate(profile, withoutGold, typed, TAKEN_ON)
    expect(entryOf(next.snapshot, 'gold-line')).toEqual(amountEntry('gold-line', 2_500, TAKEN_ON))
    expect(next.snapshot.arrivals).toEqual({})
    expectParses(next)
  })
})

describe('buildUpdate: a half-saved update (R16)', () => {
  test('the profile saved but not the snapshot: a retry gives the same profile and snapshot, arrivals included', () => {
    const lep = withLep()
    const fund = withFund(lep.draft)
    const draft = closeLine(fund.draft, 'gold-line')
    const first = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(first.snapshot.arrivals).toEqual({ [lep.lineId]: 'opened', [fund.lineId]: 'existing' })

    // The page reloads: the saved profile already holds the additions, the draft still lists them.
    expect(buildUpdate(first.profile, base, draft, TAKEN_ON)).toEqual(first)
    expect(buildUpdate(first.profile, base, tidyDraft(first.profile, draft), TAKEN_ON)).toEqual(first)
  })
})

describe('buildUpdate: what the draft says that cannot be merged', () => {
  test('a value for a line that does not exist is ignored', () => {
    const draft: UpdateDraft = { ...fresh(), values: [amountEntry('ghost', 10, TYPED_ON)], confirmed: ['ghost-2'] }
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.entries).toEqual(base.entries)
    expectParses(next)
  })

  test('contributions are kept on accounts of the profile', () => {
    const draft: UpdateDraft = { ...fresh(), contributions: { life: 50_000, ghost: 10_000 } }
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.contributions).toEqual({ life: 50_000 })
  })

  test('a typed 0 is kept: nothing paid in is known, not unknown', () => {
    const draft: UpdateDraft = { ...fresh(), contributions: { life: 0 } }
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.contributions).toEqual({ life: 0 })
    expectParses(next)
  })

  test('a draft written before the totals builds a snapshot without them', () => {
    const { paidTotals: _none, ...old } = fresh()
    void _none
    const next = buildUpdate(profile, base, old, TAKEN_ON)
    expect(next.snapshot).not.toHaveProperty('paidTotals')
    expectParses(next)
  })

  test('totals paid in are kept as typed, only on the accounts that take one', () => {
    let draft = fresh()
    for (const [accountId, cents] of [['life', 1_500_000], ['pea', 0], ['gold', 200_000], ['livret-a', 10_000], ['current', 1], ['ghost', 5]] as const) {
      draft = setPaidTotal(draft, accountId, cents)
    }
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.paidTotals).toEqual({ life: 1_500_000, pea: 0, gold: 200_000 })
    expect(next.snapshot.contributions).toEqual({})
    expectParses(next)
  })

  test('a bank skipped keeps its accounts’ totals from the base: the chain does not break', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000, pea: 900_000 } }
    const draft = markStep(markStep(fresh(), 'linxea', 'skipped'), 'boursobank', 'done')
    const next = buildUpdate(profile, withTotals, draft, TAKEN_ON)
    // Linxea skipped: its total is carried. BoursoBank done with the box left empty: unknown now.
    expect(next.snapshot.paidTotals).toEqual({ life: 1_200_000 })
    expectParses(next)
  })

  test('a bank closed with « Rien n’a changé ici » keeps its accounts’ totals from the base', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const draft = nothingChangedHere(profile, fresh(), 'linxea')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot.paidTotals).toEqual({ life: 1_200_000 })
  })

  test('every line of the account confirmed unchanged, in a bank still open: the total is kept', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const draft = markStep(confirmLine(confirmLine(fresh(), 'euro-fund'), 'life-uc'), 'linxea', 'done')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot.paidTotals).toEqual({ life: 1_200_000 })
  })

  test('a line of the account with a new value and the box left empty: the total is not carried', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    let draft = setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TYPED_ON, {})
    draft = nothingChangedHere(profile, draft, 'linxea')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
    // Skipped after typing too: the account moved, its total cannot be guessed.
    const skipped = markStep(setValue(fresh(), base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TYPED_ON, {}), 'linxea', 'skipped')
    expect(buildUpdate(profile, withTotals, skipped, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
  })

  test('a line added to the account: the total is not carried', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const added = putAddedLine(
      profile,
      fresh(),
      { accountId: 'life', name: 'Fonds actions', entry: { kind: 'amount', amount: 100_000 }, arrival: 'opened' },
      TYPED_ON,
      id,
    )
    const draft = nothingChangedHere(profile, added.draft, 'linxea')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
  })

  test('a line of the account closed now, the others confirmed: the total is not carried', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const draft = markStep(confirmLine(closeLine(fresh(), 'life-uc'), 'euro-fund'), 'linxea', 'done')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
  })

  test('a line of the account closed now, its bank skipped: the total is not carried', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const draft = markStep(closeLine(fresh(), 'life-uc'), 'linxea', 'skipped')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
  })

  test('in a bank skipped, a total typed before skipping wins over the base one', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000 } }
    const draft = markStep(setPaidTotal(fresh(), 'life', 1_300_000), 'linxea', 'skipped')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot.paidTotals).toEqual({ life: 1_300_000 })
  })

  test('an account whose every line is closed now keeps no total, even in a bank skipped', () => {
    const withTotals: Snapshot = { ...base, paidTotals: { life: 1_200_000, gold: 100_000 } }
    let draft = setPaidTotal(fresh(), 'gold', 150_000)
    draft = closeLine(draft, 'gold-line')
    draft = closeLine(closeLine(draft, 'euro-fund'), 'life-uc')
    draft = markStep(markStep(draft, 'linxea', 'skipped'), 'home', 'done')
    expect(buildUpdate(profile, withTotals, draft, TAKEN_ON).snapshot).not.toHaveProperty('paidTotals')
  })

  test('contributions are kept only on a life insurance, a PER or employee savings', () => {
    const draft: UpdateDraft = { ...fresh(), contributions: { life: 50_000, pea: 20_000, 'livret-a': 10_000 } }
    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expect(next.snapshot.contributions).toEqual({ life: 50_000 })
    expectParses(next)
  })

  // Decision 10: a snapshot keeps the rate of each currency its open lines use, and no other.
  describe('the base snapshot’s arrivals belong to its own period, and its rates are kept only where used', () => {
    const withUs: Profile = {
      ...profile,
      lines: [...profile.lines, { id: 'us-line', accountId: 'current', name: 'Dollars', kind: 'amount', currency: 'USD' }],
    }
    const usBase: Snapshot = {
      ...base,
      fx: { USD: 0.92 },
      entries: [...base.entries, amountEntry('us-line', 1_000)],
      arrivals: { 'gold-line': 'opened' },
    }

    test('the ECB silent: a dollar line keeps the base snapshot’s rate, and it is said', () => {
      const next = buildUpdate(withUs, usBase, fresh(), TAKEN_ON, { prices: {}, rates: null })
      expect(next.snapshot.fx).toEqual({ USD: 0.92 })
      expect(next.rates).toMatchObject({ fromBase: ['USD'], missing: [], on: null })
    })

    test('with today’s rates, the dollar line takes the ECB’s rate of the day', () => {
      const next = buildUpdate(withUs, usBase, fresh(), TAKEN_ON, { prices: {}, rates: RATES })
      expect(next.snapshot.fx.USD).toBeCloseTo(0.895656, 6)
      expect(next.rates).toMatchObject({ on: '2026-11-06', fromBase: [], missing: [] })
    })

    test('a rate no open line uses is not kept', () => {
      const next = buildUpdate(profile, { ...base, fx: { USD: 0.92 }, arrivals: { 'gold-line': 'opened' } }, fresh(), TAKEN_ON)
      expect(next.snapshot.fx).toEqual({})
      expect(next.snapshot.arrivals).toEqual({})
    })

    test('the arrivals are still not carried over', () => {
      const next = buildUpdate(withUs, usBase, fresh(), TAKEN_ON, { prices: {}, rates: RATES })
      expect(next.snapshot.arrivals).toEqual({})
    })

    test('the dollar line closed now: its rate goes with it', () => {
      const next = buildUpdate(withUs, usBase, closeLine(fresh(), 'us-line'), TAKEN_ON, { prices: {}, rates: RATES })
      expect(next.snapshot.fx).toEqual({})
      expect(next.rates).toMatchObject({ on: null, fromBase: [], missing: [] })
    })

    test('a line added in pounds with no rate known: missing, and no rate is made up', () => {
      const uk = putAddedLine(
        profile,
        fresh(),
        { accountId: 'pea', name: 'UK', entry: { kind: 'units', units: 10, unitPrice: 5, averagePrice: null }, currency: 'GBP', arrival: 'existing' },
        TYPED_ON,
        id,
      )
      const next = buildUpdate(profile, base, uk.draft, TAKEN_ON, { prices: {}, rates: null })
      expect(next.snapshot.fx).toEqual({})
      expect(next.rates.missing).toEqual(['GBP'])
    })
  })

  test('the profile, the base snapshot and the draft are left as they were', () => {
    const draft = closeLine(withLep().draft, 'gold-line')
    const before = structuredClone({ profile, base, draft })
    buildUpdate(profile, base, draft, TAKEN_ON)
    expect({ profile, base, draft }).toEqual(before)
  })
})

describe('buildUpdate: a whole update built through the draft’s functions', () => {
  test('both documents parse, with one entry per line and the expected dates', () => {
    let draft = fresh()
    draft = setValue(draft, base, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, TYPED_ON, {})
    draft = setValue(draft, base, 'etf', { kind: 'units', units: 100, unitPrice: 260, averagePrice: 200 }, TYPED_ON, {})
    draft = confirmLine(draft, 'current-line')
    const lep = withLep(draft)
    const fund = withFund(lep.draft)
    draft = markStep(fund.draft, 'boursobank', 'done')
    draft = setValue(draft, base, 'euro-fund', { kind: 'amount', amount: 3_090_000 }, TYPED_ON, {})
    draft = setPaidTotal(draft, 'life', 2_500_000)
    draft = markStep(draft, 'linxea', 'skipped')
    draft = confirmLine(draft, 'house-line')
    draft = setValue(draft, base, 'mortgage-line', { kind: 'amount', amount: 17_890_000 }, TYPED_ON, {})
    draft = closeLine(draft, 'gold-line')
    draft = markStep(draft, 'home', 'done')

    const next = buildUpdate(profile, base, draft, TAKEN_ON)
    expectParses(next)
    expect(next.snapshot.entries.map((e) => [e.lineId, e.seenOn])).toEqual([
      ['current-line', TAKEN_ON],
      ['livret-a-line', TAKEN_ON],
      ['etf', TAKEN_ON],
      ['euro-fund', TAKEN_ON],
      ['life-uc', BASE_DAY],
      ['house-line', BASE_DAY],
      ['mortgage-line', TAKEN_ON],
      [lep.lineId, TAKEN_ON],
      [fund.lineId, TAKEN_ON],
    ])
    expect(next.snapshot.contributions).toEqual({})
    expect(next.snapshot.paidTotals).toEqual({ life: 2_500_000 })
    expect(next.snapshot.arrivals).toEqual({ [lep.lineId]: 'opened', [fund.lineId]: 'existing' })
    expect(next.snapshot.takenOn).toBe(TAKEN_ON)
    expect(() => splitChange(next.profile, base, next.snapshot)).not.toThrow()
  })
})

describe('takenOnError', () => {
  const TODAY = '2026-11-07'
  const message = 'Choisis une date entre le 30 septembre et aujourd’hui.'

  test('the base snapshot’s day and today are allowed', () => {
    expect(takenOnError(base, '2026-09-30', TODAY)).toBeNull()
    expect(takenOnError(base, TODAY, TODAY)).toBeNull()
  })

  test('a day before the base snapshot is refused', () => {
    expect(takenOnError(base, '2026-09-29', TODAY)).toBe(message)
  })

  test('a day after today is refused', () => {
    expect(takenOnError(base, '2026-11-08', TODAY)).toBe(message)
  })

  // The base was saved from a device whose clock is ahead of this one: its day is still allowed.
  test('a base snapshot dated after today still allows its own day, and only that one', () => {
    const ahead: Snapshot = { ...base, takenOn: '2026-11-08' }
    expect(takenOnError(ahead, '2026-11-08', TODAY)).toBeNull()
    expect(takenOnError(ahead, '2026-11-07', TODAY)).not.toBeNull()
    expect(takenOnError(ahead, '2026-11-09', TODAY)).not.toBeNull()
  })

  test('a base snapshot of another year is named with its year', () => {
    expect(takenOnError({ ...base, takenOn: '2025-12-31' }, '2025-12-30', TODAY)).toBe(
      'Choisis une date entre le 31 décembre 2025 et aujourd’hui.',
    )
  })
})
