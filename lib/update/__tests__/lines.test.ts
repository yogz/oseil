import { describe, expect, test } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { UpdateDraft } from '@/lib/model/types'
import { confirmLine, linesOf, setValue, startDraft } from '../draft'
import {
  addAccount,
  closeLine,
  paidTotalAccounts,
  previousPaidTotal,
  putAddedLine,
  removeAddedLine,
  reopenLine,
  setPaidTotal,
} from '../lines'

const TODAY = '2026-11-07'
const base = exampleSnapshot
const profile = exampleProfile
const fresh = () => startDraft('s1')
let counter = 0
const id = () => `new-${++counter}`

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
    TODAY,
    id,
  )
  return { draft: line.draft, accountId: account.accountId, lineId: line.lineId }
}

describe('addAccount: the type of an added home', () => {
  const home = (residence?: 'main' | 'secondary' | 'rental') =>
    addAccount(
      profile,
      fresh(),
      { establishmentId: 'home', type: 'home', name: 'Studio', arrival: 'existing', ...(residence ? { residence } : {}) },
      id,
    ).draft.added.accounts[0]

  test('a rental or a secondary home carries its type, as the fiche writes it', () => {
    expect(home('rental')).toMatchObject({ type: 'home', name: 'Studio', residence: 'rental' })
    expect(home('secondary')).toMatchObject({ residence: 'secondary' })
  })

  test('a main residence is written as no mark, as every home was before the types', () => {
    expect(home('main')).not.toHaveProperty('residence')
    expect(home()).not.toHaveProperty('residence')
  })

  test('only a home has a type', () => {
    expect(() =>
      addAccount(profile, fresh(), { establishmentId: 'boursobank', type: 'lep', name: 'LEP', arrival: 'opened', residence: 'rental' }),
    ).toThrow()
  })
})

describe('addAccount and putAddedLine', () => {
  test('a LEP opened since: the draft holds the account, its line, its value and its arrival', () => {
    const { draft, accountId, lineId } = withLep()
    expect(draft.added.accounts).toEqual([{ id: accountId, establishmentId: 'boursobank', type: 'lep', name: 'LEP' }])
    expect(draft.added.lines).toEqual([{ id: lineId, accountId, name: 'LEP', kind: 'amount', currency: 'EUR' }])
    expect(draft.values).toEqual([{ lineId, kind: 'amount', amount: 200_000, seenOn: TODAY }])
    expect(draft.arrivals).toEqual({ [accountId]: 'opened' })
    expect(linesOf(profile, draft, 'boursobank').map((r) => r.line.id)).toEqual([
      'current-line',
      'livret-a-line',
      'etf',
      lineId,
    ])
  })

  test('the arrival of an added account is stored once, under its id', () => {
    const { draft, accountId } = withLep()
    const second = putAddedLine(
      profile,
      draft,
      { accountId, name: 'LEP bis', entry: { kind: 'amount', amount: 100 } },
      TODAY,
      id,
    )
    expect(second.draft.arrivals).toEqual({ [accountId]: 'opened' })
  })

  test('a line of an added account does not take an arrival of its own', () => {
    const { draft, accountId } = withLep()
    expect(() =>
      putAddedLine(
        profile,
        draft,
        { accountId, name: 'LEP bis', entry: { kind: 'amount', amount: 100 }, arrival: 'existing' },
        TODAY,
        id,
      ),
    ).toThrow(/arrival/)
  })

  test('a line added to the existing PEA carries its own arrival', () => {
    const { draft, lineId } = putAddedLine(
      profile,
      fresh(),
      { accountId: 'pea', name: 'ETF monde', entry: { kind: 'units', units: 10, unitPrice: 100, averagePrice: 90 }, arrival: 'existing' },
      TODAY,
      id,
    )
    expect(draft.arrivals).toEqual({ [lineId]: 'existing' })
    expect(draft.added.accounts).toEqual([])
    expect(draft.added.lines).toEqual([{ id: lineId, accountId: 'pea', name: 'ETF monde', kind: 'units', currency: 'EUR' }])
    expect(draft.values).toEqual([{ lineId, kind: 'units', units: 10, unitPrice: 100, averagePrice: 90, seenOn: TODAY }])
  })

  test('a line added to an existing account without an arrival is refused', () => {
    expect(() =>
      putAddedLine(
        profile,
        fresh(),
        { accountId: 'pea', name: 'ETF monde', entry: { kind: 'units', units: 10, unitPrice: 100, averagePrice: 90 } },
        TODAY,
        id,
      ),
    ).toThrow(/arrival/)
  })

  test('an added line edited again keeps its id and its arrival, and replaces its value', () => {
    const added = putAddedLine(
      profile,
      fresh(),
      { accountId: 'pea', name: 'ETF monde', entry: { kind: 'units', units: 10, unitPrice: 100, averagePrice: 90 }, arrival: 'existing' },
      TODAY,
      id,
    )
    const edited = putAddedLine(
      profile,
      added.draft,
      { accountId: 'pea', lineId: added.lineId, name: 'ETF World', entry: { kind: 'units', units: 12, unitPrice: 100, averagePrice: 90 } },
      TODAY,
      id,
    )
    expect(edited.lineId).toBe(added.lineId)
    expect(edited.draft.added.lines.map((l) => l.name)).toEqual(['ETF World'])
    expect(edited.draft.values).toEqual([
      { lineId: added.lineId, kind: 'units', units: 12, unitPrice: 100, averagePrice: 90, seenOn: TODAY },
    ])
    expect(edited.draft.arrivals).toEqual({ [added.lineId]: 'existing' })
  })

  test('a line of the profile cannot be rewritten as an added line', () => {
    expect(() =>
      putAddedLine(
        profile,
        fresh(),
        { accountId: 'livret-a', lineId: 'livret-a-line', name: 'x', entry: { kind: 'amount', amount: 1 }, arrival: 'existing' },
        TODAY,
        id,
      ),
    ).toThrow(/Unknown line/)
  })

  test('a units line on a Livret A is refused', () => {
    expect(() =>
      putAddedLine(
        profile,
        fresh(),
        { accountId: 'livret-a', name: 'x', entry: { kind: 'units', units: 1, unitPrice: 1, averagePrice: null }, arrival: 'opened' },
        TODAY,
        id,
      ),
    ).toThrow(/cannot hold/)
  })

  test('an « other » account needs a category', () => {
    const other = addAccount(profile, fresh(), { establishmentId: 'boursobank', type: 'other', name: 'Divers', arrival: 'opened' }, id)
    const line = { accountId: other.accountId, name: 'Divers', entry: { kind: 'amount' as const, amount: 1 } }
    expect(() => putAddedLine(profile, other.draft, line, TODAY, id)).toThrow(/category/)
    const ok = putAddedLine(profile, other.draft, { ...line, category: 'secured' }, TODAY, id)
    expect(ok.draft.added.lines[0].category).toBe('secured')
  })

  test('an unknown account is refused', () => {
    expect(() =>
      putAddedLine(profile, fresh(), { accountId: 'nope', name: 'x', entry: { kind: 'amount', amount: 1 }, arrival: 'opened' }, TODAY, id),
    ).toThrow(/Unknown account/)
  })

  test('an unknown establishment is refused', () => {
    expect(() =>
      addAccount(profile, fresh(), { establishmentId: 'nope', type: 'lep', name: 'LEP', arrival: 'opened' }, id),
    ).toThrow(/establishment/)
  })

  test('a loan financing an unknown line is refused', () => {
    expect(() =>
      addAccount(
        profile,
        fresh(),
        { establishmentId: 'boursobank', type: 'loan', name: 'Prêt', financedLineId: 'nope', arrival: 'opened' },
        id,
      ),
    ).toThrow(/financed line/)
  })

  test('an added loan financing the house keeps its financedLineId', () => {
    const { draft, accountId } = addAccount(
      profile,
      fresh(),
      { establishmentId: 'boursobank', type: 'loan', name: 'Prêt travaux', financedLineId: 'house-line', arrival: 'opened' },
      id,
    )
    expect(draft.added.accounts).toEqual([
      { id: accountId, establishmentId: 'boursobank', type: 'loan', name: 'Prêt travaux', financedLineId: 'house-line' },
    ])
  })

  test('an added loan may finance a home added in the same update', () => {
    const home = addAccount(profile, fresh(), { establishmentId: 'home', type: 'home', name: 'Studio', arrival: 'opened' }, id)
    const homeLine = putAddedLine(profile, home.draft, { accountId: home.accountId, name: 'Studio', entry: { kind: 'amount', amount: 10_000_000 } }, TODAY, id)
    const loan = addAccount(
      profile,
      homeLine.draft,
      { establishmentId: 'boursobank', type: 'loan', name: 'Prêt studio', financedLineId: homeLine.lineId, arrival: 'opened' },
      id,
    )
    expect(loan.draft.added.accounts[1].financedLineId).toBe(homeLine.lineId)
  })

  test('an added account keeps its unlock date', () => {
    const { draft } = addAccount(
      profile,
      fresh(),
      { establishmentId: 'linxea', type: 'per', name: 'PER', unlockOn: '2050-01-01', arrival: 'existing' },
      id,
    )
    expect(draft.added.accounts[0].unlockOn).toBe('2050-01-01')
  })
})

describe('closeLine, reopenLine and removeAddedLine', () => {
  test('closing the gold drops its typed value and its confirmation', () => {
    const typed = setValue(fresh(), base, 'gold-line', { kind: 'amount', amount: 250_000 }, TODAY, {})
    const closed = closeLine(typed, 'gold-line')
    expect(closed.closed).toEqual(['gold-line'])
    expect(closed.values).toEqual([])
    expect(closeLine(confirmLine(fresh(), 'gold-line'), 'gold-line').confirmed).toEqual([])
  })

  test('closing twice keeps one closing', () => {
    expect(closeLine(closeLine(fresh(), 'gold-line'), 'gold-line').closed).toEqual(['gold-line'])
  })

  test('reopenLine brings the line back', () => {
    const reopened = reopenLine(closeLine(fresh(), 'gold-line'), 'gold-line')
    expect(reopened.closed).toEqual([])
    expect(linesOf(profile, reopened, 'home').find((r) => r.line.id === 'gold-line')?.closed).toBe(false)
  })

  test('closing an added line removes it, its value and its arrival', () => {
    const added = putAddedLine(
      profile,
      fresh(),
      { accountId: 'pea', name: 'ETF monde', entry: { kind: 'units', units: 10, unitPrice: 100, averagePrice: 90 }, arrival: 'existing' },
      TODAY,
      id,
    )
    const closed = closeLine(added.draft, added.lineId)
    expect(closed.closed).toEqual([])
    expect(closed.added.lines).toEqual([])
    expect(closed.values).toEqual([])
    expect(closed.arrivals).toEqual({})
    expect(closed).toEqual(removeAddedLine(added.draft, added.lineId))
  })

  test('an added loan financing a removed added home loses its financedLineId', () => {
    const home = addAccount(profile, fresh(), { establishmentId: 'home', type: 'home', name: 'Studio', arrival: 'opened' }, id)
    const homeLine = putAddedLine(profile, home.draft, { accountId: home.accountId, name: 'Studio', entry: { kind: 'amount', amount: 10_000_000 } }, TODAY, id)
    const loan = addAccount(
      profile,
      homeLine.draft,
      { establishmentId: 'boursobank', type: 'loan', name: 'Prêt studio', financedLineId: homeLine.lineId, arrival: 'opened' },
      id,
    )
    const removed = closeLine(loan.draft, homeLine.lineId)
    const loanAccount = removed.added.accounts.find((a) => a.id === loan.accountId)
    expect(loanAccount).toEqual({ id: loan.accountId, establishmentId: 'boursobank', type: 'loan', name: 'Prêt studio' })
  })

  test('removeAddedLine on a line of the profile changes nothing', () => {
    const draft = closeLine(fresh(), 'gold-line')
    expect(removeAddedLine(draft, 'etf')).toEqual(draft)
  })
})

describe('the total paid in', () => {
  const ids = (accounts: { id: string }[]) => accounts.map((a) => a.id)

  test('a life insurance is asked; a savings or a current account never', () => {
    expect(ids(paidTotalAccounts(profile, base, fresh(), 'linxea'))).toEqual(['life'])
    expect(ids(paidTotalAccounts(profile, base, fresh(), 'boursobank'))).toEqual([])
  })

  test('a PEA followed only in parts, with no total before, is not asked', () => {
    expect(ids(paidTotalAccounts(profile, base, fresh(), 'boursobank'))).not.toContain('pea')
  })

  test('a PEA with a line in amount in this update is asked', () => {
    const added = putAddedLine(
      profile,
      fresh(),
      { accountId: 'pea', name: 'Robot', entry: { kind: 'amount', amount: 500_000 }, arrival: 'opened' },
      TODAY,
      id,
    )
    expect(ids(paidTotalAccounts(profile, base, added.draft, 'boursobank'))).toEqual(['pea'])
  })

  test('a PEA with a total in the base stays asked, even in parts only', () => {
    const withTotal = { ...base, paidTotals: { pea: 2_000_000 } }
    expect(ids(paidTotalAccounts(profile, withTotal, fresh(), 'boursobank'))).toEqual(['pea'])
  })

  test('gold in amount, in the home: asked like any cost-basis account in amount', () => {
    expect(ids(paidTotalAccounts(profile, base, fresh(), 'home'))).toEqual(['gold'])
  })

  test('an account added in the update is asked', () => {
    const account = addAccount(
      profile,
      fresh(),
      { establishmentId: 'linxea', type: 'per', name: 'PER', arrival: 'opened' },
      id,
    )
    const line = putAddedLine(
      profile,
      account.draft,
      { accountId: account.accountId, name: 'Fonds', entry: { kind: 'amount', amount: 100_000 } },
      TODAY,
      id,
    )
    expect(ids(paidTotalAccounts(profile, base, line.draft, 'linxea'))).toEqual(['life', account.accountId])
  })

  test('an account whose every line is closed now is not asked', () => {
    const closed = closeLine(closeLine(fresh(), 'euro-fund'), 'life-uc')
    expect(ids(paidTotalAccounts(profile, base, closed, 'linxea'))).toEqual([])
  })

  test('setPaidTotal keeps what is typed; null, a box emptied, makes it unknown again', () => {
    const typed = setPaidTotal(fresh(), 'life', 1_500_000)
    expect(typed.paidTotals).toEqual({ life: 1_500_000 })
    expect(setPaidTotal(typed, 'life', 0).paidTotals).toEqual({ life: 0 })
    expect(setPaidTotal(typed, 'life', null).paidTotals).toEqual({})
  })

  test('setPaidTotal on a draft written before the totals', () => {
    const { paidTotals: _none, ...old } = fresh()
    void _none
    expect(setPaidTotal(old, 'life', 100).paidTotals).toEqual({ life: 100 })
    expect(setPaidTotal(old, 'life', null).paidTotals).toEqual({})
  })

  test('previousPaidTotal: the base total, or null', () => {
    expect(previousPaidTotal(base, 'life')).toBeNull()
    expect(previousPaidTotal({ ...base, paidTotals: { life: 0 } }, 'life')).toBe(0)
  })
})

describe('no input is changed', () => {
  const lep = withLep()
  const typed = setValue(lep.draft, base, 'gold-line', { kind: 'amount', amount: 250_000 }, TODAY, {})
  const calls: Array<[string, (draft: UpdateDraft) => unknown]> = [
    ['addAccount', (d) => addAccount(profile, d, { establishmentId: 'boursobank', type: 'ldds', name: 'LDDS', arrival: 'opened' }, id)],
    [
      'putAddedLine',
      (d) => putAddedLine(profile, d, { accountId: lep.accountId, name: 'LEP bis', entry: { kind: 'amount', amount: 1 } }, TODAY, id),
    ],
    [
      'putAddedLine (edit)',
      (d) => putAddedLine(profile, d, { accountId: lep.accountId, lineId: lep.lineId, name: 'LEP', entry: { kind: 'amount', amount: 2 } }, TODAY, id),
    ],
    ['removeAddedLine', (d) => removeAddedLine(d, lep.lineId)],
    ['closeLine', (d) => closeLine(d, 'gold-line')],
    ['closeLine (added)', (d) => closeLine(d, lep.lineId)],
    ['reopenLine', (d) => reopenLine(closeLine(d, 'gold-line'), 'gold-line')],
    ['paidTotalAccounts', (d) => paidTotalAccounts(profile, base, d, 'linxea')],
    ['setPaidTotal', (d) => setPaidTotal(d, 'life', 100)],
  ]

  test.each(calls)('%s leaves the draft, the profile and the snapshot as they were', (_name, call) => {
    const draft = structuredClone(typed)
    const before = structuredClone({ draft, profile, base })
    call(draft)
    expect({ draft, profile, base }).toEqual(before)
  })

  test('a call that changes nothing still returns a new draft', () => {
    const draft = fresh()
    expect(removeAddedLine(draft, 'etf')).not.toBe(draft)
    expect(reopenLine(draft, 'etf')).not.toBe(draft)
  })
})

describe('an added line in another currency', () => {
  test('keeps GBP, and asks for no rate', () => {
    const { draft, accountId } = withLep()
    const next = putAddedLine(
      profile,
      draft,
      { accountId, name: 'UK', entry: { kind: 'amount', amount: 100 }, currency: 'GBP' },
      TODAY,
      id,
    )
    expect(next.draft.added.lines.find((l) => l.id === next.lineId)?.currency).toBe('GBP')
  })

  // Decision 8: a line a saved snapshot holds keeps its currency, so older snapshots read the same.
  const etfAgain = (currency?: string) => ({
    accountId: 'pea',
    lineId: 'etf',
    name: 'ETF',
    entry: { kind: 'units', units: 100, unitPrice: 250, averagePrice: 200 } as const,
    arrival: 'existing' as const,
    ...(currency !== undefined ? { currency } : {}),
  })

  test('a line the base snapshot holds keeps its currency, even listed among the added ones', () => {
    expect(base.entries.some((e) => e.lineId === 'etf')).toBe(true)
    const etf = profile.lines.find((l) => l.id === 'etf')!
    // A draft written elsewhere, before it was tidied: the line of the profile listed as added.
    const listed: UpdateDraft = { ...fresh(), added: { accounts: [], lines: [etf] } }
    expect(() => putAddedLine(profile, listed, etfAgain('USD'), TODAY)).toThrow(/keeps its currency/)
    expect(() => putAddedLine(profile, { ...listed, added: { accounts: [], lines: [{ ...etf, currency: 'USD' }] } }, etfAgain(), TODAY)).toThrow(
      /keeps its currency/,
    )
  })

  test('a line the base snapshot holds is never rewritten here, in any currency', () => {
    expect(() => putAddedLine(profile, fresh(), etfAgain('USD'), TODAY)).toThrow()
    expect(() => putAddedLine(profile, fresh(), etfAgain('EUR'), TODAY)).toThrow()
  })

  test('a line added in this update may still change its currency', () => {
    const { draft, accountId } = withLep()
    const uk = putAddedLine(profile, draft, { accountId, name: 'UK', entry: { kind: 'amount', amount: 100 }, currency: 'GBP' }, TODAY, id)
    const us = putAddedLine(
      profile,
      uk.draft,
      { accountId, lineId: uk.lineId, name: 'UK', entry: { kind: 'amount', amount: 100 }, currency: 'USD' },
      TODAY,
      id,
    )
    expect(us.draft.added.lines.find((l) => l.id === uk.lineId)?.currency).toBe('USD')
  })
})
