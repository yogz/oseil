import { describe, expect, it } from 'vitest'
import { exampleProfile } from '@/lib/model/__tests__/fixtures'
import { parseProfile } from '@/lib/model/documents'
import type { Profile } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'
import { addBank, addHome, bankRows, hasHome, homeRow, moveBank, removeBank, removeHome } from '../banks'

const ids = (p: Profile) => steps(p).map((e) => e.id)
let n = 0
const newId = () => `new-${++n}`

const base: Profile = {
  schema: 1,
  establishments: [
    { id: 'home', name: 'Chez toi', kind: 'home' },
    { id: 'a', name: 'A', kind: 'institution' },
    { id: 'b', name: 'B', kind: 'institution', catalogId: 'lcl' },
    { id: 'c', name: 'C', kind: 'institution' },
    { id: 'emp', name: 'Épargne salariale', kind: 'institution', catalogId: 'employee-savings' },
  ],
  accounts: [{ id: 'acc', establishmentId: 'b', type: 'current', name: 'Compte' }],
  lines: [{ id: 'l', accountId: 'acc', name: 'Compte', kind: 'amount', currency: 'EUR', closedOn: '2026-01-01' }],
  firstLaunch: { planned: ['employee-savings'], finished: ['a', 'b'], complete: false },
}

describe('addBank', () => {
  it('adds an institution after the other banks, before the employee savings', () => {
    const next = addBank(base, { name: 'Fortuneo', catalogId: 'fortuneo' }, newId)
    const added = next.establishments.find((e) => e.catalogId === 'fortuneo')!
    expect(ids(next)).toEqual(['home', 'a', 'b', 'c', added.id, 'emp'])
    expect(added).toMatchObject({ name: 'Fortuneo', kind: 'institution' })
    expect(parseProfile(next)).not.toBeNull()
    expect(base.establishments).toHaveLength(5)
  })
  it('refuses a catalog bank already present, a duplicate name, an empty name and the employee savings', () => {
    expect(() => addBank(base, { name: 'LCL', catalogId: 'lcl' }, newId)).toThrow()
    expect(() => addBank(base, { name: ' a ' }, newId)).toThrow()
    expect(() => addBank(base, { name: '  ' }, newId)).toThrow()
    expect(() => addBank(base, { name: 'X', catalogId: 'employee-savings' }, newId)).toThrow()
  })
})

describe('addHome', () => {
  const noHome: Profile = { ...base, establishments: base.establishments.filter((e) => e.kind !== 'home') }
  it('adds « Chez toi » as the first step, the same name and kind as the first launch', () => {
    const next = addHome(noHome, newId)
    const added = next.establishments.find((e) => e.kind === 'home')!
    expect(added).toEqual({ id: added.id, name: 'Chez toi', kind: 'home' })
    expect(ids(next)[0]).toBe(added.id)
    expect(parseProfile(next)).not.toBeNull()
    expect(noHome.establishments).toHaveLength(4)
  })
  it('throws when « Chez toi » is already there', () => {
    expect(() => addHome(base, newId)).toThrow()
    expect(() => addHome(addHome(noHome, newId), newId)).toThrow()
  })
  it('hasHome tells whether « Chez toi » exists', () => {
    expect(hasHome(base)).toBe(true)
    expect(hasHome(noHome)).toBe(false)
  })
})

describe('removeBank', () => {
  it('removes an empty bank and forgets it in firstLaunch.finished', () => {
    const next = removeBank(base, 'a')
    expect(next.establishments.map((e) => e.id)).not.toContain('a')
    expect(next.firstLaunch?.finished).toEqual(['b'])
    expect(parseProfile(next)).not.toBeNull()
  })
  it('refuses a bank that holds an open account (Review Focus 5)', () => {
    const open: Profile = { ...base, lines: [{ id: 'l', accountId: 'acc', name: 'Compte', kind: 'amount', currency: 'EUR' }] }
    expect(() => removeBank(open, 'b')).toThrow()
  })
  it('refuses a bank whose accounts are all closed, since they would be left without a bank', () => {
    expect(() => removeBank(base, 'b')).toThrow()
  })
  it('never removes Chez toi, the employee savings or an unknown id', () => {
    expect(() => removeBank(base, 'home')).toThrow()
    expect(() => removeBank(base, 'emp')).toThrow()
    expect(() => removeBank(base, 'nope')).toThrow()
  })
})

describe('moveBank', () => {
  it('changes the order seen by steps()', () => {
    expect(ids(moveBank(base, 'c', 'up'))).toEqual(['home', 'a', 'c', 'b', 'emp'])
    expect(ids(moveBank(base, 'a', 'down'))).toEqual(['home', 'b', 'a', 'c', 'emp'])
    expect(parseProfile(moveBank(base, 'c', 'up'))).not.toBeNull()
  })
  it('refuses to go past either end, and never moves Chez toi or the employee savings', () => {
    expect(() => moveBank(base, 'a', 'up')).toThrow()
    expect(() => moveBank(base, 'c', 'down')).toThrow()
    expect(() => moveBank(base, 'home', 'down')).toThrow()
    expect(() => moveBank(base, 'emp', 'up')).toThrow()
  })
  it('works when the employee savings sits first in the stored list', () => {
    const odd: Profile = { ...base, establishments: [base.establishments[4], ...base.establishments.slice(0, 4)] }
    expect(ids(moveBank(odd, 'c', 'up'))).toEqual(['home', 'a', 'c', 'b', 'emp'])
  })
})

describe('homeRow and removeHome', () => {
  const noHome: Profile = { ...base, establishments: base.establishments.filter((e) => e.kind !== 'home') }
  const holding: Profile = {
    ...base,
    accounts: [...base.accounts, { id: 'gold', establishmentId: 'home', type: 'gold', name: 'Or' }],
  }
  it('homeRow lists « Chez toi » with its accounts, removable while it holds none; null without it', () => {
    expect(homeRow(base)).toEqual({ id: 'home', name: 'Chez toi', accounts: 0, removable: true })
    expect(homeRow(holding)).toEqual({ id: 'home', name: 'Chez toi', accounts: 1, removable: false })
    expect(homeRow(noHome)).toBeNull()
  })
  it('removes an empty « Chez toi », and forgets it in firstLaunch.finished', () => {
    const finished: Profile = { ...base, firstLaunch: { planned: [], finished: ['home', 'a'], complete: false } }
    const next = removeHome(finished)
    expect(hasHome(next)).toBe(false)
    expect(next.firstLaunch?.finished).toEqual(['a'])
    expect(parseProfile(next)).not.toBeNull()
  })
  it('refuses « Chez toi » while it holds an account, and a profile without it', () => {
    expect(() => removeHome(holding)).toThrow()
    expect(() => removeHome(noHome)).toThrow()
  })
  it('bankRows still leaves « Chez toi » out', () => {
    expect(bankRows(base).map((r) => r.id)).not.toContain('home')
  })
})

describe('bankRows', () => {
  it('lists the banks in steps() order with their flags', () => {
    expect(bankRows(base)).toEqual([
      { id: 'a', name: 'A', accounts: 0, removable: true, canMoveUp: false, canMoveDown: true },
      { id: 'b', name: 'B', accounts: 1, removable: false, canMoveUp: true, canMoveDown: true },
      { id: 'c', name: 'C', accounts: 0, removable: true, canMoveUp: true, canMoveDown: false },
    ])
  })
  it('leaves out Chez toi and the employee savings', () => {
    expect(bankRows(exampleProfile).map((r) => r.id)).toEqual(['boursobank', 'linxea'])
  })
})
