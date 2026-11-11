import { describe, expect, test } from 'vitest'
import { parseDecimal } from '@/lib/parse'
import { addAccount, chooseWhere, putLine, withRate, type SetupDraft } from '../first-launch'
import {
  accountTotal,
  addSingleLineAccount,
  decimalText,
  editSingleLineAccount,
  euroText,
  lineValue,
  removeAccount,
  priceText,
  removeLineKeepingAccount,
  tidyCount,
  tidyEuros,
  tidyPrice,
} from '../step-changes'

const TODAY = '2026-11-06'

function started(): SetupDraft {
  return chooseWhere(null, { banks: [{ catalogId: 'boursobank', name: 'BoursoBank' }], outside: ['my-home'] }, TODAY)
}

describe('step changes', () => {
  test('a single-line account is added with its line, named alike', () => {
    const draft = started()
    const { profile, snapshot } = addSingleLineAccount(
      draft,
      {
        establishmentId: draft.profile.establishments[0].id,
        type: 'livret-a',
        name: 'Livret A',
        entry: { kind: 'amount', amount: 1_000_000 },
      },
      TODAY,
    )
    expect(profile.accounts).toHaveLength(1)
    expect(profile.lines[0]).toMatchObject({ name: 'Livret A', kind: 'amount', currency: 'EUR' })
    expect(snapshot.entries[0]).toMatchObject({ kind: 'amount', amount: 1_000_000 })
  })

  test('editing renames the account and its line, and can link then unlink a loan', () => {
    const draft = started()
    const home = draft.profile.establishments[1].id
    const house = addSingleLineAccount(draft, { establishmentId: home, type: 'home', name: 'Ma maison', entry: { kind: 'amount', amount: 30_000_000 } }, TODAY)
    const loan = addSingleLineAccount(house, { establishmentId: home, type: 'loan', name: 'Crédit', entry: { kind: 'amount', amount: 10_000_000 } }, TODAY)
    const loanAccount = loan.profile.accounts.find((a) => a.type === 'loan')!
    const houseLine = loan.profile.lines.find((l) => l.name === 'Ma maison')!
    const linked = editSingleLineAccount(loan, { accountId: loanAccount.id, name: 'Prêt', financedLineId: houseLine.id, entry: { kind: 'amount', amount: 9_000_000 } }, TODAY)
    expect(linked.profile.accounts.find((a) => a.id === loanAccount.id)).toMatchObject({ name: 'Prêt', financedLineId: houseLine.id })
    expect(linked.profile.lines.find((l) => l.accountId === loanAccount.id)).toMatchObject({ name: 'Prêt' })
    const unlinked = editSingleLineAccount(linked, { accountId: loanAccount.id, name: 'Prêt', financedLineId: null, entry: { kind: 'amount', amount: 9_000_000 } }, TODAY)
    expect(unlinked.profile.accounts.find((a) => a.id === loanAccount.id)).not.toHaveProperty('financedLineId')
  })

  test('a home is added with the type it was given, and with no mark at all when none is given', () => {
    const draft = started()
    const home = draft.profile.establishments[1].id
    const entry = { kind: 'amount' as const, amount: 30_000_000 }
    const main = addSingleLineAccount(draft, { establishmentId: home, type: 'home', name: 'Logement', entry }, TODAY)
    expect(main.profile.accounts[0]).toEqual({ id: expect.any(String), establishmentId: home, type: 'home', name: 'Logement' })
    const rental = addSingleLineAccount(draft, { establishmentId: home, type: 'home', name: 'Studio', entry, residence: 'rental' }, TODAY)
    expect(rental.profile.accounts[0]).toMatchObject({ type: 'home', name: 'Studio', residence: 'rental' })
    const secondary = addSingleLineAccount(draft, { establishmentId: home, type: 'home', name: 'Chalet', entry, residence: 'secondary' }, TODAY)
    expect(secondary.profile.accounts[0].residence).toBe('secondary')
  })

  test('editing a home changes its type when one is given, and keeps it otherwise', () => {
    const draft = started()
    const home = draft.profile.establishments[1].id
    const entry = { kind: 'amount' as const, amount: 30_000_000 }
    const rental = addSingleLineAccount(draft, { establishmentId: home, type: 'home', name: 'Studio', entry, residence: 'rental' }, TODAY)
    const accountId = rental.profile.accounts[0].id
    const kept = editSingleLineAccount(rental, { accountId, name: 'Studio Lyon', entry }, TODAY)
    expect(kept.profile.accounts[0]).toMatchObject({ name: 'Studio Lyon', residence: 'rental' })
    const changed = editSingleLineAccount(rental, { accountId, name: 'Studio', entry, residence: 'secondary' }, TODAY)
    expect(changed.profile.accounts[0].residence).toBe('secondary')
  })

  test('accountTotal adds amounts and units × price, rounded like the model', () => {
    const draft = started()
    const { draft: withAccount, accountId } = addAccount(draft, { establishmentId: draft.profile.establishments[0].id, type: 'pea', name: 'PEA' })
    const a = putLine(withAccount, { accountId, name: 'Espèces', entry: { kind: 'amount', amount: 10_050 } }, TODAY).draft
    const b = putLine(a, { accountId, name: 'Fonds', entry: { kind: 'units', units: 100, unitPrice: 250, averagePrice: null } }, TODAY).draft
    expect(accountTotal(b, accountId)).toBe(10_050 + 2_500_000)
  })

  test('removeAccount drops an account with no line, and one with lines', () => {
    const draft = started()
    const { draft: d1, accountId } = addAccount(draft, { establishmentId: draft.profile.establishments[0].id, type: 'pea', name: 'PEA' })
    expect(removeAccount(d1, accountId).profile.accounts).toEqual([])
    const d2 = putLine(d1, { accountId, name: 'Espèces', entry: { kind: 'amount', amount: 100 } }, TODAY).draft
    const gone = removeAccount(d2, accountId)
    expect(gone.profile.accounts).toEqual([])
    expect(gone.profile.lines).toEqual([])
    expect(gone.snapshot.entries).toEqual([])
  })

  test('a box of figures is put back in the French way, and text that does not read is left alone', () => {
    expect(tidyEuros('23500')).toBe('23\u202f500')
    expect(tidyEuros(' 1200,5 € ')).toBe('1\u202f200,50')
    expect(tidyEuros('-2000')).toBe('-2\u202f000')
    expect(tidyEuros('12,345')).toBe('12,345')
    expect(tidyEuros('')).toBe('')
    expect(tidyPrice('692,3')).toBe('692,30')
    expect(tidyPrice('1234.5')).toBe('1\u202f234,50')
    expect(tidyPrice('0,00012345')).toBe('0,00012345')
    expect(tidyPrice('3.800')).toBe('3.800')
    expect(tidyCount('3800')).toBe('3\u202f800')
    expect(tidyCount('12,5')).toBe('12,5')
    expect(priceText(250)).toBe('250,00')
    // Idempotent: a box left twice does not move.
    expect(tidyPrice(tidyPrice('692,3'))).toBe('692,30')
    expect(tidyEuros(tidyEuros('23500'))).toBe('23\u202f500')
  })

  test('texts for the fields', () => {
    expect(euroText(1_000_000)).toBe('10\u202f000')
    expect(euroText(1999)).toBe('19,99')
    expect(euroText(-150)).toBe('-1,50')
    expect(decimalText(12.5)).toBe('12,5')
    expect(decimalText(100)).toBe('100')
    expect(decimalText(3800)).toBe('3\u202f800')
    expect(decimalText(0.0000005)).not.toMatch(/e/i)
    expect(parseDecimal(decimalText(0.0000005))).toBe(0.0000005)
  })

  test('removeLineKeepingAccount leaves the emptied account where it was', () => {
    const draft = started()
    const bank = draft.profile.establishments[0].id
    const first = addAccount(draft, { establishmentId: bank, type: 'pea', name: 'PEA' })
    const second = addAccount(first.draft, { establishmentId: bank, type: 'securities', name: 'CTO' })
    const withLine = putLine(second.draft, { accountId: first.accountId, name: 'Espèces', entry: { kind: 'amount', amount: 100 } }, TODAY)
    const next = removeLineKeepingAccount(withLine.draft, withLine.lineId)
    expect(next.profile.accounts.map((a) => a.name)).toEqual(['PEA', 'CTO'])
    expect(next.profile.lines).toEqual([])
    expect(next.snapshot.entries).toEqual([])
    expect(accountTotal(next, first.accountId)).toBeNull()
  })

  describe('a line whose rate is gone', () => {
    function dollarDraft() {
      const draft = started()
      const bank = draft.profile.establishments[0].id
      const a = addAccount(withRate(draft, 'USD', 0.9), { establishmentId: bank, type: 'securities', name: 'CTO' })
      const b = putLine(a.draft, { accountId: a.accountId, name: 'US', entry: { kind: 'amount', amount: 1000 }, currency: 'USD' }, TODAY)
      const c = putLine(b.draft, { accountId: a.accountId, name: 'Vide', entry: { kind: 'amount', amount: 500 } }, TODAY)
      return { draft: { ...c.draft, snapshot: { ...c.draft.snapshot, fx: {} } }, accountId: a.accountId, usd: b.lineId, eur: c.lineId }
    }

    test('lineValue says no-rate, accountTotal too, a euro line still has its cents', () => {
      const { draft, accountId, usd, eur } = dollarDraft()
      expect(lineValue(draft, usd)).toBe('no-rate')
      expect(lineValue(draft, eur)).toBe(500)
      expect(accountTotal(draft, accountId)).toBe('no-rate')
    })

    test('an empty line is still null', () => {
      const { draft, usd } = dollarDraft()
      const bare = { ...draft, snapshot: { ...draft.snapshot, entries: draft.snapshot.entries.filter((e) => e.lineId !== usd) } }
      expect(lineValue(bare, usd)).toBeNull()
    })

    test('addSingleLineAccount and editSingleLineAccount pass currency and symbol on', () => {
      const draft = withRate(started(), 'GBP', 1.15)
      const added = addSingleLineAccount(
        draft,
        { establishmentId: draft.profile.establishments[0].id, type: 'securities', name: 'UK', entry: { kind: 'amount', amount: 100 }, currency: 'GBP', quoteSymbol: 'ISF.L' },
        TODAY,
      )
      expect(added.profile.lines[0]).toMatchObject({ currency: 'GBP', quoteSymbol: 'ISF.L' })
      const edited = editSingleLineAccount(
        added,
        { accountId: added.profile.accounts[0].id, name: 'UK', entry: { kind: 'amount', amount: 200 } },
        TODAY,
      )
      expect(edited.profile.lines[0]).toMatchObject({ currency: 'GBP', quoteSymbol: 'ISF.L' })
    })
  })
})
