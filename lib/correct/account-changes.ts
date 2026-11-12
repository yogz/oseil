// What a line's fiche corrects about its account, and quick or slow line by line
// (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md). Pure: no React, no database.

import { ACCOUNT_TYPES, MULTI_LINE_TYPES, canFollowPrice } from '@/lib/catalog'
import { categoryOf } from '@/lib/model/situation'
import type { Account, AccountTypeId, Line, Profile } from '@/lib/model/types'
import { canHold, findAccount, findLine, linesIn, mapAccount, mapLine, SLOW_BY_TYPE } from './profile-changes'

export { bankChoices, moveAccount } from './profile-changes'

// The types whose own rule says quick or slow: no line, no account mark contradicts them.
const DECIDED_BY_TYPE: readonly AccountTypeId[] = [...SLOW_BY_TYPE, 'employee-savings']
// Never chosen from a fiche, never left either: a home is property by its type, a loan a debt.
const FIXED: readonly AccountTypeId[] = ['home', 'loan']

const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const rest = { ...value }
  delete rest[key]
  return rest
}

export const slowDecidedByType = (type: AccountTypeId) => DECIDED_BY_TYPE.includes(type)

// A line's own answer, else its account's. Only for a type that does not decide it.
export const lineSlow = (line: Line, account: Account) => line.slow ?? account.slow === true

// « Récupérable en quelques semaines », for this line or (`scope` 'account') for its whole account,
// whose lines then lose their own answer. A line that says what its account says carries no mark.
export function setLineSlow(profile: Profile, lineId: string, slow: boolean, scope: 'line' | 'account'): Profile {
  const line = findLine(profile, lineId)
  const account = findAccount(profile, line.accountId)
  if (slowDecidedByType(account.type)) throw new Error('This account is quick or slow by its type')
  if (scope === 'account') {
    const marked = mapAccount(profile, account.id, (a) => (slow ? { ...a, slow: true } : without(a, 'slow')))
    return { ...marked, lines: marked.lines.map((l) => (l.accountId === account.id ? (without(l, 'slow') as Line) : l)) }
  }
  return mapLine(profile, lineId, (l) => (slow === (account.slow === true) ? (without(l, 'slow') as Line) : { ...l, slow }))
}

// Whether `type` can take every line of an account, closed ones too: their kind, their number.
function takes(type: AccountTypeId, lines: Line[]): boolean {
  if (FIXED.includes(type)) return false
  if (lines.length > 1 && !MULTI_LINE_TYPES.includes(type)) return false
  return lines.every((l) => ACCOUNT_TYPES[type].lineKinds.includes(l.kind))
}

const establishmentOf = (profile: Profile, account: Account) => {
  const establishment = profile.establishments.find((e) => e.id === account.establishmentId)
  if (!establishment) throw new Error(`Unknown establishment ${account.establishmentId}`)
  return establishment
}

const TYPE_IDS = Object.keys(ACCOUNT_TYPES) as AccountTypeId[]

// « Type du compte »: the other types that take all its lines in its bank. A home and a loan none.
export function accountTypeChoices(profile: Profile, accountId: string): AccountTypeId[] {
  const account = findAccount(profile, accountId)
  if (FIXED.includes(account.type)) return []
  const establishment = establishmentOf(profile, account)
  const lines = linesIn(profile, accountId)
  return TYPE_IDS.filter((t) => t !== account.type && canHold(establishment, t) && takes(t, lines))
}

// The new type, and what goes with it: the name when it was the old type's, what the new type does
// not carry. A line keeps its category where it had one written; one that followed the old type
// follows the new one, or keeps it, written, where the new type has none. A chapter goes with a category.
export function setAccountType(profile: Profile, accountId: string, type: AccountTypeId): Profile {
  if (!accountTypeChoices(profile, accountId).includes(type)) throw new Error(`Account ${accountId} cannot become ${type}`)
  const account = findAccount(profile, accountId)
  let changed: Account = { ...account, type }
  if (MULTI_LINE_TYPES.includes(account.type) && account.name === ACCOUNT_TYPES[account.type].label) {
    changed.name = ACCOUNT_TYPES[type].label
  }
  if (type !== 'employee-savings') changed = without(changed, 'unlockOn') as Account
  if (slowDecidedByType(type)) changed = without(changed, 'slow') as Account
  const lines = profile.lines.map((l): Line => {
    if (l.accountId !== accountId) return l
    let next: Line = { ...l }
    const before = categoryOf(l, account)
    if (next.category === undefined && ACCOUNT_TYPES[type].defaultCategory[l.kind] === undefined && before !== null) {
      next.category = before
    }
    if (categoryOf(next, changed) !== before) next = without(next, 'group') as Line
    if (next.quoteSymbol !== undefined && !canFollowPrice(type)) next = without(next, 'quoteSymbol') as Line
    if (slowDecidedByType(type)) next = without(next, 'slow') as Line
    return next
  })
  return { ...profile, accounts: profile.accounts.map((a) => (a.id === accountId ? changed : a)), lines }
}

// « + Un nouveau compte »: the types that would take this line, in its bank.
export function newAccountTypes(profile: Profile, lineId: string): AccountTypeId[] {
  const line = findLine(profile, lineId)
  const establishment = establishmentOf(profile, findAccount(profile, line.accountId))
  return TYPE_IDS.filter((t) => canHold(establishment, t) && takes(t, [line]))
}

// « Déplacer aussi »: the other open lines of the same account and the same category.
export function newAccountCompanions(profile: Profile, lineId: string): Line[] {
  const line = findLine(profile, lineId)
  const account = findAccount(profile, line.accountId)
  const category = categoryOf(line, account)
  return linesIn(profile, account.id).filter((l) => l.id !== lineId && l.closedOn === undefined && categoryOf(l, account) === category)
}

// A new account in the bank of the lines (all of one account, all open), the lines filed into it as
// « Où il est rangé » files one: a category is never changed silently. A type that holds one line
// takes its name, as everywhere.
export function moveToNewAccount(
  profile: Profile,
  lineIds: string[],
  type: AccountTypeId,
  name: string,
  newId: () => string = () => crypto.randomUUID(),
): Profile {
  if (lineIds.length === 0) throw new Error('No line to move')
  const lines = lineIds.map((id) => findLine(profile, id))
  const from = findAccount(profile, lines[0].accountId)
  if (lines.some((l) => l.accountId !== from.id || l.closedOn !== undefined)) throw new Error('Open lines of one account only')
  if (!newAccountTypes(profile, lines[0].id).includes(type) || !takes(type, lines)) throw new Error(`No new ${type} for these lines`)
  const multi = MULTI_LINE_TYPES.includes(type)
  const trimmed = multi ? name.trim() : lines[0].name
  if (trimmed === '') throw new Error('A name cannot be empty')
  const created: Account = { id: newId(), establishmentId: from.establishmentId, type, name: trimmed }
  let next: Profile = { ...profile, accounts: [...profile.accounts, created] }
  for (const line of lines) {
    const before = categoryOf(line, from)
    const wasSlow = !slowDecidedByType(from.type) && lineSlow(line, from)
    next = mapLine(next, line.id, (l) => {
      let moved: Line = { ...l, accountId: created.id }
      // Slow by its old account, it stays slow in the new one, which carries no mark.
      if (wasSlow) moved.slow = true
      if (moved.category === undefined && before !== null && categoryOf(moved, created) !== before) moved.category = before
      if (moved.quoteSymbol !== undefined && !canFollowPrice(type)) moved = without(moved, 'quoteSymbol') as Line
      if (slowDecidedByType(type)) moved = without(moved, 'slow') as Line
      return moved
    })
  }
  return next
}
