import type { Establishment, Profile } from '@/lib/model/types'
import { steps } from '@/lib/setup/first-launch'

const EMPLOYEE_SAVINGS = 'employee-savings'

// The banks the person can reorder or remove: not « Chez toi », not « Épargne salariale ».
const isBank = (e: Establishment) => e.kind === 'institution' && e.catalogId !== EMPLOYEE_SAVINGS
const banksInOrder = (profile: Profile) => steps(profile).filter(isBank)
const accountsIn = (profile: Profile, establishmentId: string) =>
  profile.accounts.filter((a) => a.establishmentId === establishmentId).length

function findBank(profile: Profile, establishmentId: string): Establishment {
  const bank = profile.establishments.find((e) => e.id === establishmentId)
  if (!bank) throw new Error(`Unknown establishment ${establishmentId}`)
  if (!isBank(bank)) throw new Error('This establishment is not a bank')
  return bank
}

export function addBank(
  profile: Profile,
  bank: { name: string; catalogId?: string },
  newId: () => string = () => crypto.randomUUID(),
): Profile {
  const name = bank.name.trim()
  if (name === '') throw new Error('A bank needs a name')
  if (bank.catalogId === EMPLOYEE_SAVINGS) throw new Error('The employee savings is not added as a bank')
  const same = profile.establishments.some((e) =>
    bank.catalogId !== undefined
      ? e.catalogId === bank.catalogId
      : e.kind === 'institution' && e.name.trim().toLowerCase() === name.toLowerCase(),
  )
  if (same) throw new Error(`${name} is already there`)
  const added: Establishment = {
    id: newId(),
    name,
    kind: 'institution',
    ...(bank.catalogId !== undefined ? { catalogId: bank.catalogId } : {}),
  }
  return { ...profile, establishments: [...profile.establishments, added] }
}

export const hasHome = (profile: Profile): boolean => profile.establishments.some((e) => e.kind === 'home')

// « Chez toi » after the first launch: the same name and kind as the first launch gives it, once only.
export function addHome(profile: Profile, newId: () => string = () => crypto.randomUUID()): Profile {
  if (hasHome(profile)) throw new Error('Chez toi is already there')
  const home: Establishment = { id: newId(), name: 'Chez toi', kind: 'home' }
  return { ...profile, establishments: [...profile.establishments, home] }
}

// « Chez toi » as a row of « Mes banques »: always first (its place is fixed), so no arrows; removable
// while it holds no account, like a bank.
export function homeRow(profile: Profile): { id: string; name: string; accounts: number; removable: boolean } | null {
  const home = profile.establishments.find((e) => e.kind === 'home')
  if (!home) return null
  const accounts = accountsIn(profile, home.id)
  return { id: home.id, name: home.name, accounts, removable: accounts === 0 }
}

export function removeHome(profile: Profile): Profile {
  const home = homeRow(profile)
  if (!home) throw new Error('There is no Chez toi')
  if (!home.removable) throw new Error('Chez toi still holds accounts')
  return withoutEstablishment(profile, home.id)
}

function withoutEstablishment(profile: Profile, establishmentId: string): Profile {
  const next: Profile = {
    ...profile,
    establishments: profile.establishments.filter((e) => e.id !== establishmentId),
  }
  if (!profile.firstLaunch) return next
  return {
    ...next,
    firstLaunch: {
      ...profile.firstLaunch,
      finished: profile.firstLaunch.finished.filter((id) => id !== establishmentId),
    },
  }
}

// Only a bank with no account at all: an account without a bank would be invalid, and the profile
// alone cannot tell whether an older snapshot still cites its lines.
export function removeBank(profile: Profile, establishmentId: string): Profile {
  findBank(profile, establishmentId)
  if (accountsIn(profile, establishmentId) > 0) throw new Error('This bank still holds accounts')
  return withoutEstablishment(profile, establishmentId)
}

export function moveBank(profile: Profile, establishmentId: string, direction: 'up' | 'down'): Profile {
  findBank(profile, establishmentId)
  const order = banksInOrder(profile)
  const at = order.findIndex((e) => e.id === establishmentId)
  const other = order[direction === 'up' ? at - 1 : at + 1]
  if (!other) throw new Error(`Cannot move ${direction}`)
  const list = [...profile.establishments]
  const i = list.findIndex((e) => e.id === establishmentId)
  const j = list.findIndex((e) => e.id === other.id)
  ;[list[i], list[j]] = [list[j], list[i]]
  return { ...profile, establishments: list }
}

export function bankRows(
  profile: Profile,
): Array<{ id: string; name: string; accounts: number; removable: boolean; canMoveUp: boolean; canMoveDown: boolean }> {
  const order = banksInOrder(profile)
  return order.map((e, i) => {
    const accounts = accountsIn(profile, e.id)
    return {
      id: e.id,
      name: e.name,
      accounts,
      removable: accounts === 0,
      canMoveUp: i > 0,
      canMoveDown: i < order.length - 1,
    }
  })
}
