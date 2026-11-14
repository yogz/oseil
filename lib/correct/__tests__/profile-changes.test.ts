import { describe, expect, it } from 'vitest'
import { MULTI } from '@/components/setup/account-kinds'
import { ACCOUNT_TYPES, MULTI_LINE_TYPES } from '@/lib/catalog'
import { account, exampleProfile, exampleSnapshot, line } from '@/lib/model/__tests__/fixtures'
import { categoryOf, computeSituation } from '@/lib/model/situation'
import type { Profile } from '@/lib/model/types'
import { linesOf, startDraft } from '@/lib/update/draft'
import {
  answerUnknown,
  fileLine,
  moveAccount,
  moveLine,
  placeChoices,
  renameLine,
  setCategory,
  setFinanced,
  setNoHome,
  setPurchaseUnknown,
  setUnlockUnknown,
  setUnquoted,
  setGroups,
  setResidence,
  setSlow,
  setUnlockYear,
} from '../profile-changes'

const withBank: Profile = {
  ...exampleProfile,
  establishments: [...exampleProfile.establishments, { id: 'bank', name: 'Crédit Agricole', kind: 'institution', catalogId: 'credit-agricole' }],
}
const loanAtHomeProfile = withBank
const latestSnapshot = exampleSnapshot
const emptyDraftFor = () => startDraft('latest')

const twoFundsProfile: Profile = {
  ...exampleProfile,
  lines: [...exampleProfile.lines, line('etf-2', 'pea', { kind: 'units' })],
}
const peeProfile: Profile = {
  ...exampleProfile,
  establishments: [...exampleProfile.establishments, { id: 'epargne', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' }],
  accounts: [...exampleProfile.accounts, account('pee', 'employee-savings', { establishmentId: 'epargne', unlockOn: '2027-01-01' })],
  lines: [...exampleProfile.lines, line('pee-line', 'pee')],
}
const perProfile: Profile = {
  ...exampleProfile,
  accounts: [...exampleProfile.accounts, account('per', 'per', { establishmentId: 'linxea' })],
  lines: [...exampleProfile.lines, line('per-line', 'per')],
}

describe('renameLine', () => {
  it('renames a line and the account it is alone in', () => {
    const p = renameLine(exampleProfile, 'livret-a-line', '  Livret A Bourso  ')
    expect(p.lines.find((l) => l.id === 'livret-a-line')!.name).toBe('Livret A Bourso')
    expect(p.accounts.find((a) => a.id === 'livret-a')!.name).toBe('Livret A Bourso')
  })
  it('renames only the fund of a PEA, even when it is its only line: the account type decides', () => {
    // exampleProfile's PEA holds the ETF alone.
    expect(exampleProfile.lines.filter((l) => l.accountId === 'pea')).toHaveLength(1)
    const p = renameLine(exampleProfile, 'etf', 'Fonds monde ETF')
    expect(p.lines.find((l) => l.id === 'etf')!.name).toBe('Fonds monde ETF')
    expect(p.accounts.find((a) => a.id === 'pea')!.name).toBe('PEA')
  })
  it('renames the account of a loan and of a house with their line, as the first launch does', () => {
    expect(renameLine(exampleProfile, 'mortgage-line', 'Prêt').accounts.find((a) => a.id === 'mortgage')!.name).toBe('Prêt')
    expect(renameLine(exampleProfile, 'house-line', 'Studio').accounts.find((a) => a.id === 'house')!.name).toBe('Studio')
  })
  it('the multi-line account types are one list, the one the first launch and the update use', () => {
    expect(MULTI).toBe(MULTI_LINE_TYPES)
    expect([...MULTI_LINE_TYPES].sort()).toEqual(['employee-savings', 'life-insurance', 'pea', 'pea-pme', 'per', 'securities'])
  })
  it('renames only the line in an account that holds several', () => {
    const p = renameLine(exampleProfile, 'life-uc', 'Fonds monde')
    expect(p.lines.find((l) => l.id === 'life-uc')!.name).toBe('Fonds monde')
    expect(p.accounts.find((a) => a.id === 'life')!.name).toBe(exampleProfile.accounts.find((a) => a.id === 'life')!.name)
  })
  it('refuses an empty name', () => expect(() => renameLine(exampleProfile, 'etf', '   ')).toThrow())
  it('refuses an unknown line and leaves its argument alone', () => {
    const before = JSON.stringify(exampleProfile)
    expect(() => renameLine(exampleProfile, 'nope', 'x')).toThrow()
    renameLine(exampleProfile, 'etf', 'Autre')
    expect(JSON.stringify(exampleProfile)).toBe(before)
  })
})

describe('placeChoices', () => {
  it('sends a loan held at home to the banks only', () => {
    const choices = placeChoices(loanAtHomeProfile, 'mortgage-line')
    expect(choices.moves).toBe('account')
    expect(choices.establishments.length).toBeGreaterThan(0)
    expect(choices.establishments.every((e) => e.kind === 'institution')).toBe(true)
  })
  it('sends a loan to a real bank only: never the employee savings, never a crypto platform', () => {
    const withAll: Profile = {
      ...withBank,
      establishments: [
        ...withBank.establishments,
        { id: 'epargne', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' },
        { id: 'binance', name: 'Binance', kind: 'institution', catalogId: 'binance' },
        { id: 'kraken', name: 'Kraken', kind: 'institution', catalogId: 'kraken' },
        { id: 'local', name: 'Ma banque locale', kind: 'institution' },
      ],
    }
    const ids = placeChoices(withAll, 'mortgage-line').establishments.map((e) => e.id)
    expect(ids).toEqual(['boursobank', 'linxea', 'bank', 'local'])
    expect(() => moveAccount(withAll, 'mortgage', 'epargne')).toThrow()
    expect(() => moveAccount(withAll, 'mortgage', 'binance')).toThrow()
    // Other accounts still go to the employee savings, as before.
    expect(placeChoices(withAll, 'livret-a-line').establishments.map((e) => e.id)).toContain('epargne')
  })
  it('keeps a house at home', () => expect(placeChoices(exampleProfile, 'house-line').moves).toBe('none'))
  it('offers gold the home establishment and the banks', () => {
    const kinds = placeChoices(loanAtHomeProfile, 'gold-line').establishments.map((e) => e.id)
    expect(kinds).not.toContain('home')
    expect(placeChoices({ ...loanAtHomeProfile, accounts: loanAtHomeProfile.accounts.map((a) => (a.id === 'gold' ? { ...a, establishmentId: 'bank' } : a)) }, 'gold-line').establishments.map((e) => e.id)).toContain('home')
  })
  it('offers a savings account every other bank, the employee-savings one included', () => {
    const ids = placeChoices(peeProfile, 'livret-a-line').establishments.map((e) => e.id)
    expect(ids).toEqual(['linxea', 'epargne'])
  })
  it('offers a fund of a PEA the other accounts that hold funds, never a loan or a home', () => {
    const choices = placeChoices(twoFundsProfile, 'etf')
    expect(choices.moves).toBe('line')
    expect(choices.accounts.length).toBeGreaterThan(0)
    expect(choices.accounts.map((c) => c.account.type)).not.toContain('loan')
    expect(choices.accounts.map((c) => c.account.type)).not.toContain('home')
    expect(choices.accounts.map((c) => c.account.id)).not.toContain('pea')
    expect(choices.accounts.every((c) => ACCOUNT_TYPES[c.account.type].lineKinds.includes('units'))).toBe(true)
    expect(choices.category).toBe(true)
  })
  // Since 11 November 2026 (« tout corriger depuis la fiche »): any line but a loan's and a home's.
  it('offers a category for an amount line too, never for a loan or a home', () => {
    expect(placeChoices(exampleProfile, 'livret-a-line').category).toBe(true)
    expect(placeChoices(exampleProfile, 'mortgage-line').category).toBe(false)
    expect(placeChoices(exampleProfile, 'house-line').category).toBe(false)
    const other = { ...exampleProfile, accounts: [...exampleProfile.accounts, account('misc', 'other')], lines: [...exampleProfile.lines, line('misc-line', 'misc')] }
    expect(placeChoices(other, 'misc-line').category).toBe(true)
  })
})

describe('placeChoices, where nothing can be offered', () => {
  it('says « account » with no bank when the only bank is its own', () => {
    const { moves, establishments } = placeChoices(exampleProfile, 'current-line')
    expect(moves).toBe('account')
    expect(establishments.map((e) => e.id)).toEqual(['linxea'])
    const alone = { ...exampleProfile, establishments: exampleProfile.establishments.filter((e) => e.id !== 'linxea') }
    expect(placeChoices(alone, 'current-line')).toMatchObject({ moves: 'account', establishments: [] })
  })
  it('keeps a home account at home and moves a loan whole, whatever its line count', () => {
    const twoHomes = { ...withBank, lines: [...withBank.lines, line('house-2', 'house')] }
    expect(placeChoices(twoHomes, 'house-line').moves).toBe('none')
    expect(() => moveLine(twoHomes, 'house-line', 'livret-a')).toThrow()
    const twoLoans = { ...withBank, lines: [...withBank.lines, line('mortgage-2', 'mortgage')] }
    expect(placeChoices(twoLoans, 'mortgage-line').moves).toBe('account')
    expect(() => moveLine(twoLoans, 'mortgage-line', 'livret-a')).toThrow()
    const moved = moveAccount(twoLoans, 'mortgage', 'bank')
    expect(moved.accounts.find((a) => a.id === 'mortgage')!.establishmentId).toBe('bank')
  })
})

describe('moveAccount', () => {
  it('moves the loan to its bank: the update asks it there, and Mon argent does not move', () => {
    const moved = moveAccount(loanAtHomeProfile, 'mortgage', 'bank')
    const draft = emptyDraftFor()
    expect(linesOf(moved, draft, 'bank').map((l) => l.line.id)).toContain('mortgage-line')
    expect(linesOf(moved, draft, 'home').map((l) => l.line.id)).not.toContain('mortgage-line')
    expect(computeSituation(moved, latestSnapshot).net).toBe(computeSituation(loanAtHomeProfile, latestSnapshot).net)
  })
  it('refuses to put a house in a bank', () => expect(() => moveAccount(withBank, 'house', 'bank')).toThrow())
  // « Sa banque » (11 November 2026): an account moves whole, whatever its number of lines.
  it('moves an account that holds several lines, whole', () => {
    expect(moveAccount(withBank, 'life', 'bank').accounts.find((a) => a.id === 'life')!.establishmentId).toBe('bank')
  })
  it('refuses its own establishment and an unknown one', () => {
    expect(() => moveAccount(withBank, 'livret-a', 'boursobank')).toThrow()
    expect(() => moveAccount(withBank, 'livret-a', 'nowhere')).toThrow()
  })
})

describe('moveLine and setCategory', () => {
  it('moves a fund to another account that accepts it', () => {
    const p = moveLine(twoFundsProfile, 'etf', 'life')
    expect(p.lines.find((l) => l.id === 'etf')!.accountId).toBe('life')
  })
  it('refuses a loan, and a line alone in its account', () => {
    expect(() => moveLine(twoFundsProfile, 'etf', 'mortgage')).toThrow()
    expect(() => moveLine(exampleProfile, 'livret-a-line', 'current')).toThrow()
  })
  it('sets the category where it can be chosen only', () => {
    expect(setCategory(exampleProfile, 'etf', 'gold').lines.find((l) => l.id === 'etf')!.category).toBe('gold')
    expect(setCategory(exampleProfile, 'livret-a-line', 'gold').lines.find((l) => l.id === 'livret-a-line')!.category).toBe('gold')
    expect(() => setCategory(exampleProfile, 'mortgage-line', 'gold')).toThrow()
  })
})

describe('the chapter of a line', () => {
  const lineOf = (p: Profile, id: string) => p.lines.find((l) => l.id === id)!
  const grouped: Profile = {
    ...exampleProfile,
    lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, category: 'secured' as const, group: 'bonds' as const } : l)),
  }

  it('setCategory clears the chapter', () => {
    expect(lineOf(grouped, 'etf').group).toBe('bonds')
    const moved = setCategory(grouped, 'etf', 'markets')
    expect('group' in lineOf(moved, 'etf')).toBe(false)
  })

  it('setCategory keeps the chapter when the category does not change', () => {
    const same = setCategory(grouped, 'etf', 'secured')
    expect(lineOf(same, 'etf').group).toBe('bonds')
  })

  it('fileLine with the same category keeps the chapter', () => {
    const same = fileLine(grouped, 'etf', null, 'secured')
    expect(lineOf(same, 'etf').group).toBe('bonds')
  })

  it('fileLine that changes the category clears the chapter', () => {
    const fund: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'euro-fund' ? { ...l, group: 'euro-fund' as const } : l)),
    }
    const moved = fileLine(fund, 'euro-fund', 'livret-a', 'available')
    const l = lineOf(moved, 'euro-fund')
    expect(categoryOf(l, moved.accounts.find((a) => a.id === l.accountId)!)).not.toBe('secured')
    expect('group' in l).toBe(false)
  })

  it('setGroups writes each chosen chapter', () => {
    const p = setGroups(exampleProfile, [
      { lineId: 'etf', group: 'europe' },
      { lineId: 'euro-fund', group: 'unknown' },
    ])
    expect(lineOf(p, 'etf').group).toBe('europe')
    expect(lineOf(p, 'euro-fund').group).toBe('unknown')
  })

  it('setGroups skips what no longer fits', () => {
    const closed: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'life-uc' ? { ...l, closedOn: '2026-10-01' } : l)),
    }
    const p = setGroups(closed, [
      { lineId: 'life-uc', group: 'us' }, // closed
      { lineId: 'nowhere', group: 'us' }, // unknown line
      { lineId: 'etf', group: 'bonds' }, // a markets line
      { lineId: 'euro-fund', group: 'bonds' }, // fits
    ])
    expect(lineOf(p, 'life-uc').group).toBeUndefined()
    expect(lineOf(p, 'etf').group).toBeUndefined()
    expect(lineOf(p, 'euro-fund').group).toBe('bonds')
  })
})

describe('fileLine: a move never changes the category silently', () => {
  const withCoins: Profile = {
    ...twoFundsProfile,
    accounts: [...twoFundsProfile.accounts, account('wallet', 'crypto', { establishmentId: 'boursobank' })],
    lines: [...twoFundsProfile.lines, line('btc', 'wallet', { kind: 'units' }), line('eth', 'wallet', { kind: 'units' })],
  }
  const lineOf = (p: Profile, id: string) => p.lines.find((l) => l.id === id)!
  const categoryAfter = (p: Profile, id: string) => {
    const l = lineOf(p, id)
    return categoryOf(l, p.accounts.find((a) => a.id === l.accountId)!)
  }

  it('keeps, written down, the category a coin had before it was filed in a PEA', () => {
    const p = fileLine(withCoins, 'btc', 'pea', null)
    expect(lineOf(p, 'btc')).toMatchObject({ accountId: 'pea', category: 'gold' })
    expect(categoryAfter(p, 'btc')).toBe('gold')
  })
  it('and the markets of a fund filed with the gold', () => {
    const p = fileLine(withCoins, 'etf', 'gold', null)
    expect(lineOf(p, 'etf')).toMatchObject({ accountId: 'gold', category: 'markets' })
  })
  it('takes the category chosen instead', () => {
    expect(lineOf(fileLine(withCoins, 'btc', 'pea', 'markets'), 'btc')).toMatchObject({ accountId: 'pea', category: 'markets' })
  })
  it('writes nothing when the category would not change, or was already written', () => {
    expect(lineOf(fileLine(withCoins, 'etf', 'life', null), 'etf')).not.toHaveProperty('category')
    const written = setCategory(withCoins, 'btc', 'secured')
    expect(lineOf(fileLine(written, 'btc', 'pea', null), 'btc')).toMatchObject({ accountId: 'pea', category: 'secured' })
  })
  // Every category can now be chosen again from the fiche: the one a line had is kept, written.
  it('keeps, written down, the category of a euro fund filed in a current account, still choosable', () => {
    const p = fileLine(exampleProfile, 'euro-fund', 'current', null)
    expect(lineOf(p, 'euro-fund')).toMatchObject({ accountId: 'current', category: 'secured' })
    expect(placeChoices(p, 'euro-fund').category).toBe(true)
  })
  it('keeps an explicit category, the destination letting it be chosen again', () => {
    const other: Profile = {
      ...exampleProfile,
      accounts: [...exampleProfile.accounts, account('misc', 'other', { establishmentId: 'boursobank' })],
      lines: [...exampleProfile.lines, line('thing', 'misc'), line('thing-2', 'misc')],
    }
    const chosen = setCategory(other, 'thing', 'gold')
    expect(lineOf(fileLine(chosen, 'thing', 'current', null), 'thing')).toMatchObject({ category: 'gold' })
  })
  it('moves a whole account to another bank, or only sets the category with nowhere to go', () => {
    expect(fileLine(withBank, 'livret-a-line', 'bank', null)).toEqual(moveAccount(withBank, 'livret-a', 'bank'))
    expect(fileLine(exampleProfile, 'etf', null, 'gold')).toEqual(setCategory(exampleProfile, 'etf', 'gold'))
    expect(fileLine(exampleProfile, 'etf', null, null)).toEqual(exampleProfile)
  })
})

describe('setUnlockYear and setFinanced', () => {
  it('stores a year as its first of January, and removes it', () => {
    expect(setUnlockYear(peeProfile, 'pee', 2029).accounts.find((a) => a.id === 'pee')!.unlockOn).toBe('2029-01-01')
    expect(setUnlockYear(peeProfile, 'pee', null).accounts.find((a) => a.id === 'pee')!.unlockOn).toBeUndefined()
  })
  it('refuses a year on a PER, and a year out of range', () => {
    expect(() => setUnlockYear(perProfile, 'per', 2040)).toThrow()
    expect(() => setUnlockYear(peeProfile, 'pee', 1899)).toThrow()
    expect(() => setUnlockYear(peeProfile, 'pee', 2100)).toThrow()
  })
  it('links a loan to an open home line only', () => {
    expect(() => setFinanced(exampleProfile, 'mortgage', 'etf')).toThrow()
    expect(() => setFinanced(exampleProfile, 'house', 'house-line')).toThrow()
    const closed = { ...exampleProfile, lines: exampleProfile.lines.map((l) => (l.id === 'house-line' ? { ...l, closedOn: '2026-10-01' } : l)) }
    expect(() => setFinanced(closed, 'mortgage', 'house-line')).toThrow()
    expect(setFinanced(exampleProfile, 'mortgage', null).accounts.find((a) => a.id === 'mortgage')!.financedLineId).toBeUndefined()
    expect(setFinanced(setFinanced(exampleProfile, 'mortgage', null), 'mortgage', 'house-line').accounts.find((a) => a.id === 'mortgage')!.financedLineId).toBe('house-line')
  })
})

describe('setResidence', () => {
  const house = (p: Profile) => p.accounts.find((a) => a.id === 'house')!
  it('sets the type of a home, and a main residence goes back to no mark', () => {
    const rental = setResidence(exampleProfile, 'house', 'rental')
    expect(house(rental).residence).toBe('rental')
    expect(house(setResidence(rental, 'house', 'secondary')).residence).toBe('secondary')
    expect(house(setResidence(rental, 'house', 'main'))).not.toHaveProperty('residence')
  })
  it('touches only that account', () => {
    const rental = setResidence(exampleProfile, 'house', 'rental')
    expect(rental.accounts.filter((a) => a.id !== 'house')).toEqual(exampleProfile.accounts.filter((a) => a.id !== 'house'))
    expect(rental.lines).toEqual(exampleProfile.lines)
  })
  it('refuses an account that is not a home, and an unknown account', () => {
    expect(() => setResidence(exampleProfile, 'mortgage', 'rental')).toThrow()
    expect(() => setResidence(exampleProfile, 'nope', 'rental')).toThrow()
  })
})

describe('setSlow', () => {
  const withOther: Profile = {
    ...exampleProfile,
    accounts: [...exampleProfile.accounts, account('shares', 'other')],
    lines: [...exampleProfile.lines, line('shares-l', 'shares', { category: 'markets' })],
  }
  it('marks an account as slow, and removes the mark', () => {
    const slow = setSlow(withOther, 'shares', true)
    expect(slow.accounts.find((a) => a.id === 'shares')!.slow).toBe(true)
    const back = setSlow(slow, 'shares', false)
    expect(back.accounts.find((a) => a.id === 'shares')).not.toHaveProperty('slow')
  })
  it('touches only that account', () => {
    const slow = setSlow(withOther, 'shares', true)
    expect(slow.accounts.filter((a) => a.id !== 'shares')).toEqual(withOther.accounts.filter((a) => a.id !== 'shares'))
  })
  it('refuses a home, a PER, a loan, and an unknown account', () => {
    expect(() => setSlow(exampleProfile, 'house', true)).toThrow()
    expect(() => setSlow(perProfile, 'per', true)).toThrow()
    expect(() => setSlow(exampleProfile, 'mortgage', true)).toThrow()
    expect(() => setSlow(withOther, 'nope', true)).toThrow()
  })
})

describe('the « I don’t know » flags', () => {
  const lineOf = (p: Profile, id: string) => p.lines.find((l) => l.id === id)
  const accountOf = (p: Profile, id: string) => p.accounts.find((a) => a.id === id)

  it('setPurchaseUnknown and setUnquoted set the flag, and off removes it', () => {
    for (const [set, key] of [
      [setPurchaseUnknown, 'purchaseUnknown'],
      [setUnquoted, 'unquoted'],
    ] as const) {
      const on = set(exampleProfile, 'etf', true)
      expect(lineOf(on, 'etf')).toHaveProperty(key, true)
      expect(lineOf(set(on, 'etf', false), 'etf')).not.toHaveProperty(key)
      expect(() => set(exampleProfile, 'nowhere', true)).toThrow()
    }
  })

  it('setUnlockUnknown only on employee savings; a year clears it', () => {
    const on = setUnlockUnknown(peeProfile, 'pee', true)
    expect(accountOf(on, 'pee')).toHaveProperty('unlockUnknown', true)
    expect(accountOf(setUnlockUnknown(on, 'pee', false), 'pee')).not.toHaveProperty('unlockUnknown')
    expect(() => setUnlockUnknown(exampleProfile, 'pea', true)).toThrow()
    expect(accountOf(setUnlockYear(on, 'pee', 2030), 'pee')).not.toHaveProperty('unlockUnknown')
    expect(accountOf(setUnlockYear(on, 'pee', null), 'pee')).toHaveProperty('unlockUnknown', true)
  })

  it('setNoHome only on a loan; naming a home clears it', () => {
    const on = setNoHome(exampleProfile, 'mortgage', true)
    expect(accountOf(on, 'mortgage')).toHaveProperty('noHome', true)
    expect(accountOf(setNoHome(on, 'mortgage', false), 'mortgage')).not.toHaveProperty('noHome')
    expect(() => setNoHome(exampleProfile, 'pea', true)).toThrow()
    expect(accountOf(setFinanced(on, 'mortgage', 'house-line'), 'mortgage')).not.toHaveProperty('noHome')
  })

  it('answerUnknown: the fiche’s answer, by line, on the line or on its account', () => {
    expect(lineOf(answerUnknown(exampleProfile, 'etf', 'purchase', true), 'etf')).toHaveProperty('purchaseUnknown', true)
    expect(lineOf(answerUnknown(exampleProfile, 'etf', 'quote', true), 'etf')).toHaveProperty('unquoted', true)
    const pee = peeProfile.lines.find((l) => l.accountId === 'pee')!.id
    expect(accountOf(answerUnknown(peeProfile, pee, 'unlock', true), 'pee')).toHaveProperty('unlockUnknown', true)
    const on = answerUnknown(exampleProfile, 'mortgage-line', 'loan', true)
    expect(accountOf(on, 'mortgage')).toHaveProperty('noHome', true)
    expect(accountOf(answerUnknown(on, 'mortgage-line', 'loan', false), 'mortgage')).not.toHaveProperty('noHome')
    expect(() => answerUnknown(exampleProfile, 'nowhere', 'loan', true)).toThrow()
  })
})
