// Everything corrected from a line's fiche (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md):
// the category of any line, quick or slow line by line, the type and the bank of its account, a new account.
import { describe, expect, it } from 'vitest'
import { account, exampleProfile, line, profileOf } from '@/lib/model/__tests__/fixtures'
import { categoryOf } from '@/lib/model/situation'
import type { Profile } from '@/lib/model/types'
import { placeChoices, setCategory } from '../profile-changes'
import {
  accountTypeChoices,
  bankChoices,
  moveAccount,
  moveToNewAccount,
  newAccountCompanions,
  newAccountTypes,
  setAccountType,
  setLineSlow,
} from '../account-changes'

// Nicolas's case: four crowdfunding lines in his PEA, written in « Épargne sécurisée », « Je ne sais pas ».
const crowd = (id: string) => line(id, 'pea', { kind: 'amount', category: 'secured', group: 'unknown' })
const nicolas: Profile = {
  ...exampleProfile,
  lines: [...exampleProfile.lines, crowd('villa'), crowd('reaumur'), crowd('structure'), crowd('brossolette')],
}
const find = (p: Profile, id: string) => p.lines.find((l) => l.id === id)!
const accountOfLine = (p: Profile, id: string) => p.accounts.find((a) => a.id === find(p, id).accountId)!

describe('the category of any line', () => {
  it('can be chosen for an amount line of a PEA, a livret or gold, never for a loan or a home', () => {
    expect(placeChoices(nicolas, 'villa').category).toBe(true)
    expect(placeChoices(nicolas, 'livret-a-line').category).toBe(true)
    expect(placeChoices(nicolas, 'gold-line').category).toBe(true)
    expect(placeChoices(nicolas, 'mortgage-line').category).toBe(false)
    expect(placeChoices(nicolas, 'house-line').category).toBe(false)
  })
  it('a new category takes the chapter away', () => {
    const p = setCategory(nicolas, 'villa', 'markets')
    expect(find(p, 'villa').category).toBe('markets')
    expect(find(p, 'villa').group).toBeUndefined()
  })
})

describe('quick or slow, line by line', () => {
  it('marks one line slow, the account staying quick', () => {
    const p = setLineSlow(nicolas, 'villa', true, 'line')
    expect(find(p, 'villa').slow).toBe(true)
    expect(p.accounts.find((a) => a.id === 'pea')!.slow).toBeUndefined()
  })
  it('a line back to its account’s value loses its own mark', () => {
    const slowAccount: Profile = { ...nicolas, accounts: nicolas.accounts.map((a) => (a.id === 'pea' ? { ...a, slow: true as const } : a)) }
    const quick = setLineSlow(slowAccount, 'villa', false, 'line')
    expect(find(quick, 'villa').slow).toBe(false)
    expect(Object.hasOwn(find(setLineSlow(quick, 'villa', true, 'line'), 'villa'), 'slow')).toBe(false)
  })
  it('« Pour tout le compte » writes the account and clears its lines’ own marks', () => {
    const p = setLineSlow(setLineSlow(nicolas, 'villa', true, 'line'), 'reaumur', false, 'account')
    expect(p.accounts.find((a) => a.id === 'pea')!.slow).toBeUndefined()
    expect(p.lines.filter((l) => l.accountId === 'pea').every((l) => !Object.hasOwn(l, 'slow'))).toBe(true)
    const all = setLineSlow(nicolas, 'villa', true, 'account')
    expect(all.accounts.find((a) => a.id === 'pea')!.slow).toBe(true)
  })
  it('a PER, employee savings, a home and a loan stay decided by their type', () => {
    expect(() => setLineSlow(exampleProfile, 'house-line', true, 'line')).toThrow()
    expect(() => setLineSlow(exampleProfile, 'mortgage-line', true, 'line')).toThrow()
  })
})

describe('the type of an account', () => {
  it('a PEA can become a PEA-PME or a securities account, never a livret, a home or a loan', () => {
    const types = accountTypeChoices(nicolas, 'pea')
    expect(types).toContain('pea-pme')
    expect(types).toContain('securities')
    expect(types).not.toContain('pea')
    expect(types).not.toContain('livret-a') // it holds parts, and several lines
    expect(types).not.toContain('home')
    expect(types).not.toContain('loan')
  })
  it('a livret can become another livret, or a PEA; a home and a loan cannot change', () => {
    expect(accountTypeChoices(exampleProfile, 'livret-a')).toContain('ldds')
    expect(accountTypeChoices(exampleProfile, 'livret-a')).toContain('pea')
    expect(accountTypeChoices(exampleProfile, 'house')).toEqual([])
    expect(accountTypeChoices(exampleProfile, 'mortgage')).toEqual([])
  })
  it('a closed line of another kind counts too', () => {
    const p = profileOf(
      [account('a', 'pea')],
      [line('open', 'a', { kind: 'amount' }), line('gone', 'a', { kind: 'units', closedOn: '2026-01-01' })],
    )
    expect(accountTypeChoices(p, 'a')).not.toContain('other-savings')
  })
  it('the name follows the type when it was never changed, and stays when it was', () => {
    expect(setAccountType(nicolas, 'pea', 'pea-pme').accounts.find((a) => a.id === 'pea')!.name).toBe('PEA-PME')
    const named = { ...nicolas, accounts: nicolas.accounts.map((a) => (a.id === 'pea' ? { ...a, name: 'Mon PEA' } : a)) }
    expect(setAccountType(named, 'pea', 'pea-pme').accounts.find((a) => a.id === 'pea')!.name).toBe('Mon PEA')
  })
  it('a livret keeps its line’s name', () => {
    const p = profileOf([account('l', 'livret-a', { name: 'Mon livret' })], [line('l-l', 'l', { name: 'Mon livret' })])
    expect(setAccountType(p, 'l', 'ldds').accounts[0]).toMatchObject({ type: 'ldds', name: 'Mon livret' })
  })
  it('what the new type does not carry goes: the unlock year, a slow mark a PER decides, a price no one follows', () => {
    const pee = profileOf([account('p', 'employee-savings', { unlockOn: '2027-01-01', slow: true })], [line('p-l', 'p')])
    const per = setAccountType(pee, 'p', 'per').accounts[0]
    expect(per.unlockOn).toBeUndefined()
    expect(per.slow).toBeUndefined()
    const followed = profileOf([account('s', 'securities')], [line('s-l', 's', { kind: 'units', quoteSymbol: 'GLD' })])
    expect(setAccountType(followed, 's', 'gold').lines[0].quoteSymbol).toBeUndefined()
    expect(setAccountType(followed, 's', 'pea').lines[0].quoteSymbol).toBe('GLD')
  })
  it('a line that took the type’s category follows the new one, its chapter going with the old category', () => {
    const p = profileOf([account('a', 'life-insurance')], [line('fe', 'a', { kind: 'amount', group: 'euro-fund' })])
    const after = setAccountType(p, 'a', 'securities')
    expect(categoryOf(after.lines[0], after.accounts[0])).toBe('markets')
    expect(after.lines[0].group).toBeUndefined()
  })
  it('towards « Autre compte », which has no default, a line keeps its category, written', () => {
    const after = setAccountType(exampleProfile, 'livret-a', 'other')
    expect(find(after, 'livret-a-line').category).toBe('available')
  })
  it('refuses a type that is not offered', () => {
    expect(() => setAccountType(nicolas, 'pea', 'livret-a')).toThrow()
  })
})

describe('the bank of an account', () => {
  const twoBanks: Profile = {
    ...nicolas,
    establishments: [...nicolas.establishments, { id: 'bank', name: 'Crédit Agricole', kind: 'institution' }],
  }
  it('moves the whole account, whatever its number of lines', () => {
    expect(bankChoices(twoBanks, 'pea').map((e) => e.id)).toEqual(['linxea', 'bank'])
    const p = moveAccount(twoBanks, 'pea', 'bank')
    expect(p.accounts.find((a) => a.id === 'pea')!.establishmentId).toBe('bank')
  })
  it('a home never moves; a loan goes to a bank that lends', () => {
    expect(bankChoices(twoBanks, 'house')).toEqual([])
    expect(bankChoices(twoBanks, 'mortgage').map((e) => e.id)).toEqual(['boursobank', 'linxea', 'bank'])
    expect(() => moveAccount(twoBanks, 'pea', 'home')).toThrow()
  })
})

describe('a new account', () => {
  it('offers the types that accept the line in its bank, a PEA-PME among them', () => {
    const types = newAccountTypes(nicolas, 'villa')
    expect(types).toContain('pea-pme')
    expect(types).toContain('livret-a')
    expect(types).not.toContain('home')
    expect(types).not.toContain('loan')
    expect(newAccountTypes(nicolas, 'etf')).not.toContain('livret-a') // a line in parts
  })
  it('offers to take along the other open lines of the same account and category', () => {
    const closed = { ...nicolas, lines: nicolas.lines.map((l) => (l.id === 'brossolette' ? { ...l, closedOn: '2026-01-01' } : l)) }
    expect(newAccountCompanions(closed, 'villa').map((l) => l.id)).toEqual(['reaumur', 'structure'])
  })
  it('Nicolas’s case: four lines of a PEA into a new PEA-PME in the same bank, their category kept', () => {
    const p = moveToNewAccount(nicolas, ['villa', 'reaumur', 'structure', 'brossolette'], 'pea-pme', ' PEA-PME ', () => 'new')
    const created = p.accounts.find((a) => a.id === 'new')!
    expect(created).toEqual({ id: 'new', establishmentId: 'boursobank', type: 'pea-pme', name: 'PEA-PME' })
    for (const id of ['villa', 'reaumur', 'structure', 'brossolette']) {
      expect(find(p, id).accountId).toBe('new')
      expect(categoryOf(find(p, id), accountOfLine(p, id))).toBe('secured')
    }
    expect(find(p, 'etf').accountId).toBe('pea')
  })
  it('a line that took its account’s category keeps it, written, in an account of another default', () => {
    const p = moveToNewAccount(exampleProfile, ['euro-fund'], 'securities', 'Compte-titres', () => 'new')
    expect(find(p, 'euro-fund').category).toBe('secured')
  })
  it('a type that holds one line takes the line’s name and refuses a second', () => {
    const p = moveToNewAccount(nicolas, ['villa'], 'livret-a', 'ignored', () => 'new')
    expect(p.accounts.find((a) => a.id === 'new')!.name).toBe(find(nicolas, 'villa').name)
    expect(() => moveToNewAccount(nicolas, ['villa', 'reaumur'], 'livret-a', 'x', () => 'new')).toThrow()
  })
  it('refuses lines of another account, an empty name, a type not offered', () => {
    expect(() => moveToNewAccount(nicolas, ['villa', 'euro-fund'], 'pea-pme', 'x', () => 'new')).toThrow()
    expect(() => moveToNewAccount(nicolas, ['villa'], 'pea-pme', '  ', () => 'new')).toThrow()
    expect(() => moveToNewAccount(nicolas, ['villa'], 'home', 'x', () => 'new')).toThrow()
  })
})

// Found by the review of the branch (11 November 2026).
describe('slow marks that follow a move', () => {
  it('a line moved into a PER loses its own mark: the PER decides', async () => {
    const { moveLine } = await import('../profile-changes')
    const p: Profile = {
      ...nicolas,
      accounts: [...nicolas.accounts, account('per', 'per', { establishmentId: 'boursobank' })],
      lines: [...nicolas.lines, line('per-l', 'per', { kind: 'amount' }), line('per-2', 'per', { kind: 'amount' })],
    }
    expect(moveLine(setLineSlow(p, 'villa', true, 'line'), 'villa', 'per')).toSatisfy((after: Profile) => find(after, 'villa').slow === undefined)
  })
  it('a line slow by its account stays slow in its new account', () => {
    const slowPea = setLineSlow(nicolas, 'villa', true, 'account')
    const p = moveToNewAccount(slowPea, ['villa'], 'pea-pme', 'PEA-PME', () => 'new')
    expect(find(p, 'villa').slow).toBe(true)
  })
})
